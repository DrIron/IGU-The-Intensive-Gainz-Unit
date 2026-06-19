-- Mark a whole workout/day as skipped. Mirrors complete_client_day_module:
-- SECURITY DEFINER, auth-gated to the module's client / owning coach / admin
-- (NULL caller = service_role passes the existence check). Idempotent.
CREATE OR REPLACE FUNCTION public.skip_client_day_module(p_module_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller       uuid := auth.uid();
  v_client_id    uuid;
  v_owner_coach  uuid;
  v_old_status   text;
  v_skipped_at   timestamptz;
BEGIN
  SELECT public.get_client_from_program_day(cdm.client_program_day_id),
         cdm.module_owner_coach_id,
         cdm.status
    INTO v_client_id, v_owner_coach, v_old_status
  FROM public.client_day_modules cdm
  WHERE cdm.id = p_module_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Module not found' USING ERRCODE = '42704';
  END IF;

  IF v_caller IS NOT NULL
     AND v_caller <> v_client_id
     AND v_caller <> v_owner_coach
     AND NOT public.is_admin(v_caller)
  THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  IF v_old_status = 'skipped' THEN
    SELECT skipped_at INTO v_skipped_at FROM public.client_day_modules WHERE id = p_module_id;
    RETURN jsonb_build_object('module_id', p_module_id, 'status', 'skipped', 'skipped_at', v_skipped_at, 'noop', true);
  END IF;

  v_skipped_at := now();

  UPDATE public.client_day_modules
     SET status = 'skipped', skipped_at = v_skipped_at
   WHERE id = p_module_id;

  RETURN jsonb_build_object('module_id', p_module_id, 'status', 'skipped', 'skipped_at', v_skipped_at, 'noop', false);
END;
$function$;
