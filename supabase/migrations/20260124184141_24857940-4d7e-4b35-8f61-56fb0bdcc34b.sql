
-- ============================================================
-- STEP 1: Create BEFORE INSERT/UPDATE trigger that enforces
-- NULL plaintext PHI columns - prevents any plaintext from being stored
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_no_plaintext_phi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  phi_violation boolean := false;
  violation_fields text[] := '{}';
BEGIN
  -- Check each plaintext PHI field and set to NULL
  -- Also track which fields had violations for logging
  
  -- Email
  IF NEW.email IS NOT NULL THEN
    NEW.email := NULL;
    violation_fields := array_append(violation_fields, 'email');
    phi_violation := true;
  END IF;
  
  -- Phone number
  IF NEW.phone_number IS NOT NULL THEN
    NEW.phone_number := NULL;
    violation_fields := array_append(violation_fields, 'phone_number');
    phi_violation := true;
  END IF;
  
  -- Date of birth
  IF NEW.date_of_birth IS NOT NULL THEN
    NEW.date_of_birth := NULL;
    violation_fields := array_append(violation_fields, 'date_of_birth');
    phi_violation := true;
  END IF;
  
  -- PAR-Q boolean fields (these should be in encrypted form only)
  IF NEW.parq_heart_condition IS NOT NULL THEN
    NEW.parq_heart_condition := NULL;
    violation_fields := array_append(violation_fields, 'parq_heart_condition');
    phi_violation := true;
  END IF;
  
  IF NEW.parq_chest_pain_active IS NOT NULL THEN
    NEW.parq_chest_pain_active := NULL;
    violation_fields := array_append(violation_fields, 'parq_chest_pain_active');
    phi_violation := true;
  END IF;
  
  IF NEW.parq_chest_pain_inactive IS NOT NULL THEN
    NEW.parq_chest_pain_inactive := NULL;
    violation_fields := array_append(violation_fields, 'parq_chest_pain_inactive');
    phi_violation := true;
  END IF;
  
  IF NEW.parq_balance_dizziness IS NOT NULL THEN
    NEW.parq_balance_dizziness := NULL;
    violation_fields := array_append(violation_fields, 'parq_balance_dizziness');
    phi_violation := true;
  END IF;
  
  IF NEW.parq_bone_joint_problem IS NOT NULL THEN
    NEW.parq_bone_joint_problem := NULL;
    violation_fields := array_append(violation_fields, 'parq_bone_joint_problem');
    phi_violation := true;
  END IF;
  
  IF NEW.parq_medication IS NOT NULL THEN
    NEW.parq_medication := NULL;
    violation_fields := array_append(violation_fields, 'parq_medication');
    phi_violation := true;
  END IF;
  
  IF NEW.parq_other_reason IS NOT NULL THEN
    NEW.parq_other_reason := NULL;
    violation_fields := array_append(violation_fields, 'parq_other_reason');
    phi_violation := true;
  END IF;
  
  -- PAR-Q text fields
  IF NEW.parq_injuries_conditions IS NOT NULL THEN
    NEW.parq_injuries_conditions := NULL;
    violation_fields := array_append(violation_fields, 'parq_injuries_conditions');
    phi_violation := true;
  END IF;
  
  IF NEW.parq_additional_details IS NOT NULL THEN
    NEW.parq_additional_details := NULL;
    violation_fields := array_append(violation_fields, 'parq_additional_details');
    phi_violation := true;
  END IF;
  
  -- Log if there was a PHI violation attempt (for security audit)
  IF phi_violation THEN
    RAISE WARNING 'PHI plaintext violation prevented on form_submissions. Fields nulled: %', array_to_string(violation_fields, ', ');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger (BEFORE INSERT OR UPDATE)
DROP TRIGGER IF EXISTS enforce_no_plaintext_phi_trigger ON public.form_submissions;
CREATE TRIGGER enforce_no_plaintext_phi_trigger
BEFORE INSERT OR UPDATE ON public.form_submissions
FOR EACH ROW
EXECUTE FUNCTION enforce_no_plaintext_phi();

-- ============================================================
-- STEP 2: Create a database function for PHI plaintext scanning
-- This can be called from the application for health checks
-- ============================================================

CREATE OR REPLACE FUNCTION public.scan_phi_plaintext_violations()
RETURNS TABLE (
  violation_type text,
  field_name text,
  record_count bigint,
  severity text,
  description text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Scan all plaintext PHI columns and return violation counts
  
  -- Email plaintext
  RETURN QUERY
  SELECT 
    'plaintext_phi'::text as violation_type,
    'email'::text as field_name,
    COUNT(*)::bigint as record_count,
    CASE WHEN COUNT(*) > 0 THEN 'critical' ELSE 'ok' END::text as severity,
    CASE WHEN COUNT(*) > 0 
      THEN 'Found ' || COUNT(*) || ' records with plaintext email addresses'
      ELSE 'No plaintext emails found'
    END::text as description
  FROM form_submissions WHERE email IS NOT NULL;
  
  -- Phone plaintext
  RETURN QUERY
  SELECT 
    'plaintext_phi'::text,
    'phone_number'::text,
    COUNT(*)::bigint,
    CASE WHEN COUNT(*) > 0 THEN 'critical' ELSE 'ok' END::text,
    CASE WHEN COUNT(*) > 0 
      THEN 'Found ' || COUNT(*) || ' records with plaintext phone numbers'
      ELSE 'No plaintext phone numbers found'
    END::text
  FROM form_submissions WHERE phone_number IS NOT NULL;
  
  -- DOB plaintext
  RETURN QUERY
  SELECT 
    'plaintext_phi'::text,
    'date_of_birth'::text,
    COUNT(*)::bigint,
    CASE WHEN COUNT(*) > 0 THEN 'critical' ELSE 'ok' END::text,
    CASE WHEN COUNT(*) > 0 
      THEN 'Found ' || COUNT(*) || ' records with plaintext date of birth'
      ELSE 'No plaintext DOB found'
    END::text
  FROM form_submissions WHERE date_of_birth IS NOT NULL;
  
  -- PAR-Q heart condition plaintext
  RETURN QUERY
  SELECT 
    'plaintext_phi'::text,
    'parq_heart_condition'::text,
    COUNT(*)::bigint,
    CASE WHEN COUNT(*) > 0 THEN 'critical' ELSE 'ok' END::text,
    CASE WHEN COUNT(*) > 0 
      THEN 'Found ' || COUNT(*) || ' records with plaintext PAR-Q data'
      ELSE 'No plaintext PAR-Q data found'
    END::text
  FROM form_submissions WHERE parq_heart_condition IS NOT NULL;
  
  -- PAR-Q chest pain active
  RETURN QUERY
  SELECT 
    'plaintext_phi'::text,
    'parq_chest_pain_active'::text,
    COUNT(*)::bigint,
    CASE WHEN COUNT(*) > 0 THEN 'critical' ELSE 'ok' END::text,
    CASE WHEN COUNT(*) > 0 
      THEN 'Found ' || COUNT(*) || ' records with plaintext PAR-Q data'
      ELSE 'No plaintext PAR-Q data found'
    END::text
  FROM form_submissions WHERE parq_chest_pain_active IS NOT NULL;
  
  -- PAR-Q chest pain inactive
  RETURN QUERY
  SELECT 
    'plaintext_phi'::text,
    'parq_chest_pain_inactive'::text,
    COUNT(*)::bigint,
    CASE WHEN COUNT(*) > 0 THEN 'critical' ELSE 'ok' END::text,
    CASE WHEN COUNT(*) > 0 
      THEN 'Found ' || COUNT(*) || ' records with plaintext PAR-Q data'
      ELSE 'No plaintext PAR-Q data found'
    END::text
  FROM form_submissions WHERE parq_chest_pain_inactive IS NOT NULL;
  
  -- PAR-Q balance/dizziness
  RETURN QUERY
  SELECT 
    'plaintext_phi'::text,
    'parq_balance_dizziness'::text,
    COUNT(*)::bigint,
    CASE WHEN COUNT(*) > 0 THEN 'critical' ELSE 'ok' END::text,
    CASE WHEN COUNT(*) > 0 
      THEN 'Found ' || COUNT(*) || ' records with plaintext PAR-Q data'
      ELSE 'No plaintext PAR-Q data found'
    END::text
  FROM form_submissions WHERE parq_balance_dizziness IS NOT NULL;
  
  -- PAR-Q bone/joint
  RETURN QUERY
  SELECT 
    'plaintext_phi'::text,
    'parq_bone_joint_problem'::text,
    COUNT(*)::bigint,
    CASE WHEN COUNT(*) > 0 THEN 'critical' ELSE 'ok' END::text,
    CASE WHEN COUNT(*) > 0 
      THEN 'Found ' || COUNT(*) || ' records with plaintext PAR-Q data'
      ELSE 'No plaintext PAR-Q data found'
    END::text
  FROM form_submissions WHERE parq_bone_joint_problem IS NOT NULL;
  
  -- PAR-Q medication
  RETURN QUERY
  SELECT 
    'plaintext_phi'::text,
    'parq_medication'::text,
    COUNT(*)::bigint,
    CASE WHEN COUNT(*) > 0 THEN 'critical' ELSE 'ok' END::text,
    CASE WHEN COUNT(*) > 0 
      THEN 'Found ' || COUNT(*) || ' records with plaintext PAR-Q data'
      ELSE 'No plaintext PAR-Q data found'
    END::text
  FROM form_submissions WHERE parq_medication IS NOT NULL;
  
  -- PAR-Q other reason
  RETURN QUERY
  SELECT 
    'plaintext_phi'::text,
    'parq_other_reason'::text,
    COUNT(*)::bigint,
    CASE WHEN COUNT(*) > 0 THEN 'critical' ELSE 'ok' END::text,
    CASE WHEN COUNT(*) > 0 
      THEN 'Found ' || COUNT(*) || ' records with plaintext PAR-Q data'
      ELSE 'No plaintext PAR-Q data found'
    END::text
  FROM form_submissions WHERE parq_other_reason IS NOT NULL;
  
  -- PAR-Q injuries/conditions text
  RETURN QUERY
  SELECT 
    'plaintext_phi'::text,
    'parq_injuries_conditions'::text,
    COUNT(*)::bigint,
    CASE WHEN COUNT(*) > 0 THEN 'critical' ELSE 'ok' END::text,
    CASE WHEN COUNT(*) > 0 
      THEN 'Found ' || COUNT(*) || ' records with plaintext PAR-Q text'
      ELSE 'No plaintext PAR-Q text found'
    END::text
  FROM form_submissions WHERE parq_injuries_conditions IS NOT NULL;
  
  -- PAR-Q additional details text
  RETURN QUERY
  SELECT 
    'plaintext_phi'::text,
    'parq_additional_details'::text,
    COUNT(*)::bigint,
    CASE WHEN COUNT(*) > 0 THEN 'critical' ELSE 'ok' END::text,
    CASE WHEN COUNT(*) > 0 
      THEN 'Found ' || COUNT(*) || ' records with plaintext PAR-Q text'
      ELSE 'No plaintext PAR-Q text found'
    END::text
  FROM form_submissions WHERE parq_additional_details IS NOT NULL;
  
  -- Also check for encrypted fields that should exist
  RETURN QUERY
  SELECT 
    'missing_encryption'::text as violation_type,
    'email_encrypted'::text as field_name,
    COUNT(*)::bigint as record_count,
    CASE WHEN COUNT(*) > 0 THEN 'warning' ELSE 'ok' END::text as severity,
    CASE WHEN COUNT(*) > 0 
      THEN 'Found ' || COUNT(*) || ' records missing encrypted email'
      ELSE 'All emails properly encrypted'
    END::text as description
  FROM form_submissions 
  WHERE email_encrypted IS NULL 
    AND user_id IS NOT NULL;
  
  RETURN QUERY
  SELECT 
    'missing_encryption'::text,
    'phone_number_encrypted'::text,
    COUNT(*)::bigint,
    CASE WHEN COUNT(*) > 0 THEN 'warning' ELSE 'ok' END::text,
    CASE WHEN COUNT(*) > 0 
      THEN 'Found ' || COUNT(*) || ' records missing encrypted phone'
      ELSE 'All phones properly encrypted'
    END::text
  FROM form_submissions 
  WHERE phone_number_encrypted IS NULL 
    AND user_id IS NOT NULL;
END;
$$;

-- Grant execute permission to authenticated users (admin-only via RLS on calling code)
GRANT EXECUTE ON FUNCTION public.scan_phi_plaintext_violations() TO authenticated;

-- ============================================================
-- STEP 3: Create a table to log PHI scan results for historical tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS public.phi_compliance_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scanned_at timestamptz NOT NULL DEFAULT now(),
  scanned_by uuid REFERENCES auth.users(id),
  total_violations integer NOT NULL DEFAULT 0,
  critical_violations integer NOT NULL DEFAULT 0,
  warning_violations integer NOT NULL DEFAULT 0,
  scan_results jsonb NOT NULL DEFAULT '[]',
  notes text
);

-- Enable RLS
ALTER TABLE public.phi_compliance_scans ENABLE ROW LEVEL SECURITY;

-- Only admins can access scan results
CREATE POLICY "phi_compliance_scans_admin_only"
ON public.phi_compliance_scans
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Grant access
GRANT SELECT, INSERT ON public.phi_compliance_scans TO authenticated;
