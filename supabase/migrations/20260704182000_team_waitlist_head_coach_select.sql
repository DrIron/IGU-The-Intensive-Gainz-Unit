-- Teams management — head-coach read access to their team's waitlist (Hasan, 2026-07-04).
-- team_waitlist captures signups for full teams (anon INSERT — tightened separately by the
-- access-boundary hardening; NOT touched here). This adds the read surface: a head coach can see
-- the waitlist for teams they own; admin can read all. Anon INSERT is unaffected.
CREATE POLICY "team_waitlist_head_coach_select"
ON public.team_waitlist FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR team_id IN (SELECT id FROM public.coach_teams WHERE coach_id = auth.uid())
);
