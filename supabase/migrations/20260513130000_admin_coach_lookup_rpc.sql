-- AdminBillingManager.tsx ships in the client bundle and hardcodes
-- 'dr.ironofficial@gmail.com' to look up the IGU admin coach's user_id
-- when toggling payment-exempt on a client. The email is therefore
-- visible to anyone who downloads the production JS.
--
-- Move the lookup into a SECURITY DEFINER RPC so the frontend just asks
-- "who's the default admin coach?" without ever seeing the email.

CREATE OR REPLACE FUNCTION public.get_default_admin_coach_user_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Admin-only: prevents probing the admin coach identity from outside.
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'permission denied: admin only';
  END IF;

  -- Canonical IGU admin coach. Same pattern as create-manual-client:
  -- email on coaches_private (PII split, see migration 20260117164058);
  -- user_id joins to coaches for the status check (lifecycle home
  -- post-Phase-1 coach column refactor per CLAUDE.md).
  SELECT c.user_id INTO v_user_id
  FROM public.coaches_private cpriv
  JOIN public.coaches c ON c.user_id = cpriv.user_id
  WHERE cpriv.email = 'dr.ironofficial@gmail.com'
    AND c.status = 'approved'
  LIMIT 1;

  RETURN v_user_id;  -- NULL if not configured; callers must handle.
END;
$$;

REVOKE ALL ON FUNCTION public.get_default_admin_coach_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_default_admin_coach_user_id() TO authenticated;

COMMENT ON FUNCTION public.get_default_admin_coach_user_id() IS
  'Returns user_id of the canonical IGU admin coach (status=approved). Admin-only. Used by frontend AdminBillingManager to avoid leaking the admin email into the client bundle.';
