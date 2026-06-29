-- Teams T3 — team-coach RLS helper. See docs/TEAMS_T3_BUILD.md §0/§4.
--
-- A Team Plan is led by a head coach who is generally NOT each member's
-- primary_coach_id / nutrition_phases.coach_id / care-team member, so the
-- existing per-client SELECT policies never cover a team coach reading a
-- member's training/nutrition data (silent 0-row reads). This predicate is the
-- additive bridge: true when p_coach owns an ACTIVE team that p_client belongs
-- to (mirrors the team pattern in 20260212170000 / 20260212180000:
-- coach_teams.coach_id -> subscriptions.team_id -> member).
--
-- SECURITY DEFINER so it can evaluate the subscriptions/coach_teams join
-- regardless of the caller's own RLS; STABLE (no writes). Used inside RLS
-- policy USING() expressions on client_programs / nutrition_phases /
-- weight_logs / adherence_logs (added in the companion policies migration).
CREATE OR REPLACE FUNCTION public.is_team_coach_for_client(p_coach uuid, p_client uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    JOIN public.coach_teams ct ON ct.id = s.team_id
    WHERE s.user_id = p_client
      AND ct.coach_id = p_coach
      AND ct.is_active = true
  );
$function$;
