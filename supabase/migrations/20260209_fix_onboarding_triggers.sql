-- Fix three trigger bugs that blocked client onboarding form submission
-- All three were discovered during live QA testing (Feb 9, 2026)

-- =================================================================
-- Fix 1: sync_form_submissions_safe() referenced NEW.red_flags_count
-- which does not exist on form_submissions table
-- =================================================================
CREATE OR REPLACE FUNCTION sync_form_submissions_safe()
RETURNS trigger AS $$
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
      0,    -- red_flags_count not on form_submissions, default to 0
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
      red_flags_count = 0
    WHERE id = NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM form_submissions_safe WHERE id = OLD.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- Fix 2 & 3: ensure_default_client_role() had two invalid enum refs:
--   - OLD.status IN ('new', 'pending') — 'new' is not in account_status
--   - INSERT role = 'client' — 'client' is not in app_role (it's 'member')
-- =================================================================
CREATE OR REPLACE FUNCTION ensure_default_client_role()
RETURNS trigger AS $$
BEGIN
  -- Only act when status transitions TO an onboarding-complete state
  -- and user has NO role yet
  IF NEW.status IN ('pending_coach_approval', 'pending_payment', 'needs_medical_review', 'active')
    AND (OLD.status IS NULL OR OLD.status = 'pending')
  THEN
    -- Check if user already has a role
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = NEW.id
    ) THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, 'member')
      ON CONFLICT (user_id, role) DO NOTHING;

      RAISE LOG 'ensure_default_client_role: assigned member role to user %', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
