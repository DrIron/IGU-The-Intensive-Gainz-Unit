-- Allow coaches and admins to update subscription status
CREATE POLICY "Coaches and admins can update subscriptions"
ON public.subscriptions
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'coach'::app_role) OR 
  public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'coach'::app_role) OR 
  public.has_role(auth.uid(), 'admin'::app_role)
);