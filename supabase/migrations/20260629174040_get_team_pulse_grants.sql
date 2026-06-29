-- Teams T3 — REVOKE/GRANT for get_team_pulse, isolated in a DO block as dynamic
-- SQL (CLI splitter gotcha, feedback_supabase_cli_dollar_quote_splitter). Scoped
-- to authenticated only; the in-function head-coach/admin gate is defense-in-depth
-- (feedback_supabase_default_grants_to_anon).
DO $do$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.get_team_pulse(uuid) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.get_team_pulse(uuid) FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_team_pulse(uuid) TO authenticated';
END
$do$;
