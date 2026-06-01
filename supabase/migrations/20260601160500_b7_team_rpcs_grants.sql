-- B7-N7 + B7-N12: REVOKE/GRANT for the two team RPCs, isolated from their
-- CREATE FUNCTION defs and wrapped in a single DO block as dynamic SQL. The CLI
-- statement splitter (v2.78.1) merges a function body with trailing REVOKE/GRANT
-- into one prepared statement -> 42601; a DO block is one statement it cannot
-- fragment (feedback_supabase_cli_dollar_quote_splitter). Scopes both RPCs to
-- authenticated only (feedback_supabase_default_grants_to_anon).
DO $do$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.assign_team_program_atomic(uuid, uuid, date) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.assign_team_program_atomic(uuid, uuid, date) FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.assign_team_program_atomic(uuid, uuid, date) TO authenticated';
  EXECUTE 'REVOKE ALL ON FUNCTION public.soft_delete_team_atomic(uuid) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.soft_delete_team_atomic(uuid) FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.soft_delete_team_atomic(uuid) TO authenticated';
END
$do$;
