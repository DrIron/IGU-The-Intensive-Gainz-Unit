-- Teams T3 — additive team-coach SELECT policies. See docs/TEAMS_T3_BUILD.md §0/§4.
--
-- NEW permissive policies (OR-ed with the existing per-client ones; existing
-- policies are NOT edited) so a team's head coach can read each active member's
-- training/nutrition data — the roster drill-down reuses the full
-- /coach/clients/:id overview, which would otherwise silently empty for members
-- the coach isn't primary for. Each target table carries user_id directly, so
-- the predicate is a straight is_team_coach_for_client(viewer, row.user_id).
-- (select auth.uid()) matches the optimized init-plan form used elsewhere.

CREATE POLICY client_programs_team_coach_select ON public.client_programs
  FOR SELECT TO authenticated
  USING (public.is_team_coach_for_client((SELECT auth.uid()), user_id));

CREATE POLICY nutrition_phases_team_coach_select ON public.nutrition_phases
  FOR SELECT TO authenticated
  USING (public.is_team_coach_for_client((SELECT auth.uid()), user_id));

CREATE POLICY weight_logs_team_coach_select ON public.weight_logs
  FOR SELECT TO authenticated
  USING (public.is_team_coach_for_client((SELECT auth.uid()), user_id));

CREATE POLICY adherence_logs_team_coach_select ON public.adherence_logs
  FOR SELECT TO authenticated
  USING (public.is_team_coach_for_client((SELECT auth.uid()), user_id));
