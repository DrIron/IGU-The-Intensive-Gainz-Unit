-- Scope save_client_plan_override to authenticated callers (the coach edits one client's plan
-- from the program editor). CLAUDE.md "SECURITY DEFINER RPCs -- mandatory REVOKE pattern".
-- The in-function auth.uid() + primary-coach/admin check is defense-in-depth.
REVOKE ALL ON FUNCTION public.save_client_plan_override(uuid, text, uuid, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_client_plan_override(uuid, text, uuid, jsonb, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_client_plan_override(uuid, text, uuid, jsonb, boolean) TO authenticated;
