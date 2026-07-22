CREATE OR REPLACE FUNCTION public.delete_template_plan(p_plan_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_owner uuid; v_kind text; v_assigned int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  SELECT owner_coach_id, kind INTO v_owner, v_kind FROM public.plan WHERE id=p_plan_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'plan % not found', p_plan_id USING ERRCODE='42704'; END IF;
  IF v_kind <> 'template' THEN RAISE EXCEPTION 'delete_template_plan only archives template plans (got kind=%)', v_kind USING ERRCODE='42501'; END IF;
  IF NOT public.is_admin(v_uid) AND v_uid <> v_owner THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  SELECT count(*) INTO v_assigned FROM public.client_plan_assignment cpa JOIN public.plan cl ON cl.id=cpa.plan_id
    WHERE cl.source_template_plan_id=p_plan_id AND cpa.status='active'::public.client_program_status;
  UPDATE public.plan SET is_active=false, updated_at=now() WHERE id=p_plan_id;
  RETURN jsonb_build_object('plan_id',p_plan_id,'archived',true,'active_client_copies',v_assigned);
END; $function$;

REVOKE ALL ON FUNCTION public.delete_template_plan(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_template_plan(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_template_plan(uuid) TO authenticated, service_role;
