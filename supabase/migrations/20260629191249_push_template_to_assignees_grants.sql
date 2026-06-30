-- S4 — REVOKE/GRANT for push_template_to_assignees, isolated in a DO block as
-- dynamic SQL (CLI splitter gotcha, feedback_supabase_cli_dollar_quote_splitter).
-- authenticated only; the in-function owner/admin gate is defense-in-depth
-- (feedback_supabase_default_grants_to_anon).
DO $do$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.push_template_to_assignees(uuid, uuid[]) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.push_template_to_assignees(uuid, uuid[]) FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.push_template_to_assignees(uuid, uuid[]) TO authenticated';
END
$do$;
