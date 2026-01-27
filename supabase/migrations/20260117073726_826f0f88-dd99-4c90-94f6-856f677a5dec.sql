-- Add payout_percentage to subscription_addons for flexible payout calculations
ALTER TABLE public.subscription_addons 
ADD COLUMN IF NOT EXISTS payout_percentage numeric DEFAULT 100;

-- Add comment for clarity
COMMENT ON COLUMN public.subscription_addons.payout_percentage IS 'Percentage of addon price to pay to specialist (0-100). Default 100 means full payout_kwd is used.';

-- Create a database function to check if user is primary coach for a subscription
CREATE OR REPLACE FUNCTION public.is_primary_coach_for_subscription(p_user_id uuid, p_subscription_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions
    WHERE id = p_subscription_id
      AND coach_id = p_user_id
  )
$$;

-- Create a function to check if user can manage care team (is admin OR is primary coach)
CREATE OR REPLACE FUNCTION public.can_manage_care_team(p_user_id uuid, p_subscription_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    public.has_role(p_user_id, 'admin')
    OR public.is_primary_coach_for_subscription(p_user_id, p_subscription_id)
$$;

-- Drop existing policies on care_team_assignments if they exist
DROP POLICY IF EXISTS "Admins can manage all care team assignments" ON public.care_team_assignments;
DROP POLICY IF EXISTS "Primary coaches can manage their client care teams" ON public.care_team_assignments;
DROP POLICY IF EXISTS "Care team members can view their assignments" ON public.care_team_assignments;
DROP POLICY IF EXISTS "Clients can view their own care team" ON public.care_team_assignments;

-- Create new RLS policies for care_team_assignments
-- Admins can do everything
CREATE POLICY "Admins can manage all care team assignments"
ON public.care_team_assignments
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Primary coaches can manage care team for their subscriptions
CREATE POLICY "Primary coaches can manage their client care teams"
ON public.care_team_assignments
FOR ALL
TO authenticated
USING (public.is_primary_coach_for_subscription(auth.uid(), subscription_id))
WITH CHECK (public.is_primary_coach_for_subscription(auth.uid(), subscription_id));

-- Care team members can only VIEW their own assignments (not modify)
CREATE POLICY "Care team members can view their assignments"
ON public.care_team_assignments
FOR SELECT
TO authenticated
USING (staff_user_id = auth.uid());

-- Clients can view their own care team
CREATE POLICY "Clients can view their own care team"
ON public.care_team_assignments
FOR SELECT
TO authenticated
USING (client_id = auth.uid());

-- Drop existing policies on subscription_addons if they exist
DROP POLICY IF EXISTS "Admins can manage all subscription addons" ON public.subscription_addons;
DROP POLICY IF EXISTS "Primary coaches can manage their client addons" ON public.subscription_addons;
DROP POLICY IF EXISTS "Clients can view their own addons" ON public.subscription_addons;

-- Create RLS policies for subscription_addons (billing)
-- Only admins can manage billing addons (coaches cannot manage billing)
CREATE POLICY "Admins can manage all subscription addons"
ON public.subscription_addons
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Primary coaches can only VIEW addons for their subscriptions (not modify)
CREATE POLICY "Primary coaches can view their client addons"
ON public.subscription_addons
FOR SELECT
TO authenticated
USING (public.is_primary_coach_for_subscription(auth.uid(), subscription_id));

-- Clients can view their own addons
CREATE POLICY "Clients can view their own addons"
ON public.subscription_addons
FOR SELECT
TO authenticated
USING (client_id = auth.uid());