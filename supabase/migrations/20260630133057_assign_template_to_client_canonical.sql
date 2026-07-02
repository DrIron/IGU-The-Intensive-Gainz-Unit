-- P5 write cutover: canonical-PRIMARY 1:1 assignment with no legacy client_programs row.
-- assign_plan_to_client requires an existing client_programs row (it reads it), so it
-- can only mirror. This standalone variant resolves the template's canonical plan
-- (muscle_program_templates.converted_program_id -> plan.source_muscle_template_id,
-- same as assign_plan_to_client), clones it (assignee owns their copy), and inserts the
-- assignment directly. Returns skipped/no_mirror_plan when the template was never
-- materialised to a canonical plan (caller falls back to legacy).
CREATE OR REPLACE FUNCTION public.assign_template_to_client_canonical(
  p_coach_id uuid,
  p_client_id uuid,
  p_subscription_id uuid,
  p_template_id uuid,
  p_start_date date,
  p_team_id uuid DEFAULT NULL,
  p_macrocycle_id uuid DEFAULT NULL,
  p_timezone text DEFAULT 'UTC'
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid           uuid := auth.uid();
  v_plan_id       uuid;
  v_clone         uuid;
  v_assignment_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  -- admin, OR the assigning coach themselves, OR the client's primary coach.
  IF NOT public.is_admin(v_uid)
     AND v_uid <> p_coach_id
     AND NOT public.is_primary_coach_for_user(v_uid, p_client_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  -- Resolve the template's canonical plan (newest), same path as assign_plan_to_client.
  SELECT p.id INTO v_plan_id
  FROM public.plan p
  JOIN public.muscle_program_templates m ON m.id = p.source_muscle_template_id
  WHERE m.converted_program_id = p_template_id
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_mirror_plan',
                              'assignment_id', NULL, 'plan_id', NULL);
  END IF;

  -- Own-your-copy: clone the template plan so the assignee owns a frozen copy.
  v_clone := public.clone_plan(v_plan_id);

  INSERT INTO public.client_plan_assignment (
    client_id, subscription_id, plan_id, macrocycle_id,
    primary_coach_id, team_id, start_date, status, timezone
  ) VALUES (
    p_client_id, p_subscription_id, v_clone, p_macrocycle_id,
    p_coach_id, p_team_id, p_start_date, 'active',
    COALESCE(NULLIF(p_timezone, ''), 'UTC')
  )
  RETURNING id INTO v_assignment_id;

  RETURN jsonb_build_object(
    'skipped', false,
    'assignment_id', v_assignment_id,
    'plan_id', v_clone,
    'source_template_plan_id', v_plan_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_template_to_client_canonical(uuid,uuid,uuid,uuid,date,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_template_to_client_canonical(uuid,uuid,uuid,uuid,date,uuid,uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_template_to_client_canonical(uuid,uuid,uuid,uuid,date,uuid,uuid,text) TO authenticated;
