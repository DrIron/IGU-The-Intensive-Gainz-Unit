-- Teams T3 — REVOKE/GRANT for is_team_coach_for_client, isolated in a DO block as
-- dynamic SQL (CLI splitter gotcha, feedback_supabase_cli_dollar_quote_splitter).
-- authenticated only: this predicate is referenced solely in authenticated-only
-- SELECT policies (a team coach is always authenticated; anon can never be one),
-- so no anon grant is needed (feedback_supabase_default_grants_to_anon).
DO $do$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.is_team_coach_for_client(uuid, uuid) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.is_team_coach_for_client(uuid, uuid) FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_team_coach_for_client(uuid, uuid) TO authenticated';
END
$do$;
