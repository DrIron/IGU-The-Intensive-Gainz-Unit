-- P5 Slice 3 §0: uniform canonical-read parity for the four coach viewer classes.
-- Existing plan_*_read_via_assignment policies cover primary/team-coach/admin but NOT
-- care-team-only viewers; cpid_via_assignment covers client/admin/primary/care-team but
-- NOT team-coach-only. Add the missing branches additively (existing policies untouched).

-- Care-team parity on plan_* (has_active_coach_access_to_client = primary OR care-team).
CREATE POLICY plan_slots_read_care_team ON public.plan_slots
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.client_plan_assignment a
          WHERE a.plan_id = plan_slots.plan_id AND a.status = 'active'
            AND public.has_active_coach_access_to_client((select auth.uid()), a.client_id)));

CREATE POLICY plan_sessions_read_care_team ON public.plan_sessions
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.client_plan_assignment a
          WHERE a.plan_id = plan_sessions.plan_id AND a.status = 'active'
            AND public.has_active_coach_access_to_client((select auth.uid()), a.client_id)));

CREATE POLICY plan_weeks_read_care_team ON public.plan_weeks
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.client_plan_assignment a
          WHERE a.plan_id = plan_weeks.plan_id AND a.status = 'active'
            AND public.has_active_coach_access_to_client((select auth.uid()), a.client_id)));

-- Team-coach parity on inserted deloads.
CREATE POLICY cpid_read_team_coach ON public.client_plan_inserted_deloads
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.client_plan_assignment a
          JOIN public.coach_teams ct ON ct.id = a.team_id
          WHERE a.id = client_plan_inserted_deloads.assignment_id
            AND ct.coach_id = (select auth.uid())));
