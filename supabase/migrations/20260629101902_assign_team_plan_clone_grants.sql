-- S1 REVOKE/GRANT for the rewired assign_team_plan(uuid, uuid, date, boolean).
-- The DROP in the companion fn migration removed the old 3-arg overload's grants;
-- re-scope the new signature to authenticated only. DO block per the CLI splitter
-- gotcha (feedback_supabase_cli_dollar_quote_splitter /
-- feedback_supabase_default_grants_to_anon).
DO $do$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.assign_team_plan(uuid, uuid, date, boolean) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.assign_team_plan(uuid, uuid, date, boolean) FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.assign_team_plan(uuid, uuid, date, boolean) TO authenticated';
END
$do$;
