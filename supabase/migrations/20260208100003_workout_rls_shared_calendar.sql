-- ============================================================
-- Phase 26: Update Workout RLS for Shared Calendar
-- Any care team member can view; only creator or admin can edit
-- ============================================================

-- Drop old policies on direct_calendar_sessions
DROP POLICY IF EXISTS "Clients can view own direct sessions" ON public.direct_calendar_sessions;
DROP POLICY IF EXISTS "Coaches can manage client direct sessions" ON public.direct_calendar_sessions;
DROP POLICY IF EXISTS "Admin full access to direct sessions" ON public.direct_calendar_sessions;

-- New SELECT: any care team member + client + admin
CREATE POLICY "Care team and clients can view direct sessions"
  ON public.direct_calendar_sessions FOR SELECT
  TO authenticated
  USING (
    client_user_id = auth.uid()
    OR coach_user_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.is_care_team_member_for_client(auth.uid(), client_user_id)
  );

-- New INSERT: must be able to build programs + be care team member + set coach_user_id to self
CREATE POLICY "Practitioners can create direct sessions"
  ON public.direct_calendar_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    coach_user_id = auth.uid()
    AND (
      public.can_build_programs(auth.uid())
      OR public.is_admin(auth.uid())
    )
  );

-- New UPDATE: only the creator (coach_user_id) or admin
CREATE POLICY "Creator or admin can update direct sessions"
  ON public.direct_calendar_sessions FOR UPDATE
  TO authenticated
  USING (
    coach_user_id = auth.uid()
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    coach_user_id = auth.uid()
    OR public.is_admin(auth.uid())
  );

-- New DELETE: only the creator (coach_user_id) or admin
CREATE POLICY "Creator or admin can delete direct sessions"
  ON public.direct_calendar_sessions FOR DELETE
  TO authenticated
  USING (
    coach_user_id = auth.uid()
    OR public.is_admin(auth.uid())
  );
