-- Scope skip_client_exercise to authenticated callers. CLAUDE.md REVOKE pattern.
REVOKE ALL ON FUNCTION public.skip_client_exercise(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.skip_client_exercise(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.skip_client_exercise(uuid, boolean) TO authenticated;
