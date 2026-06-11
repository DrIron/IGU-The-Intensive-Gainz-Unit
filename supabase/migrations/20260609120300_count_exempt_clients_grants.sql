-- Scope EXECUTE on count_active_exempt_clients_for_coach. Supabase grants anon +
-- authenticated by default; revoke first, then grant only authenticated (coach
-- UI) + service_role (create-manual-client). See CLAUDE.md "SECURITY DEFINER
-- RPCs -- mandatory REVOKE pattern".
REVOKE ALL ON FUNCTION public.count_active_exempt_clients_for_coach(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_active_exempt_clients_for_coach(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.count_active_exempt_clients_for_coach(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_active_exempt_clients_for_coach(uuid) TO service_role;
