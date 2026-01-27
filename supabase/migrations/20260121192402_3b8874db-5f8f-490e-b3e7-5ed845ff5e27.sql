-- =============================================================================
-- FORM SUBMISSIONS MEDICAL ACCESS CONTROLS
-- Coaches can READ medical data for assigned clients, but NEVER UPDATE
-- =============================================================================

-- Step 1: Add READ-ONLY access for coaches to form_submissions_medical_private
-- (They can see medical data for their assigned clients, but cannot modify)
CREATE POLICY "Coaches can read assigned clients medical_private"
ON public.form_submissions_medical_private
FOR SELECT
USING (
  has_role(auth.uid(), 'coach'::app_role) 
  AND user_id IN (
    SELECT s.user_id FROM subscriptions s 
    WHERE s.coach_id = auth.uid() 
    AND s.status IN ('active', 'pending')
  )
);

-- Step 2: Fix legacy form_submissions table - remove coach UPDATE permission
-- Drop the problematic policy that allows coaches to update
DROP POLICY IF EXISTS "Coaches can update their active clients' form submissions" ON public.form_submissions;

-- Step 3: Drop the overly permissive ALL policy on legacy table
DROP POLICY IF EXISTS "Block unauthorized access to medical data" ON public.form_submissions;

-- Step 4: Create proper SELECT-only policy for coaches on legacy table
CREATE POLICY "Coaches can read assigned clients form submissions"
ON public.form_submissions
FOR SELECT
USING (
  has_role(auth.uid(), 'coach'::app_role) 
  AND user_id IN (
    SELECT s.user_id FROM subscriptions s 
    WHERE s.coach_id = auth.uid() 
    AND s.status IN ('active', 'pending')
  )
);

-- Step 5: Add explicit policy for users to update their own submissions
CREATE POLICY "Users can update their own form submissions"
ON public.form_submissions
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Step 6: Create admin full access policy for legacy table
DROP POLICY IF EXISTS "Admins can view all form submissions" ON public.form_submissions;

CREATE POLICY "Admins full access to form_submissions"
ON public.form_submissions
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Step 7: Add trigger to prevent any UPDATE on medical fields even if RLS is bypassed
-- This provides defense-in-depth at the database level
CREATE OR REPLACE FUNCTION public.protect_medical_fields_from_coach_update()
RETURNS TRIGGER AS $$
DECLARE
  is_coach boolean;
  is_admin boolean;
  is_owner boolean;
BEGIN
  -- Check if caller is admin
  is_admin := has_role(auth.uid(), 'admin'::app_role);
  IF is_admin THEN
    RETURN NEW;
  END IF;
  
  -- Check if caller is the owner
  is_owner := auth.uid() = OLD.user_id;
  IF is_owner THEN
    RETURN NEW;
  END IF;
  
  -- Check if caller is a coach
  is_coach := has_role(auth.uid(), 'coach'::app_role);
  IF is_coach THEN
    -- Coaches should NEVER reach UPDATE - RLS should block it
    -- But as defense in depth, block any attempt
    RAISE EXCEPTION 'Coaches are not permitted to update medical records';
  END IF;
  
  -- Default: allow (for service role operations)
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Apply trigger to form_submissions_medical_private
DROP TRIGGER IF EXISTS protect_medical_private_from_coach ON public.form_submissions_medical_private;
CREATE TRIGGER protect_medical_private_from_coach
BEFORE UPDATE ON public.form_submissions_medical_private
FOR EACH ROW
EXECUTE FUNCTION public.protect_medical_fields_from_coach_update();

-- Apply same trigger to legacy form_submissions table
DROP TRIGGER IF EXISTS protect_form_submissions_from_coach ON public.form_submissions;
CREATE TRIGGER protect_form_submissions_from_coach
BEFORE UPDATE ON public.form_submissions
FOR EACH ROW
EXECUTE FUNCTION public.protect_medical_fields_from_coach_update();