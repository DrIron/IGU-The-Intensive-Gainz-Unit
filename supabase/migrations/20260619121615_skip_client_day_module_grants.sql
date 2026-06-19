-- Scope skip_client_day_module to authenticated callers (client/coach/admin call
-- it directly from the app). CLAUDE.md "SECURITY DEFINER RPCs -- mandatory REVOKE pattern".
REVOKE ALL ON FUNCTION public.skip_client_day_module(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.skip_client_day_module(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.skip_client_day_module(uuid) TO authenticated;
