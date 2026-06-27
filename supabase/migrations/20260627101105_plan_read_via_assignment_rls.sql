-- Program system unification — P0.5 RLS reconciliation (ADDITIVE).
-- See docs/PROGRAM_SYSTEM_UNIFICATION_BUILD_PLAN.md §P0.5.
--
-- The P0 schema (20260626140000) gave coaches/admins owner access to plan*,
-- and made only `visibility = 'global'` plans client-readable. It is missing the
-- delivery read path required by P0.5: "client reads a plan via an active
-- client_plan_assignment", plus team-coach parity for reading a plan they deliver
-- but do not own (the owner-coach path in 20260626140000 only covers owned plans).
--
-- These are SELECT-only, additive policies (permissive, OR-ed with the existing
-- owner/global policies) — they only widen read access, never restrict it. Idempotent
-- (DROP IF EXISTS + CREATE) so a re-run / fresh local DB is safe.
--
-- Access set mirrors cpa_coach / cpo_via_assignment: client-self + primary coach
-- + is_primary_coach_for_user + team coach + admin, gated on an ACTIVE assignment.

-- plan ----------------------------------------------------------------------
DROP POLICY IF EXISTS plan_read_via_assignment ON public.plan;
CREATE POLICY plan_read_via_assignment ON public.plan
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.client_plan_assignment a
    WHERE a.plan_id = plan.id
      AND a.status = 'active'
      AND (a.client_id = auth.uid()
           OR a.primary_coach_id = auth.uid()
           OR public.is_admin(auth.uid())
           OR public.is_primary_coach_for_user(auth.uid(), a.client_id)
           OR EXISTS (SELECT 1 FROM public.coach_teams ct
                      WHERE ct.id = a.team_id AND ct.coach_id = auth.uid()))
  ));

-- plan_weeks (plan_id denormalized) -----------------------------------------
DROP POLICY IF EXISTS plan_weeks_read_via_assignment ON public.plan_weeks;
CREATE POLICY plan_weeks_read_via_assignment ON public.plan_weeks
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.client_plan_assignment a
    WHERE a.plan_id = plan_weeks.plan_id
      AND a.status = 'active'
      AND (a.client_id = auth.uid()
           OR a.primary_coach_id = auth.uid()
           OR public.is_admin(auth.uid())
           OR public.is_primary_coach_for_user(auth.uid(), a.client_id)
           OR EXISTS (SELECT 1 FROM public.coach_teams ct
                      WHERE ct.id = a.team_id AND ct.coach_id = auth.uid()))
  ));

-- plan_sessions (plan_id denormalized) --------------------------------------
DROP POLICY IF EXISTS plan_sessions_read_via_assignment ON public.plan_sessions;
CREATE POLICY plan_sessions_read_via_assignment ON public.plan_sessions
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.client_plan_assignment a
    WHERE a.plan_id = plan_sessions.plan_id
      AND a.status = 'active'
      AND (a.client_id = auth.uid()
           OR a.primary_coach_id = auth.uid()
           OR public.is_admin(auth.uid())
           OR public.is_primary_coach_for_user(auth.uid(), a.client_id)
           OR EXISTS (SELECT 1 FROM public.coach_teams ct
                      WHERE ct.id = a.team_id AND ct.coach_id = auth.uid()))
  ));

-- plan_slots (plan_id denormalized) -----------------------------------------
DROP POLICY IF EXISTS plan_slots_read_via_assignment ON public.plan_slots;
CREATE POLICY plan_slots_read_via_assignment ON public.plan_slots
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.client_plan_assignment a
    WHERE a.plan_id = plan_slots.plan_id
      AND a.status = 'active'
      AND (a.client_id = auth.uid()
           OR a.primary_coach_id = auth.uid()
           OR public.is_admin(auth.uid())
           OR public.is_primary_coach_for_user(auth.uid(), a.client_id)
           OR EXISTS (SELECT 1 FROM public.coach_teams ct
                      WHERE ct.id = a.team_id AND ct.coach_id = auth.uid()))
  ));
