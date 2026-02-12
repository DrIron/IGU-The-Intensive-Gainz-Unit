-- Allow head coaches to read profiles of members in their teams
-- Without this, coaches see "Unknown" for team members because
-- is_primary_coach_for_user() checks coach_id, not team_id.
CREATE POLICY "profiles_public_select_team_coach"
  ON public.profiles_public
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT s.user_id
      FROM public.subscriptions s
      INNER JOIN public.coach_teams ct ON s.team_id = ct.id
      WHERE ct.coach_id = auth.uid()
        AND s.status IN ('pending', 'active', 'past_due')
    )
  );
