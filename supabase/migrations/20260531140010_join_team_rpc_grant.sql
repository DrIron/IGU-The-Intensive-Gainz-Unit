-- Grant for join_team (B7-N2/N5/N6). Authenticated clients call this from
-- ChooseTeamPrompt + ChangeTeamDialog; the RPC self-verifies ownership.
GRANT EXECUTE ON FUNCTION public.join_team(uuid, uuid) TO authenticated;
