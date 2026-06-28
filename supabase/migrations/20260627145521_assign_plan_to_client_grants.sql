-- Scope assign_plan_to_client to authenticated callers (the coach dual-writes the
-- canonical assignment right after the legacy assign). CLAUDE.md "SECURITY DEFINER RPCs
-- -- mandatory REVOKE pattern". The in-function auth.uid() + primary-coach check is
-- defense-in-depth. Match the exact identity-args signature (uuid, text).
REVOKE ALL ON FUNCTION public.assign_plan_to_client(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_plan_to_client(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_plan_to_client(uuid, text) TO authenticated;
