-- Coach-RLS weigh-in gap: relationship-based SELECT on weight_logs + circumference_logs.
--
-- BUG (confirmed live 2026-06-24): a coach opening a client's Progress / Overview
-- saw "No measurements available" even when the client had logged weigh-ins. Root
-- cause: the existing "Coaches can view their clients' weight logs" / "... circumference
-- logs" policies key on nutrition_phases.coach_id:
--     EXISTS (SELECT 1 FROM nutrition_phases
--             WHERE id = <log>.phase_id AND coach_id = auth.uid())
-- When the phase's coach_id is NULL (or stale after a reassignment) the EXISTS yields
-- NULL -> the coach is locked out of their own client's logs. The roster RPC
-- (get_coach_roster_stats) only saw them because it is SECURITY DEFINER.
--
-- FIX: add a relationship-based SELECT policy mirroring body_fat_logs_care_team_select,
-- which already does the right thing. is_care_team_member_for_client(staff, client)
-- bundles admin OR primary coach OR active care_team_assignment, so this grants the
-- correct readers regardless of the phase's coach_id. Additive + permissive: the old
-- phase-based policies stay (harmless redundancy); this one closes the gap.
--
-- No frontend change needed -- CoachNutritionGraphs / Overview keep their client-side
-- queries; the data now passes RLS. Applied to prod out-of-band 2026-06-24; this file
-- registers it in schema_migrations (idempotent: DROP IF EXISTS + CREATE).

DROP POLICY IF EXISTS weight_logs_care_team_select ON public.weight_logs;
CREATE POLICY weight_logs_care_team_select ON public.weight_logs
  FOR SELECT TO authenticated
  USING (public.is_care_team_member_for_client((SELECT auth.uid()), user_id));

DROP POLICY IF EXISTS circumference_logs_care_team_select ON public.circumference_logs;
CREATE POLICY circumference_logs_care_team_select ON public.circumference_logs
  FOR SELECT TO authenticated
  USING (public.is_care_team_member_for_client((SELECT auth.uid()), user_id));
