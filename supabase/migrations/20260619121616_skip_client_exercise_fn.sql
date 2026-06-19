-- Skip (or un-skip) a single exercise in a client's workout. SECURITY DEFINER,
-- auth-gated to the exercise's client / owning coach / admin. p_skipped=false
-- clears the flag so the client can undo.
CREATE OR REPLACE FUNCTION public.skip_client_exercise(p_cme_id uuid, p_skipped boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller      uuid := auth.uid();
  v_client_id   uuid;
  v_owner_coach uuid;
BEGIN
  v_client_id := public.get_client_from_module_exercise(p_cme_id);

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Exercise not found' USING ERRCODE = '42704';
  END IF;

  SELECT cdm.module_owner_coach_id
    INTO v_owner_coach
  FROM public.client_module_exercises cme
  JOIN public.client_day_modules cdm ON cdm.id = cme.client_day_module_id
  WHERE cme.id = p_cme_id;

  IF v_caller IS NOT NULL
     AND v_caller <> v_client_id
     AND v_caller <> v_owner_coach
     AND NOT public.is_admin(v_caller)
  THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  UPDATE public.client_module_exercises
     SET skipped = p_skipped,
         skipped_at = CASE WHEN p_skipped THEN now() ELSE NULL END
   WHERE id = p_cme_id;

  RETURN jsonb_build_object('cme_id', p_cme_id, 'skipped', p_skipped);
END;
$function$;
