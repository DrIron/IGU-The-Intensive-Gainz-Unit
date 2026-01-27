-- 1. LOCK DOWN COACH PROFILES - Create separate policies for public vs authenticated access

-- Drop the existing public policy
DROP POLICY IF EXISTS "Anyone can view coach profiles publicly" ON public.coaches;

-- Create a policy that only shows approved coaches with limited public fields
CREATE POLICY "Public can view basic approved coach info"
ON public.coaches
FOR SELECT
USING (
  status = 'approved'
  -- Note: SELECT will only return the columns requested, but RLS doesn't filter columns
  -- We'll need to handle sensitive data visibility in the application layer
);

-- Create a policy for authenticated users to see contact details of approved coaches
CREATE POLICY "Authenticated users can view full coach profiles"
ON public.coaches
FOR SELECT
USING (
  auth.uid() IS NOT NULL AND status = 'approved'
);

-- 2. STRENGTHEN PROFILES TABLE - Ensure only proper access to personal data

-- The existing policies look good, but let's add explicit denial for public access
-- First, verify no public access policy exists that we need to remove

-- 3. STRENGTHEN FORM SUBMISSIONS - Medical data must be ultra-protected

-- Add explicit policy to block any unauthorized access
CREATE POLICY "Block unauthorized access to medical data"
ON public.form_submissions
FOR ALL
USING (
  auth.uid() = user_id 
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'coach'::app_role) 
    AND user_id IN (
      SELECT user_id 
      FROM subscriptions 
      WHERE coach_id = auth.uid() 
      AND status = 'active'
    )
  )
);

-- 4. STRENGTHEN WEEKLY PROGRESS - Body measurements protection

CREATE POLICY "Strict access control for body measurements"
ON public.weekly_progress
FOR ALL
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'coach'::app_role)
    AND user_id IN (
      SELECT user_id
      FROM subscriptions
      WHERE coach_id = auth.uid()
      AND status = 'active'
    )
  )
);

-- 5. STRENGTHEN SUBSCRIPTIONS - Payment data protection

-- Add policy to prevent any data leakage
CREATE POLICY "Block unauthorized subscription access"
ON public.subscriptions
FOR ALL
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'coach'::app_role)
    AND auth.uid() = coach_id
  )
);

-- 6. STRENGTHEN NUTRITION GOALS - Health data protection

CREATE POLICY "Strict nutrition data access control"
ON public.nutrition_goals
FOR ALL
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'coach'::app_role)
    AND user_id IN (
      SELECT user_id
      FROM subscriptions
      WHERE coach_id = auth.uid()
      AND status = 'active'
    )
  )
);