CREATE OR REPLACE FUNCTION public.assign_plan_to_client_canonical(
  p_coach_id uuid, p_client_id uuid, p_subscription_id uuid, p_plan_id uuid,
  p_start_date date DEFAULT CURRENT_DATE, p_team_id uuid DEFAULT NULL, p_macrocycle_id uuid DEFAULT NULL, p_timezone text DEFAULT 'UTC')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_owner uuid; v_kind text; v_clone uuid; v_assignment_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  SELECT owner_coach_id, kind INTO v_owner, v_kind FROM public.plan WHERE id=p_plan_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'plan % not found', p_plan_id USING ERRCODE='42704'; END IF;
  IF v_kind <> 'template' THEN RAISE EXCEPTION 'assign_plan_to_client_canonical requires a template plan (got kind=%)', v_kind USING ERRCODE='42501'; END IF;
  IF NOT public.is_admin(v_uid) AND v_uid <> v_owner AND NOT public.is_primary_coach_for_user(v_uid, p_client_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  v_clone := public.clone_plan(p_plan_id);
  INSERT INTO public.client_plan_assignment (client_id, subscription_id, plan_id, macrocycle_id, primary_coach_id, team_id, start_date, status, timezone)
  VALUES (p_client_id, p_subscription_id, v_clone, p_macrocycle_id, COALESCE(p_coach_id, v_owner), p_team_id, p_start_date, 'active', COALESCE(NULLIF(p_timezone,''),'UTC'))
  RETURNING id INTO v_assignment_id;
  RETURN jsonb_build_object('skipped',false,'assignment_id',v_assignment_id,'plan_id',v_clone,'source_template_plan_id',p_plan_id,'cloned',true);
END; $function$;

REVOKE ALL ON FUNCTION public.assign_plan_to_client_canonical(uuid,uuid,uuid,uuid,date,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_plan_to_client_canonical(uuid,uuid,uuid,uuid,date,uuid,uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_plan_to_client_canonical(uuid,uuid,uuid,uuid,date,uuid,uuid,text) TO authenticated, service_role;
