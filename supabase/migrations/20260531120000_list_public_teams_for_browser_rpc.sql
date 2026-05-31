-- =============================================================================
-- Block 7 pre-launch audit -- close B7-N1 + B7-N8 (public /teams browser).
-- =============================================================================
-- Adds list_public_teams_for_browser(), a SECURITY DEFINER RPC callable by
-- anon + authenticated that bundles team rows + head-coach name/avatar + member
-- count in one round-trip, filtered to is_active = true AND is_public = true.
--
-- B7-N1: useTeams.ts called get_coach_for_client(team.coach_id) per team, but
-- that RPC gates on is_primary_coach_for_user / is_care_team_member_for_client,
-- which return NULL for anon and non-member callers. Result: the public /teams
-- page rendered the literal "Coach" instead of the real head-coach name for
-- every visitor except current members of that team (live-verified via anon +
-- non-member JWT probes against prod).
--
-- B7-N8: same loop also ran one subscriptions count per team (N+1). Folding it
-- into this RPC removes both round-trips.
--
-- Reads coach name from coaches_public via SECURITY DEFINER, bypassing the
-- RLS-broken coaches_client_safe view. Modeled on list_active_teams_for_client()
-- (migration 20260523084526); adds the extra browser columns the public card
-- renders (training_goal, sessions/duration, cycle, cover image, avatar,
-- waitlist flag).
--
-- Findings catalog: docs/pre-launch-review-findings.md (Block 7).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_public_teams_for_browser()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',                        t.id,
    'name',                      t.name,
    'description',               t.description,
    'tags',                      COALESCE(t.tags, '{}'::text[]),
    'max_members',               t.max_members,
    'coach_id',                  t.coach_id,
    'coach_first_name',          cp.first_name,
    'coach_last_name',           cp.last_name,
    'coach_profile_picture_url', cp.profile_picture_url,
    'training_goal',             t.training_goal,
    'sessions_per_week',         t.sessions_per_week,
    'session_duration_min',      t.session_duration_min,
    'cycle_start_date',          t.cycle_start_date,
    'cycle_weeks',               t.cycle_weeks,
    'cover_image_url',           t.cover_image_url,
    'waitlist_enabled',          t.waitlist_enabled,
    'member_count', (
      SELECT COUNT(*)::int
      FROM public.subscriptions s
      WHERE s.team_id = t.id
        AND s.status IN ('pending', 'active')
    )
  ) ORDER BY t.name), '[]'::jsonb)
  FROM public.coach_teams t
  LEFT JOIN public.coaches_public cp
    ON cp.user_id = t.coach_id
  WHERE t.is_active = true
    AND t.is_public = true;
$$;

COMMENT ON FUNCTION public.list_public_teams_for_browser() IS
  'Returns public+active teams with head-coach name/avatar + member count for '
  'the anon-accessible /teams browser. SECURITY DEFINER so anon + non-member '
  'callers get the real coach name (get_coach_for_client returns NULL for them). '
  'Closes B7-N1 (wrong "Coach" label) + B7-N8 (N+1). member_count counts '
  'pending+active subscriptions.';

GRANT EXECUTE ON FUNCTION public.list_public_teams_for_browser() TO anon, authenticated;
