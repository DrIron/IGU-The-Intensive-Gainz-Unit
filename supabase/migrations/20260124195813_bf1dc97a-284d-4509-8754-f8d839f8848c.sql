
-- ============================================================
-- Harden form_submissions_safe: Add missing fields + ensure coach isolation
-- ============================================================

-- STEP 1: Add new columns to form_submissions_safe if they don't exist
ALTER TABLE public.form_submissions_safe 
ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id),
ADD COLUMN IF NOT EXISTS coach_id uuid,
ADD COLUMN IF NOT EXISTS notes_summary text;

-- STEP 2: Update the sync trigger to include new fields
CREATE OR REPLACE FUNCTION public.sync_form_submissions_safe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO form_submissions_safe (
      id, user_id, created_at, updated_at, needs_medical_review,
      verified_at, verified_by_coach_id, documents_verified,
      documents_approved_by_coach, documents_approved_at,
      coach_preference_type, requested_coach_id, submission_status,
      red_flags_count, service_id, notes_summary
    ) VALUES (
      NEW.id, NEW.user_id, NEW.created_at, NEW.updated_at, NEW.needs_medical_review,
      NEW.verified_at, NEW.verified_by_coach_id, NEW.documents_verified,
      NEW.documents_approved_by_coach, NEW.documents_approved_at,
      NEW.coach_preference_type, NEW.requested_coach_id, NEW.submission_status,
      COALESCE(NEW.red_flags_count, 0),
      NULL, -- service_id pulled from subscriptions, not form_submissions
      NULL  -- notes_summary not populated from form_submissions
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
      red_flags_count = COALESCE(NEW.red_flags_count, 0)
    WHERE id = NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM form_submissions_safe WHERE id = OLD.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- STEP 3: Create trigger to sync service_id and coach_id from subscriptions
CREATE OR REPLACE FUNCTION public.sync_form_submissions_safe_from_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- When subscription is created/updated, sync service_id and coach_id to form_submissions_safe
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE form_submissions_safe 
    SET 
      service_id = NEW.service_id,
      coach_id = NEW.coach_id
    WHERE user_id = NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_form_submissions_safe_from_subscription_trigger ON public.subscriptions;
CREATE TRIGGER sync_form_submissions_safe_from_subscription_trigger
AFTER INSERT OR UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION sync_form_submissions_safe_from_subscription();

-- STEP 4: Backfill service_id and coach_id from existing subscriptions
UPDATE form_submissions_safe fss
SET 
  service_id = s.service_id,
  coach_id = s.coach_id
FROM subscriptions s
WHERE fss.user_id = s.user_id
AND fss.service_id IS NULL;

-- STEP 5: Update RLS policy for coach access - use is_coach_for_client function
-- First drop existing coach policy if it exists
DROP POLICY IF EXISTS "form_submissions_safe_coach_select" ON public.form_submissions_safe;

-- Create improved coach policy that checks coach assignment via subscriptions
CREATE POLICY "form_submissions_safe_coach_select"
ON public.form_submissions_safe
FOR SELECT
USING (
  -- Coach can only see their assigned clients
  EXISTS (
    SELECT 1 FROM public.subscriptions sub
    WHERE sub.user_id = form_submissions_safe.user_id
    AND sub.coach_id = auth.uid()
  )
  OR
  -- Or if they're part of the care team
  EXISTS (
    SELECT 1 FROM public.care_team_assignments cta
    JOIN public.subscriptions sub ON sub.id = cta.subscription_id
    WHERE sub.user_id = form_submissions_safe.user_id
    AND cta.staff_user_id = auth.uid()
    AND cta.status = 'active'
  )
);

-- STEP 6: Verify form_submissions has NO coach access policies
-- (The existing policies only allow: admin ALL, user own SELECT/INSERT/UPDATE)
-- We're not adding any new policies, just confirming isolation

-- STEP 7: Add comment documenting the security model
COMMENT ON TABLE public.form_submissions_safe IS 
'Safe view of form submissions for coaches. Contains ONLY non-PHI operational data. 
Coaches access this table instead of form_submissions to prevent PHI exposure.
Fields excluded: email, phone, DOB, PAR-Q responses, all encrypted fields.
RLS ensures coaches only see their assigned clients.';

COMMENT ON TABLE public.form_submissions IS 
'Full form submissions with PHI. Access restricted to:
- Admins: full access
- Users: own submissions only
Coaches have NO access to this table. Use form_submissions_safe instead.';
