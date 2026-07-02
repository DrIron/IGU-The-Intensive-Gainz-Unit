-- P5 backfill driver: loop active legacy programs not yet promoted, call the
-- per-program RPC, return a summary. Incremental + restartable (idempotent RPC).
CREATE OR REPLACE FUNCTION public.backfill_all_active_client_programs()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_cp        record;
  v_res       jsonb;
  v_results   jsonb := '[]'::jsonb;
  v_done      int := 0;
  v_skipped   int := 0;
BEGIN
  IF v_uid IS NOT NULL AND NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'Not authorised: backfill driver requires admin or service_role'
      USING ERRCODE = '42501';
  END IF;

  FOR v_cp IN
    SELECT cp.id
    FROM public.client_programs cp
    WHERE cp.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM public.plan p WHERE p.source_client_program_id = cp.id)
    ORDER BY cp.created_at
  LOOP
    v_res := public.backfill_client_program(v_cp.id);
    v_results := v_results || jsonb_build_array(v_res);
    IF COALESCE((v_res->>'skipped')::boolean, false) THEN
      v_skipped := v_skipped + 1;
    ELSE
      v_done := v_done + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('backfilled', v_done, 'skipped', v_skipped, 'results', v_results);
END;
$function$;

REVOKE ALL ON FUNCTION public.backfill_all_active_client_programs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backfill_all_active_client_programs() FROM anon;
GRANT EXECUTE ON FUNCTION public.backfill_all_active_client_programs() TO service_role;

-- Admin EXECUTE on both (the in-function is_admin check is the real gate).
GRANT EXECUTE ON FUNCTION public.backfill_client_program(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_all_active_client_programs() TO authenticated;
