-- P5 Slice 2: coach/team-coach/admin/care-team SELECT on CANONICAL exercise_set_logs.
-- Existing SELECT policies resolve coach access via the legacy client_module_exercise_id
-- column, which is NULL on canonical logs (they key on assignment_id + plan_slot_id) ->
-- coach reads silently deny under board_v2. This additive policy grants parity read via
-- the assignment. Scoped to assignment_id IS NOT NULL so legacy-log access is unchanged.
CREATE POLICY exercise_set_logs_canonical_coach_select ON public.exercise_set_logs
FOR SELECT USING (
  assignment_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.client_plan_assignment cpa
    WHERE cpa.id = exercise_set_logs.assignment_id
      AND (
        public.is_admin((select auth.uid()))
        OR public.has_active_coach_access_to_client((select auth.uid()), cpa.client_id)
        OR cpa.primary_coach_id = (select auth.uid())
        OR EXISTS (
             SELECT 1 FROM public.coach_teams ct
             WHERE ct.id = cpa.team_id AND ct.coach_id = (select auth.uid())
           )
      )
  )
);
