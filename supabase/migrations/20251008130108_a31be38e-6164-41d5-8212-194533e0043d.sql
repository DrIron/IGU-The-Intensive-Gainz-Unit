-- Add admin SELECT policy for profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add coach SELECT policy for assigned clients' profiles
CREATE POLICY "Coaches can view assigned clients' profiles"
ON public.profiles
FOR SELECT
USING (
  id IN (
    SELECT subscriptions.user_id
    FROM subscriptions
    WHERE subscriptions.coach_id = auth.uid()
  )
);

-- Add admin SELECT policy for subscriptions
CREATE POLICY "Admins can view all subscriptions"
ON public.subscriptions
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add admin SELECT policy for user_roles so admin can fetch all roles
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));