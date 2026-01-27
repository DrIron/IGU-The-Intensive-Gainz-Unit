
-- ============================================================
-- STEP 1: Drop ALL coach SELECT policies from form_submissions
-- Coaches should have ZERO direct access to this table
-- ============================================================

DROP POLICY IF EXISTS "Coaches can read assigned clients form submissions" ON public.form_submissions;
DROP POLICY IF EXISTS "Coaches can view their active clients' form submissions" ON public.form_submissions;
DROP POLICY IF EXISTS "form_submissions_coach_select" ON public.form_submissions;

-- ============================================================
-- STEP 2: Create form_submissions_safe view for coaches
-- Contains ONLY non-PHI operational data
-- ============================================================

-- Drop existing coach view if it exists
DROP VIEW IF EXISTS public.form_submissions_coach_view;

-- Create the safe view with only non-sensitive fields
CREATE OR REPLACE VIEW public.form_submissions_safe AS
SELECT 
  fs.id,
  fs.user_id,
  fs.created_at,
  fs.updated_at,
  fs.needs_medical_review,
  fs.verified_at,
  fs.verified_by_coach_id,
  fs.documents_verified,
  fs.documents_approved_by_coach,
  fs.documents_approved_at,
  fs.coach_preference_type,
  fs.requested_coach_id,
  fs.submission_status,
  -- Computed field: count of red flags (PAR-Q yes answers)
  -- Note: The boolean fields are now NULL (encrypted), so we count based on needs_medical_review
  CASE WHEN fs.needs_medical_review THEN 1 ELSE 0 END AS red_flags_count
FROM public.form_submissions fs;

-- ============================================================
-- STEP 3: Grant SELECT on the safe view to authenticated users
-- RLS will control who can see what rows
-- ============================================================

GRANT SELECT ON public.form_submissions_safe TO authenticated;

-- ============================================================
-- STEP 4: Enable RLS on the view (requires security_invoker)
-- We use security_invoker so the view respects the caller's permissions
-- ============================================================

-- Recreate with security_invoker = true
DROP VIEW IF EXISTS public.form_submissions_safe;

CREATE VIEW public.form_submissions_safe
WITH (security_invoker = true)
AS
SELECT 
  fs.id,
  fs.user_id,
  fs.created_at,
  fs.updated_at,
  fs.needs_medical_review,
  fs.verified_at,
  fs.verified_by_coach_id,
  fs.documents_verified,
  fs.documents_approved_by_coach,
  fs.documents_approved_at,
  fs.coach_preference_type,
  fs.requested_coach_id,
  fs.submission_status,
  CASE WHEN fs.needs_medical_review THEN 1 ELSE 0 END AS red_flags_count
FROM public.form_submissions fs;

GRANT SELECT ON public.form_submissions_safe TO authenticated;

-- ============================================================
-- STEP 5: Create a function to check if coach is assigned to client
-- This will be used in RLS policies
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_coach_for_client(client_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = client_user_id
      AND s.coach_id = auth.uid()
      AND s.status IN ('active', 'pending')
  );
$$;

-- ============================================================
-- STEP 6: Since views with security_invoker inherit base table RLS,
-- we need to ensure the base table has proper policies.
-- Let's create a specific policy for view access that only allows
-- the safe columns to be queried through specific functions.
-- ============================================================

-- Actually, with security_invoker, the view will use the caller's permissions.
-- Since we removed all coach SELECT policies, coaches cannot access the view either.
-- 
-- The solution is to keep the base table locked down and create a security definer
-- function that coaches can call to get safe data.

-- Let's create a table-backed approach instead for cleaner RLS:

DROP VIEW IF EXISTS public.form_submissions_safe;

-- Create a materialized/regular table that syncs from form_submissions
-- This allows proper RLS without the complexity of security_invoker views

CREATE TABLE IF NOT EXISTS public.form_submissions_safe (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  needs_medical_review boolean DEFAULT false,
  verified_at timestamptz,
  verified_by_coach_id uuid,
  documents_verified boolean DEFAULT false,
  documents_approved_by_coach boolean DEFAULT false,
  documents_approved_at timestamptz,
  coach_preference_type text,
  requested_coach_id uuid,
  submission_status text,
  red_flags_count integer DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.form_submissions_safe ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 7: RLS Policies for form_submissions_safe
-- ============================================================

-- Admins have full access
CREATE POLICY "form_submissions_safe_admin_all"
ON public.form_submissions_safe
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Coaches can SELECT only their assigned clients
CREATE POLICY "form_submissions_safe_coach_select"
ON public.form_submissions_safe
FOR SELECT
USING (
  has_role(auth.uid(), 'coach'::app_role) 
  AND is_coach_for_client(user_id)
);

-- Users can view their own submission
CREATE POLICY "form_submissions_safe_user_select"
ON public.form_submissions_safe
FOR SELECT
USING (auth.uid() = user_id);

-- Only admins can insert/update (via triggers or direct)
-- No insert/update for coaches - data syncs from form_submissions

-- ============================================================
-- STEP 8: Create trigger to sync form_submissions -> form_submissions_safe
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_form_submissions_safe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO form_submissions_safe (
      id, user_id, created_at, updated_at, needs_medical_review,
      verified_at, verified_by_coach_id, documents_verified,
      documents_approved_by_coach, documents_approved_at,
      coach_preference_type, requested_coach_id, submission_status,
      red_flags_count
    ) VALUES (
      NEW.id, NEW.user_id, NEW.created_at, NEW.updated_at, NEW.needs_medical_review,
      NEW.verified_at, NEW.verified_by_coach_id, NEW.documents_verified,
      NEW.documents_approved_by_coach, NEW.documents_approved_at,
      NEW.coach_preference_type, NEW.requested_coach_id, NEW.submission_status,
      CASE WHEN NEW.needs_medical_review THEN 1 ELSE 0 END
    );
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE form_submissions_safe SET
      user_id = NEW.user_id,
      updated_at = NEW.updated_at,
      needs_medical_review = NEW.needs_medical_review,
      verified_at = NEW.verified_at,
      verified_by_coach_id = NEW.verified_by_coach_id,
      documents_verified = NEW.documents_verified,
      documents_approved_by_coach = NEW.documents_approved_by_coach,
      documents_approved_at = NEW.documents_approved_at,
      coach_preference_type = NEW.coach_preference_type,
      requested_coach_id = NEW.requested_coach_id,
      submission_status = NEW.submission_status,
      red_flags_count = CASE WHEN NEW.needs_medical_review THEN 1 ELSE 0 END
    WHERE id = NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM form_submissions_safe WHERE id = OLD.id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS sync_form_submissions_safe_trigger ON public.form_submissions;
CREATE TRIGGER sync_form_submissions_safe_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.form_submissions
FOR EACH ROW
EXECUTE FUNCTION sync_form_submissions_safe();

-- ============================================================
-- STEP 9: Backfill existing data into form_submissions_safe
-- ============================================================

INSERT INTO form_submissions_safe (
  id, user_id, created_at, updated_at, needs_medical_review,
  verified_at, verified_by_coach_id, documents_verified,
  documents_approved_by_coach, documents_approved_at,
  coach_preference_type, requested_coach_id, submission_status,
  red_flags_count
)
SELECT 
  id, user_id, created_at, updated_at, needs_medical_review,
  verified_at, verified_by_coach_id, documents_verified,
  documents_approved_by_coach, documents_approved_at,
  coach_preference_type, requested_coach_id, submission_status,
  CASE WHEN needs_medical_review THEN 1 ELSE 0 END
FROM form_submissions
ON CONFLICT (id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  updated_at = EXCLUDED.updated_at,
  needs_medical_review = EXCLUDED.needs_medical_review,
  verified_at = EXCLUDED.verified_at,
  verified_by_coach_id = EXCLUDED.verified_by_coach_id,
  documents_verified = EXCLUDED.documents_verified,
  documents_approved_by_coach = EXCLUDED.documents_approved_by_coach,
  documents_approved_at = EXCLUDED.documents_approved_at,
  coach_preference_type = EXCLUDED.coach_preference_type,
  requested_coach_id = EXCLUDED.requested_coach_id,
  submission_status = EXCLUDED.submission_status,
  red_flags_count = EXCLUDED.red_flags_count;

-- ============================================================
-- STEP 10: Grant permissions
-- ============================================================

GRANT SELECT ON public.form_submissions_safe TO authenticated;
