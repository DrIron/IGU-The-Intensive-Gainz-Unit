-- complete_client_day_module RPC (P0 launch blocker)
--
-- Clients have NO RLS UPDATE path on client_day_modules. The "client_day_modules_update"
-- policy USING/WITH CHECK is:
--   ( is_admin(auth.uid()) OR module_owner_coach_id = auth.uid() )
-- so a client completing their OWN workout silently no-ops (HTTP 200, 0 rows,
-- status stuck on 'scheduled' forever). It went unnoticed because prod has been
-- driven by an admin (1 module).
--
-- PR #117 added a rows-affected check on the FE that correctly DETECTS the
-- failure, but it could not fix the underlying capability gap from inside the
-- client. This RPC is the structural fix: it runs SECURITY DEFINER, authorises
-- the caller itself (client / owning coach / admin / service_role) and raises
-- explicitly on failure rather than silently affecting zero rows.

CREATE OR REPLACE FUNCTION public.complete_client_day_module(
  p_module_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller        uuid := auth.uid();
  v_client_id     uuid;
  v_owner_coach   uuid;
  v_old_status    text;
  v_completed_at  timestamptz;
BEGIN
  -- Hard short-circuit: NULL auth.uid() means service_role or migration tx.
  -- Allow through (per memory/feedback_trigger_auth_uid_null_branch.md). No
  -- current edge fn calls this, but defense-in-depth + matches PR #128's
  -- trigger pattern.
  IF v_caller IS NULL THEN
    -- Service role still subject to the explicit existence check below.
    NULL;
  END IF;

  -- Lock the module row and capture identity.
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

  -- Auth gate: caller is the module's client, the owning coach, admin,
  -- OR service_role (NULL caller passed through above).
  IF v_caller IS NOT NULL
     AND v_caller <> v_client_id
     AND v_caller <> v_owner_coach
     AND NOT public.is_admin(v_caller)
  THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  -- Idempotent: if already completed, return the existing completed_at.
  IF v_old_status = 'completed' THEN
    SELECT completed_at INTO v_completed_at
    FROM public.client_day_modules
    WHERE id = p_module_id;
    RETURN jsonb_build_object(
      'module_id', p_module_id,
      'status', 'completed',
      'completed_at', v_completed_at,
      'noop', true
    );
  END IF;

  v_completed_at := now();

  UPDATE public.client_day_modules
     SET status = 'completed',
         completed_at = v_completed_at
   WHERE id = p_module_id;

  RETURN jsonb_build_object(
    'module_id', p_module_id,
    'status', 'completed',
    'completed_at', v_completed_at,
    'noop', false
  );
END;
$$;

-- Postgres GRANTs EXECUTE to PUBLIC by default on every new function, and
-- Supabase's default privileges additionally grant anon/authenticated/
-- service_role. `GRANT ... TO authenticated` does NOT remove the PUBLIC/anon
-- grants. Without the REVOKE below, an UNAUTHENTICATED caller (auth.uid() =
-- NULL) reaches the body, passes the NULL short-circuit, and can complete any
-- client's workout by module UUID. REVOKE the broad grants, then grant EXECUTE
-- only to authenticated (least privilege -- no edge fn or cron calls this
-- today; the body's NULL-caller branch is defense-in-depth, not a live path).
REVOKE ALL ON FUNCTION public.complete_client_day_module(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_client_day_module(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_client_day_module(uuid) TO authenticated;
