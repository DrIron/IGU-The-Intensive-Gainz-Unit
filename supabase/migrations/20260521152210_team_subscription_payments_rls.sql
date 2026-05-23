-- Allow head coaches to read subscription_payments for clients on teams they own.
-- Existing coach RLS on subscription_payments only matches rows where the coach is
-- the direct coach_id; clients assigned via coach_teams.team_id are invisible, so
-- team coaches cannot see their team clients' payment history (P1-10 gap).
-- Mirrors 20260212170000_team_subscriptions_rls.sql for the payments table.
CREATE POLICY "Team coaches can view subscription payments for their team's clients"
  ON public.subscription_payments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.subscriptions s
      JOIN public.coach_teams ct ON ct.id = s.team_id
      WHERE s.id = subscription_payments.subscription_id
        AND ct.coach_id = auth.uid()
    )
  );
