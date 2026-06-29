-- Teams canonical model — T1 REVOKE/GRANT for assign_team_plan, isolated from
-- the CREATE FUNCTION def and wrapped in a DO block as dynamic SQL. The CLI
-- statement splitter (v2.78.1) merges a function body with trailing REVOKE/GRANT
-- into one prepared statement -> 42601; a DO block is one statement it cannot
-- fragment (feedback_supabase_cli_dollar_quote_splitter). Scopes the RPC to
-- authenticated only — Supabase grants EXECUTE to anon+authenticated by default
-- (feedback_supabase_default_grants_to_anon); the in-function auth.uid() gate is
-- defense-in-depth, not a substitute.
DO $do$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.assign_team_plan(uuid, uuid, date) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.assign_team_plan(uuid, uuid, date) FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.assign_team_plan(uuid, uuid, date) TO authenticated';
END
$do$;
