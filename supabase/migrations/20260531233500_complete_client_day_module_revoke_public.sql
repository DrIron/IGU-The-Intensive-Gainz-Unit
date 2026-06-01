-- Remediation for migration 20260531232132_complete_client_day_module_rpc.sql
--
-- That migration shipped only `GRANT EXECUTE ... TO authenticated`, leaving the
-- Postgres-default PUBLIC execute grant (and Supabase's anon grant) in place.
-- Live probe on prod (2026-05-31) confirmed an UNAUTHENTICATED caller could
-- complete a client's workout by module UUID, because the function body passes
-- a NULL auth.uid() straight through its auth gate. The original migration was
-- already applied to remote, so editing it cannot re-run there -- this
-- append-only migration revokes the over-broad grants on every environment.

REVOKE ALL ON FUNCTION public.complete_client_day_module(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_client_day_module(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_client_day_module(uuid) TO authenticated;
