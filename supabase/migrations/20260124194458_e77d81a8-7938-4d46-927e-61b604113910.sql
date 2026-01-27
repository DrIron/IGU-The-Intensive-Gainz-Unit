
-- ============================================================
-- HARDENED ENCRYPTION TRIGGER: Auto-encrypt + Validate + Log
-- ============================================================

-- Create audit log table for trigger failures
CREATE TABLE IF NOT EXISTS public.phi_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  table_name text NOT NULL,
  record_id uuid,
  user_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: Only admin/service can read audit logs
ALTER TABLE public.phi_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read PHI audit logs"
  ON public.phi_audit_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access to PHI audit logs"
  ON public.phi_audit_log FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Index for efficient querying
CREATE INDEX idx_phi_audit_log_created ON public.phi_audit_log(created_at DESC);
CREATE INDEX idx_phi_audit_log_event ON public.phi_audit_log(event_type);

COMMENT ON TABLE public.phi_audit_log IS 'Audit trail for PHI encryption trigger events and failures';

-- ============================================================
-- Replace the encryption enforcement trigger with enhanced version
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_phi_encryption()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  encryption_key text;
  missing_required text[] := '{}';
  encrypted_fields text[] := '{}';
BEGIN
  -- Get encryption key once (fails fast if not configured)
  BEGIN
    encryption_key := get_phi_encryption_key();
  EXCEPTION WHEN OTHERS THEN
    -- Log critical failure
    INSERT INTO public.phi_audit_log (event_type, table_name, record_id, user_id, details)
    VALUES (
      'encryption_key_failure',
      TG_TABLE_NAME,
      COALESCE(NEW.id, OLD.id),
      NEW.user_id,
      jsonb_build_object('error', SQLERRM, 'operation', TG_OP)
    );
    RAISE EXCEPTION 'PHI encryption key not available. Cannot proceed with form submission.';
  END;

  -- ============================================================
  -- AUTO-ENCRYPT: If plaintext provided, encrypt and nullify
  -- ============================================================
  
  -- Email: auto-encrypt if plaintext provided
  IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
    BEGIN
      NEW.email_encrypted := encode(
        extensions.pgp_sym_encrypt(NEW.email, encryption_key),
        'base64'
      );
      encrypted_fields := array_append(encrypted_fields, 'email');
      NEW.email := NULL;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.phi_audit_log (event_type, table_name, record_id, user_id, details)
      VALUES ('encryption_failure', TG_TABLE_NAME, NEW.id, NEW.user_id,
        jsonb_build_object('field', 'email', 'error', SQLERRM));
      RAISE EXCEPTION 'Failed to encrypt email: %', SQLERRM;
    END;
  END IF;

  -- Phone: auto-encrypt if plaintext provided  
  IF NEW.phone_number IS NOT NULL AND NEW.phone_number <> '' THEN
    BEGIN
      NEW.phone_number_encrypted := encode(
        extensions.pgp_sym_encrypt(NEW.phone_number, encryption_key),
        'base64'
      );
      encrypted_fields := array_append(encrypted_fields, 'phone_number');
      NEW.phone_number := NULL;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.phi_audit_log (event_type, table_name, record_id, user_id, details)
      VALUES ('encryption_failure', TG_TABLE_NAME, NEW.id, NEW.user_id,
        jsonb_build_object('field', 'phone_number', 'error', SQLERRM));
      RAISE EXCEPTION 'Failed to encrypt phone_number: %', SQLERRM;
    END;
  END IF;

  -- Date of birth: auto-encrypt if plaintext provided
  IF NEW.date_of_birth IS NOT NULL THEN
    BEGIN
      NEW.date_of_birth_encrypted := encode(
        extensions.pgp_sym_encrypt(NEW.date_of_birth::text, encryption_key),
        'base64'
      );
      encrypted_fields := array_append(encrypted_fields, 'date_of_birth');
      NEW.date_of_birth := NULL;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.phi_audit_log (event_type, table_name, record_id, user_id, details)
      VALUES ('encryption_failure', TG_TABLE_NAME, NEW.id, NEW.user_id,
        jsonb_build_object('field', 'date_of_birth', 'error', SQLERRM));
      RAISE EXCEPTION 'Failed to encrypt date_of_birth: %', SQLERRM;
    END;
  END IF;

  -- ============================================================
  -- PAR-Q FIELDS: Auto-encrypt booleans and text
  -- ============================================================
  
  IF NEW.parq_heart_condition IS NOT NULL THEN
    NEW.parq_heart_condition_encrypted := encode(
      extensions.pgp_sym_encrypt(NEW.parq_heart_condition::text, encryption_key), 'base64');
    NEW.parq_heart_condition := NULL;
  END IF;

  IF NEW.parq_chest_pain_active IS NOT NULL THEN
    NEW.parq_chest_pain_active_encrypted := encode(
      extensions.pgp_sym_encrypt(NEW.parq_chest_pain_active::text, encryption_key), 'base64');
    NEW.parq_chest_pain_active := NULL;
  END IF;

  IF NEW.parq_chest_pain_inactive IS NOT NULL THEN
    NEW.parq_chest_pain_inactive_encrypted := encode(
      extensions.pgp_sym_encrypt(NEW.parq_chest_pain_inactive::text, encryption_key), 'base64');
    NEW.parq_chest_pain_inactive := NULL;
  END IF;

  IF NEW.parq_balance_dizziness IS NOT NULL THEN
    NEW.parq_balance_dizziness_encrypted := encode(
      extensions.pgp_sym_encrypt(NEW.parq_balance_dizziness::text, encryption_key), 'base64');
    NEW.parq_balance_dizziness := NULL;
  END IF;

  IF NEW.parq_bone_joint_problem IS NOT NULL THEN
    NEW.parq_bone_joint_problem_encrypted := encode(
      extensions.pgp_sym_encrypt(NEW.parq_bone_joint_problem::text, encryption_key), 'base64');
    NEW.parq_bone_joint_problem := NULL;
  END IF;

  IF NEW.parq_medication IS NOT NULL THEN
    NEW.parq_medication_encrypted := encode(
      extensions.pgp_sym_encrypt(NEW.parq_medication::text, encryption_key), 'base64');
    NEW.parq_medication := NULL;
  END IF;

  IF NEW.parq_other_reason IS NOT NULL THEN
    NEW.parq_other_reason_encrypted := encode(
      extensions.pgp_sym_encrypt(NEW.parq_other_reason::text, encryption_key), 'base64');
    NEW.parq_other_reason := NULL;
  END IF;

  IF NEW.parq_injuries_conditions IS NOT NULL AND NEW.parq_injuries_conditions <> '' THEN
    NEW.parq_injuries_conditions_encrypted := encode(
      extensions.pgp_sym_encrypt(NEW.parq_injuries_conditions, encryption_key), 'base64');
    NEW.parq_injuries_conditions := NULL;
  END IF;

  IF NEW.parq_additional_details IS NOT NULL AND NEW.parq_additional_details <> '' THEN
    NEW.parq_additional_details_encrypted := encode(
      extensions.pgp_sym_encrypt(NEW.parq_additional_details, encryption_key), 'base64');
    NEW.parq_additional_details := NULL;
  END IF;

  -- ============================================================
  -- VALIDATION: Required encrypted fields must exist on INSERT
  -- ============================================================
  
  IF TG_OP = 'INSERT' THEN
    -- Email is required for form submissions
    IF (NEW.email IS NULL OR NEW.email = '') AND 
       (NEW.email_encrypted IS NULL OR NEW.email_encrypted = '') THEN
      missing_required := array_append(missing_required, 'email');
    END IF;

    -- If any required fields are missing, log and reject
    IF array_length(missing_required, 1) > 0 THEN
      INSERT INTO public.phi_audit_log (event_type, table_name, record_id, user_id, details)
      VALUES (
        'validation_failure',
        TG_TABLE_NAME,
        NEW.id,
        NEW.user_id,
        jsonb_build_object(
          'missing_fields', missing_required,
          'operation', TG_OP
        )
      );
      RAISE EXCEPTION 'Missing required encrypted fields: %. Provide plaintext or pre-encrypted value.', 
        array_to_string(missing_required, ', ');
    END IF;
  END IF;

  -- ============================================================
  -- AUDIT LOG: Success (only for significant encryptions)
  -- ============================================================
  
  IF array_length(encrypted_fields, 1) > 0 THEN
    INSERT INTO public.phi_audit_log (event_type, table_name, record_id, user_id, details)
    VALUES (
      'encryption_success',
      TG_TABLE_NAME,
      NEW.id,
      NEW.user_id,
      jsonb_build_object(
        'fields_encrypted', encrypted_fields,
        'operation', TG_OP
      )
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- Revoke execute from non-privileged roles (trigger function)
REVOKE EXECUTE ON FUNCTION public.enforce_phi_encryption() FROM anon, authenticated;

-- ============================================================
-- Replace the old trigger with the new enhanced one
-- ============================================================

-- Drop old triggers
DROP TRIGGER IF EXISTS enforce_no_plaintext_phi_trigger ON public.form_submissions;
DROP TRIGGER IF EXISTS encrypt_phi_on_form_submission_trigger ON public.form_submissions;
DROP TRIGGER IF EXISTS enforce_phi_encryption_trigger ON public.form_submissions;

-- Create new unified trigger (BEFORE INSERT OR UPDATE)
CREATE TRIGGER enforce_phi_encryption_trigger
  BEFORE INSERT OR UPDATE ON public.form_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_phi_encryption();

-- Add comment
COMMENT ON FUNCTION public.enforce_phi_encryption() IS 
  'SECURITY: Auto-encrypts plaintext PII/PHI, validates required fields, logs all events. Service_role only.';
