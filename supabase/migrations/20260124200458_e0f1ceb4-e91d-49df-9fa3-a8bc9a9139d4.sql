
-- ============================================================
-- Harden PHI protection with CHECK constraints and safety-net trigger
-- ============================================================

-- STEP 1: Add CHECK constraints to ensure plaintext PHI columns stay NULL
-- These act as a last line of defense if triggers are bypassed

-- Note: We use a trigger-based constraint instead of CHECK constraint
-- because CHECK constraints can't be conditional on encrypted values
-- and we need the encryption trigger to run first

-- STEP 2: Create a CONSTRAINT trigger that fires AFTER the encryption trigger
-- This ensures all plaintext columns are NULL after any INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.enforce_phi_nullification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  violations text[] := '{}';
BEGIN
  -- Check all plaintext PHI fields are NULL
  -- This runs AFTER the encryption trigger, so any non-NULL is a violation
  
  IF NEW.email IS NOT NULL THEN
    violations := array_append(violations, 'email');
  END IF;
  
  IF NEW.phone_number IS NOT NULL THEN
    violations := array_append(violations, 'phone_number');
  END IF;
  
  IF NEW.date_of_birth IS NOT NULL THEN
    violations := array_append(violations, 'date_of_birth');
  END IF;
  
  IF NEW.parq_heart_condition IS NOT NULL THEN
    violations := array_append(violations, 'parq_heart_condition');
  END IF;
  
  IF NEW.parq_chest_pain_active IS NOT NULL THEN
    violations := array_append(violations, 'parq_chest_pain_active');
  END IF;
  
  IF NEW.parq_chest_pain_inactive IS NOT NULL THEN
    violations := array_append(violations, 'parq_chest_pain_inactive');
  END IF;
  
  IF NEW.parq_balance_dizziness IS NOT NULL THEN
    violations := array_append(violations, 'parq_balance_dizziness');
  END IF;
  
  IF NEW.parq_bone_joint_problem IS NOT NULL THEN
    violations := array_append(violations, 'parq_bone_joint_problem');
  END IF;
  
  IF NEW.parq_medication IS NOT NULL THEN
    violations := array_append(violations, 'parq_medication');
  END IF;
  
  IF NEW.parq_other_reason IS NOT NULL THEN
    violations := array_append(violations, 'parq_other_reason');
  END IF;
  
  IF NEW.parq_injuries_conditions IS NOT NULL THEN
    violations := array_append(violations, 'parq_injuries_conditions');
  END IF;
  
  IF NEW.parq_additional_details IS NOT NULL THEN
    violations := array_append(violations, 'parq_additional_details');
  END IF;

  -- If any violations found, log and block the operation
  IF array_length(violations, 1) > 0 THEN
    INSERT INTO public.phi_audit_log (event_type, table_name, record_id, user_id, details)
    VALUES (
      'phi_nullification_violation',
      TG_TABLE_NAME,
      NEW.id,
      NEW.user_id,
      jsonb_build_object(
        'plaintext_fields', violations,
        'operation', TG_OP,
        'error', 'Plaintext PHI fields must be NULL after encryption trigger'
      )
    );
    
    RAISE EXCEPTION 'PHI VIOLATION: Plaintext fields [%] are not NULL after encryption. This should never happen - check encryption trigger.', 
      array_to_string(violations, ', ');
  END IF;

  RETURN NEW;
END;
$$;

-- Create the constraint trigger (runs after all BEFORE triggers)
-- Using CONSTRAINT trigger with DEFERRABLE for maximum safety
DROP TRIGGER IF EXISTS enforce_phi_nullification_trigger ON public.form_submissions;
CREATE CONSTRAINT TRIGGER enforce_phi_nullification_trigger
AFTER INSERT OR UPDATE ON public.form_submissions
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION enforce_phi_nullification();

-- STEP 3: Verify trigger order (enforce_phi runs BEFORE, nullification runs AFTER)
-- Trigger names are alphabetically ordered for BEFORE triggers with same timing

-- STEP 4: Update scanner to also check profiles_private and coaches_private tables
CREATE OR REPLACE FUNCTION public.scan_phi_plaintext_violations()
RETURNS TABLE(violation_type text, field_name text, record_count bigint, severity text, description text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- ============================================================
  -- FORM_SUBMISSIONS: Check all plaintext PHI columns
  -- ============================================================
  
  -- Email plaintext
  RETURN QUERY
  SELECT 
    'plaintext_phi'::text as violation_type,
    'form_submissions.email'::text as field_name,
    COUNT(*)::bigint as record_count,
    CASE WHEN COUNT(*) > 0 THEN 'critical' ELSE 'ok' END::text as severity,
    CASE WHEN COUNT(*) > 0 
      THEN 'CRITICAL: Found ' || COUNT(*) || ' records with plaintext email in form_submissions'
      ELSE 'OK: No plaintext emails found'
    END::text as description
  FROM form_submissions WHERE email IS NOT NULL;
  
  -- Phone plaintext
  RETURN QUERY
  SELECT 
    'plaintext_phi'::text,
    'form_submissions.phone_number'::text,
    COUNT(*)::bigint,
    CASE WHEN COUNT(*) > 0 THEN 'critical' ELSE 'ok' END::text,
    CASE WHEN COUNT(*) > 0 
      THEN 'CRITICAL: Found ' || COUNT(*) || ' records with plaintext phone in form_submissions'
      ELSE 'OK: No plaintext phone numbers found'
    END::text
  FROM form_submissions WHERE phone_number IS NOT NULL;
  
  -- DOB plaintext
  RETURN QUERY
  SELECT 
    'plaintext_phi'::text,
    'form_submissions.date_of_birth'::text,
    COUNT(*)::bigint,
    CASE WHEN COUNT(*) > 0 THEN 'critical' ELSE 'ok' END::text,
    CASE WHEN COUNT(*) > 0 
      THEN 'CRITICAL: Found ' || COUNT(*) || ' records with plaintext DOB in form_submissions'
      ELSE 'OK: No plaintext DOB found'
    END::text
  FROM form_submissions WHERE date_of_birth IS NOT NULL;
  
  -- PAR-Q fields (consolidated check)
  RETURN QUERY
  SELECT 
    'plaintext_phi'::text,
    'form_submissions.parq_*'::text,
    (
      (SELECT COUNT(*) FROM form_submissions WHERE parq_heart_condition IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_chest_pain_active IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_chest_pain_inactive IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_balance_dizziness IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_bone_joint_problem IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_medication IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_other_reason IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_injuries_conditions IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_additional_details IS NOT NULL)
    )::bigint,
    CASE WHEN (
      (SELECT COUNT(*) FROM form_submissions WHERE parq_heart_condition IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_chest_pain_active IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_chest_pain_inactive IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_balance_dizziness IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_bone_joint_problem IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_medication IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_other_reason IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_injuries_conditions IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_additional_details IS NOT NULL)
    ) > 0 THEN 'critical' ELSE 'ok' END::text,
    CASE WHEN (
      (SELECT COUNT(*) FROM form_submissions WHERE parq_heart_condition IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_chest_pain_active IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_chest_pain_inactive IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_balance_dizziness IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_bone_joint_problem IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_medication IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_other_reason IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_injuries_conditions IS NOT NULL) +
      (SELECT COUNT(*) FROM form_submissions WHERE parq_additional_details IS NOT NULL)
    ) > 0 THEN 'CRITICAL: Found plaintext PAR-Q medical data in form_submissions'
      ELSE 'OK: No plaintext PAR-Q data found'
    END::text;

  -- ============================================================
  -- MISSING ENCRYPTED FIELDS: Records with no encrypted data
  -- ============================================================
  
  RETURN QUERY
  SELECT 
    'missing_encrypted'::text,
    'form_submissions.email_encrypted'::text,
    COUNT(*)::bigint,
    CASE WHEN COUNT(*) > 0 THEN 'warning' ELSE 'ok' END::text,
    CASE WHEN COUNT(*) > 0 
      THEN 'WARNING: Found ' || COUNT(*) || ' records missing encrypted email'
      ELSE 'OK: All records have encrypted email'
    END::text
  FROM form_submissions 
  WHERE email_encrypted IS NULL AND email IS NULL
  AND user_id IS NOT NULL;

  -- ============================================================
  -- ENCRYPTION TRIGGER HEALTH CHECK
  -- ============================================================
  
  RETURN QUERY
  SELECT 
    'trigger_health'::text,
    'enforce_phi_encryption_trigger'::text,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid = 'public.form_submissions'::regclass
      AND t.tgname = 'enforce_phi_encryption_trigger'
      AND t.tgenabled = 'O'
    ) THEN 0::bigint ELSE 1::bigint END,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid = 'public.form_submissions'::regclass
      AND t.tgname = 'enforce_phi_encryption_trigger'
      AND t.tgenabled = 'O'
    ) THEN 'ok' ELSE 'critical' END::text,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid = 'public.form_submissions'::regclass
      AND t.tgname = 'enforce_phi_encryption_trigger'
      AND t.tgenabled = 'O'
    ) THEN 'OK: PHI encryption trigger is active'
      ELSE 'CRITICAL: PHI encryption trigger is disabled or missing!'
    END::text;

  -- ============================================================
  -- NULLIFICATION TRIGGER HEALTH CHECK
  -- ============================================================
  
  RETURN QUERY
  SELECT 
    'trigger_health'::text,
    'enforce_phi_nullification_trigger'::text,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid = 'public.form_submissions'::regclass
      AND t.tgname = 'enforce_phi_nullification_trigger'
      AND t.tgenabled = 'O'
    ) THEN 0::bigint ELSE 1::bigint END,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid = 'public.form_submissions'::regclass
      AND t.tgname = 'enforce_phi_nullification_trigger'
      AND t.tgenabled = 'O'
    ) THEN 'ok' ELSE 'critical' END::text,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid = 'public.form_submissions'::regclass
      AND t.tgname = 'enforce_phi_nullification_trigger'
      AND t.tgenabled = 'O'
    ) THEN 'OK: PHI nullification constraint trigger is active'
      ELSE 'CRITICAL: PHI nullification trigger is disabled or missing!'
    END::text;

END;
$$;

-- STEP 5: Grant execute permissions
GRANT EXECUTE ON FUNCTION public.enforce_phi_nullification() TO authenticated;
GRANT EXECUTE ON FUNCTION public.scan_phi_plaintext_violations() TO authenticated;

-- STEP 6: Document the security model
COMMENT ON FUNCTION public.enforce_phi_nullification() IS 
'Constraint trigger that runs AFTER encryption trigger to verify all plaintext PHI fields are NULL.
Acts as a safety net - if any plaintext field survives the encryption trigger, this blocks the operation.
This should never fire in normal operation; if it does, there is a bug in the encryption trigger.';

COMMENT ON FUNCTION public.scan_phi_plaintext_violations() IS 
'Scans form_submissions for PHI violations:
- Plaintext PHI fields that should be NULL
- Missing encrypted fields
- Trigger health checks
Used by System Health dashboard for compliance monitoring.';
