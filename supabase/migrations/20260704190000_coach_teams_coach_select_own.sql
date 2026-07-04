-- Teams management fix — a head coach must be able to SELECT their OWN team regardless of
-- is_active (Hasan, 2026-07-04). Existing coach_teams SELECT policies (coach_teams_read_active,
-- the public active+public policy, admin) all require is_active=true, so once a team is
-- deactivated its owner can no longer read the row. That breaks: (1) the deactivate itself —
-- `UPDATE … SET is_active=false … RETURNING id` can't read back the now-inactive row → RLS 42501;
-- (2) the Inactive/Reactivate list, which can't load inactive teams. Add an owner SELECT that
-- covers all states. Public /teams + onboarding already filter is_active, so they still exclude
-- inactive teams — this only widens the OWNER's own read.
CREATE POLICY "coach_teams_coach_select_own" ON public.coach_teams
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = coach_id);
