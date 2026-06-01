-- B5-N6 (Option A) -- retire care_team_assignments.status, part 2: policies,
-- index, column drop. Runs after ..._functions.sql (all function readers moved
-- to lifecycle_status). Three policies still INLINE care_team_assignments.status
-- (live pg_policies sweep 2026-06-01); recreate them on lifecycle_status, then
-- drop the index and the column. Table is 0 rows in prod -> no backfill.
-- All three are PERMISSIVE SELECT, role PUBLIC (no TO clause), matching prod.

-- ---------------------------------------------------------------------------
-- dietitians.dietitians_client_select
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "dietitians_client_select" ON public.dietitians;
CREATE POLICY "dietitians_client_select" ON public.dietitians
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.care_team_assignments cta
      WHERE cta.client_id = (SELECT auth.uid())
        AND cta.staff_user_id = dietitians.user_id
        AND cta.specialty = 'dietitian'::staff_specialty
        AND cta.lifecycle_status IN ('active', 'scheduled_end')
    )
  );

-- ---------------------------------------------------------------------------
-- form_submissions_safe.form_submissions_safe_coach_select
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "form_submissions_safe_coach_select" ON public.form_submissions_safe;
CREATE POLICY "form_submissions_safe_coach_select" ON public.form_submissions_safe
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.subscriptions sub
      WHERE sub.user_id = form_submissions_safe.user_id
        AND sub.coach_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.care_team_assignments cta
      JOIN public.subscriptions sub ON sub.id = cta.subscription_id
      WHERE sub.user_id = form_submissions_safe.user_id
        AND cta.staff_user_id = (SELECT auth.uid())
        AND cta.lifecycle_status IN ('active', 'scheduled_end')
    )
  );

-- ---------------------------------------------------------------------------
-- care_team_assignments."Staff can view their own assignments"
-- (Redundant with staff_view_own_active_assignments, but recreated on
--  lifecycle_status to preserve the existing policy set rather than dropping.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can view their own assignments" ON public.care_team_assignments;
CREATE POLICY "Staff can view their own assignments" ON public.care_team_assignments
  FOR SELECT
  USING (
    staff_user_id = (SELECT auth.uid())
    AND lifecycle_status IN ('active', 'scheduled_end')
  );

-- ---------------------------------------------------------------------------
-- Drop the status index then the column. (DROP COLUMN would cascade-drop the
-- index anyway; explicit for clarity. 0 rows -> no backfill, no data loss.)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.care_team_status_idx;

-- The status CHECK ('active'|'inactive'|'removed') is column-scoped and would
-- cascade-drop with the column anyway; dropped explicitly for clarity.
ALTER TABLE public.care_team_assignments DROP CONSTRAINT IF EXISTS care_team_assignments_status_check;

ALTER TABLE public.care_team_assignments DROP COLUMN status;
