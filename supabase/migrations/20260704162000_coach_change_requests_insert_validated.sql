-- P1 access-boundary hardening — coach_change_requests: validate requested_coach_id (Hasan, 2026-07-04).
--
-- INSERT was gated only by auth.uid()=user_id; the row names a requested_coach_id (target coach)
-- with no validation — a client could request assignment to any id, or to themselves. Extend the
-- WITH CHECK: not self, distinct from the current coach, and a real coach.
--
-- NOTE: the spec's EXISTS(SELECT 1 FROM coaches WHERE user_id=requested_coach_id) would be
-- evaluated as the requesting CLIENT, but `coaches` RLS is admin/self-only → the subquery returns
-- nothing for a client → it would reject EVERY request. Use the SECURITY DEFINER helper
-- public.is_coach(uuid) (role-based, RLS-safe) for the same "real coach" check instead. No new
-- function needed. Still admin/coach-approved downstream — this is defense-in-depth.
DROP POLICY "Users can create coach change requests" ON public.coach_change_requests;

CREATE POLICY "coach_change_requests_insert_validated" ON public.coach_change_requests
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND requested_coach_id <> auth.uid()                       -- no self-request
  AND requested_coach_id IS DISTINCT FROM current_coach_id    -- not your current coach
  AND public.is_coach(requested_coach_id)                     -- must be a real coach
);
