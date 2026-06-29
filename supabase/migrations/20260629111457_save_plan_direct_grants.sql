-- S2 REVOKE/GRANT for save_plan_direct, isolated from the CREATE FUNCTION def and
-- wrapped in a DO block as dynamic SQL (CLI splitter gotcha,
-- feedback_supabase_cli_dollar_quote_splitter). Scoped to authenticated only —
-- the in-function owner/admin + kind='client_frozen' gate is defense-in-depth, not
-- a substitute (feedback_supabase_default_grants_to_anon).
DO $do$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.save_plan_direct(uuid, jsonb) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.save_plan_direct(uuid, jsonb) FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.save_plan_direct(uuid, jsonb) TO authenticated';
END
$do$;
