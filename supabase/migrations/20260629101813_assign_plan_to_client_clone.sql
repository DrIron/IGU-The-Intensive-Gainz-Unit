-- Own-your-copy assignment model — S1 rewire of the 1:1 mirror (ADDITIVE/safe).
-- See docs/PROGRAM_ASSIGNMENT_SYNC.md §S1.
--
-- Adds p_clone (board_v2 gate, default false). The caller (assignProgram.ts)
-- passes isBoardV2Enabled():
--   * p_clone = false (prod default): UNCHANGED legacy reference behavior —
--     assignment.plan_id = the template's mirror plan (shared).
--   * p_clone = true (board_v2 on): clone-on-assign — deep-copy the template
--     plan into a caller-owned clone (clone_plan) and point the assignment at
--     the CLONE. The client owns their copy; editing it never touches the
--     template (S2). client_plan_overrides is NOT written either way (S2/S3
--     retire it; this slice just stops needing it for cloned assignments).
--
-- Replaces the 2-arg overload with a 3-arg one whose new param defaults, so
-- existing 2-arg callers keep resolving (Postgres fills the default). DROP first
-- because CREATE OR REPLACE cannot change a signature.
DROP FUNCTION IF EXISTS public.assign_plan_to_client(uuid, text);

CREATE OR REPLACE FUNCTION public.assign_plan_to_client(
  p_client_program_id uuid,
  p_timezone text DEFAULT 'UTC',
  p_clone boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid           uuid := auth.uid();
  v_cp            RECORD;
  v_plan_id       uuid;
  v_assign_plan   uuid;
  v_assignment_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  SELECT user_id, subscription_id, primary_coach_id, source_template_id,
         start_date, status, team_id, macrocycle_id
    INTO v_cp
  FROM public.client_programs
  WHERE id = p_client_program_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'client_program % not found', p_client_program_id USING ERRCODE = '42704';
  END IF;

  -- Same access set as assign_program_to_client: admin or the client's primary coach.
  IF NOT public.is_admin(v_uid)
     AND v_uid <> v_cp.primary_coach_id
     AND NOT public.is_primary_coach_for_user(v_uid, v_cp.user_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  -- Resolve the P1 mirror plan from the converted program template.
  SELECT p.id INTO v_plan_id
  FROM public.plan p
  JOIN public.muscle_program_templates m ON m.id = p.source_muscle_template_id
  WHERE m.converted_program_id = v_cp.source_template_id
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_mirror_plan',
                              'assignment_id', NULL, 'plan_id', NULL);
  END IF;

  -- S1: own-your-copy. Under board_v2 the assignment follows a CLONE of the
  -- template; otherwise the legacy shared reference. clone_plan stamps
  -- source_template_plan_id = v_plan_id and owns the copy as the caller.
  IF p_clone THEN
    v_assign_plan := public.clone_plan(v_plan_id);
  ELSE
    v_assign_plan := v_plan_id;
  END IF;

  INSERT INTO public.client_plan_assignment (
    client_id, subscription_id, plan_id, macrocycle_id,
    primary_coach_id, team_id, start_date, status, timezone
  ) VALUES (
    v_cp.user_id, v_cp.subscription_id, v_assign_plan, v_cp.macrocycle_id,
    v_cp.primary_coach_id, v_cp.team_id, v_cp.start_date, v_cp.status,
    COALESCE(NULLIF(p_timezone, ''), 'UTC')
  )
  RETURNING id INTO v_assignment_id;

  RETURN jsonb_build_object(
    'skipped', false,
    'assignment_id', v_assignment_id,
    'plan_id', v_assign_plan,
    'cloned', p_clone,
    'source_template_plan_id', CASE WHEN p_clone THEN v_plan_id ELSE NULL END
  );
END;
$function$;
