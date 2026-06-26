-- Care-team SELECT parity for adherence_logs + nutrition_adjustments.
--
-- weight_logs already grants SELECT to active care-team members via
-- `weight_logs_care_team_select` (is_care_team_member_for_client), but
-- adherence_logs and nutrition_adjustments were never given the matching
-- policy -- they only had the phase.coach_id-based coach policy + dietitian +
-- self. Two consequences for a coach / care-team member who can see a client's
-- weigh-in trend but whose relationship isn't expressed as phase.coach_id:
--
--   1. The coach-facing weekly check-in card (NutritionTab "This week",
--      redesign B2) rendered empty -- couldn't read adherence_logs.
--   2. The decision card could WRITE an adjustment (INSERT is allowed) but
--      then couldn't SELECT it back, so it never saw its own applied row and
--      re-recommended the same change -- a double-apply hazard.
--
-- These add the same care-team SELECT policy weight_logs has, scoped to the
-- relationship rather than phase.coach_id, so reads work regardless of who owns
-- the phase. Additive and SELECT-only -- writes are unaffected.

CREATE POLICY "adherence_logs_care_team_select"
ON public.adherence_logs
FOR SELECT
TO authenticated
USING (public.is_care_team_member_for_client((SELECT auth.uid()), user_id));

CREATE POLICY "nutrition_adjustments_care_team_select"
ON public.nutrition_adjustments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.nutrition_phases np
    WHERE np.id = nutrition_adjustments.phase_id
      AND public.is_care_team_member_for_client((SELECT auth.uid()), np.user_id)
  )
);
