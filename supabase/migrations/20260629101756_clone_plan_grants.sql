-- S1 REVOKE/GRANT for clone_plan, isolated from the CREATE FUNCTION def and
-- wrapped in a DO block as dynamic SQL (CLI splitter gotcha,
-- feedback_supabase_cli_dollar_quote_splitter). Scoped to authenticated only —
-- the in-function auth.uid() + coach/admin gate is defense-in-depth, not a
-- substitute (feedback_supabase_default_grants_to_anon).
DO $do$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.clone_plan(uuid) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.clone_plan(uuid) FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.clone_plan(uuid) TO authenticated';
END
$do$;
