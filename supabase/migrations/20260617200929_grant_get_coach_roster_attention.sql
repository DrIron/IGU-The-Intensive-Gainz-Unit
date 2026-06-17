-- Grants for get_coach_roster_attention() — kept in a separate, dollar-quote-free
-- file from the CREATE FUNCTION body (CLI db-push splitter mis-parses $$ bodies
-- followed by trailing statements). Mandatory anon REVOKE: the default grant gives
-- anon EXECUTE, and granting authenticated does NOT remove it (PR #132).
REVOKE ALL ON FUNCTION public.get_coach_roster_attention() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_coach_roster_attention() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_coach_roster_attention() TO authenticated;
COMMENT ON FUNCTION public.get_coach_roster_attention() IS
  'RO1/CO5: deduped roster-attention headline + breakdown tiles for the calling coach (auth.uid()), across direct + team-plan clients. Single source for dashboard, sidebar badge, and roster.';
