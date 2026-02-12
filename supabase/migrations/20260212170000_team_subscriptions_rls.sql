-- Allow head coaches to read subscriptions for teams they own
-- Without this, coaches can only see subscriptions where coach_id = auth.uid(),
-- so team member counts show 0 for clients assigned via team_id.
CREATE POLICY "Coaches can read subscriptions for their teams"
  ON public.subscriptions
  FOR SELECT
  USING (
    team_id IN (
      SELECT id FROM public.coach_teams WHERE coach_id = auth.uid()
    )
  );
