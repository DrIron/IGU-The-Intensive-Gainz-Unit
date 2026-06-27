-- Program system unification — P2: dual-write the canonical client_plan_assignment
-- on a 1:1 program assignment, alongside the legacy client_programs deep-copy. See
-- docs/PROGRAM_SYSTEM_UNIFICATION_BUILD_PLAN.md §P2.
--
-- Best-effort MIRROR like P1: the legacy assign_program_to_client deep-copy stays
-- authoritative. The TS caller (src/lib/assignProgram.ts) invokes this fire-and-forget
-- AFTER the legacy RPC succeeds, only for the 1:1 path (teamId absent). A failure here
-- never blocks the assignment.
--
-- Input is the legacy client_programs.id just created, so every mirrored field is copied
-- straight from the authoritative row (no re-derivation): client/subscription/coach/team/
-- macrocycle/start_date and status (client_programs.status and client_plan_assignment.status
-- share the client_program_status enum — identity mapping, active/paused/ended).
--
-- plan_id resolves the P1 mirror plan via the muscle<->converted-program dedupe:
--   client_programs.source_template_id (a program_templates.id)
--     -> muscle_program_templates.converted_program_id
--     -> plan.source_muscle_template_id
-- If no mirror plan exists yet (template never opened/saved in the Planning Board since P1),
-- skip best-effort and return reason 'no_mirror_plan'. P5 backfill + the soak fill the gaps.
CREATE OR REPLACE FUNCTION public.assign_plan_to_client(p_client_program_id uuid, p_timezone text DEFAULT 'UTC')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid           uuid := auth.uid();
  v_cp            RECORD;
  v_plan_id       uuid;
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

  INSERT INTO public.client_plan_assignment (
    client_id, subscription_id, plan_id, macrocycle_id,
    primary_coach_id, team_id, start_date, status, timezone
  ) VALUES (
    v_cp.user_id, v_cp.subscription_id, v_plan_id, v_cp.macrocycle_id,
    v_cp.primary_coach_id, v_cp.team_id, v_cp.start_date, v_cp.status,
    COALESCE(NULLIF(p_timezone, ''), 'UTC')
  )
  RETURNING id INTO v_assignment_id;

  RETURN jsonb_build_object('skipped', false, 'assignment_id', v_assignment_id, 'plan_id', v_plan_id);
END;
$function$;
