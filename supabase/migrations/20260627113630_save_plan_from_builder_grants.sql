-- Scope save_plan_from_builder to authenticated callers (the coach mirrors their own
-- template from the Planning Board). CLAUDE.md "SECURITY DEFINER RPCs -- mandatory
-- REVOKE pattern". The in-function auth.uid() ownership check is defense-in-depth.
REVOKE ALL ON FUNCTION public.save_plan_from_builder(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_plan_from_builder(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_plan_from_builder(uuid, jsonb) TO authenticated;
