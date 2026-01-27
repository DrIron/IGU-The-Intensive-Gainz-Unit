-- ============================================================
-- SECURE PHI ACCESS: RPC functions with authorization checks
-- Replaces direct view access with controlled, audited functions
-- ============================================================

-- ============================================================
-- FUNCTION 1: get_form_submission_phi(submission_id)
-- Admin or owner can retrieve decrypted PHI for a specific submission
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_form_submission_phi(p_submission_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  first_name text,
  last_name text,
  email text,
  phone_number text,
  date_of_birth date,
  parq_heart_condition boolean,
  parq_chest_pain_active boolean,
  parq_chest_pain_inactive boolean,
  parq_balance_dizziness boolean,
  parq_bone_joint_problem boolean,
  parq_medication boolean,
  parq_other_reason boolean,
  parq_injuries_conditions text,
  parq_additional_details text,
  needs_medical_review boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_requester_id uuid;
  v_is_admin boolean;
  v_submission_owner uuid;
  v_encryption_key text;
BEGIN
  -- Get requester identity
  v_requester_id := auth.uid();
  
  IF v_requester_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Check if requester is admin
  v_is_admin := has_role(v_requester_id, 'admin'::app_role);
  
  -- Get submission owner
  SELECT fs.user_id INTO v_submission_owner
  FROM form_submissions fs
  WHERE fs.id = p_submission_id;
  
  IF v_submission_owner IS NULL THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;
  
  -- Authorization check: must be admin OR owner
  IF NOT v_is_admin AND v_requester_id != v_submission_owner THEN
    RAISE EXCEPTION 'Access denied: You do not have permission to view this submission';
  END IF;
  
  -- Get encryption key
  v_encryption_key := get_phi_encryption_key();
  
  -- Log PHI access for audit trail
  PERFORM log_phi_access(
    v_requester_id,
    v_submission_owner,
    'rpc_get_form_submission_phi',
    'form_submissions',
    p_submission_id,
    ARRAY['email', 'phone_number', 'date_of_birth', 'parq_fields'],
    NULL, NULL, NULL,
    jsonb_build_object('is_admin', v_is_admin)
  );
  
  -- Return decrypted PHI
  RETURN QUERY
  SELECT 
    fs.id,
    fs.user_id,
    fs.first_name,
    fs.last_name,
    -- Decrypt email
    CASE WHEN fs.email_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.email_encrypted, 'base64'), v_encryption_key)::text
    ELSE NULL END as email,
    -- Decrypt phone
    CASE WHEN fs.phone_number_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.phone_number_encrypted, 'base64'), v_encryption_key)::text
    ELSE NULL END as phone_number,
    -- Decrypt DOB
    CASE WHEN fs.date_of_birth_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.date_of_birth_encrypted, 'base64'), v_encryption_key)::date
    ELSE NULL END as date_of_birth,
    -- Decrypt PAR-Q booleans
    CASE WHEN fs.parq_heart_condition_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.parq_heart_condition_encrypted, 'base64'), v_encryption_key)::boolean
    ELSE NULL END as parq_heart_condition,
    CASE WHEN fs.parq_chest_pain_active_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.parq_chest_pain_active_encrypted, 'base64'), v_encryption_key)::boolean
    ELSE NULL END as parq_chest_pain_active,
    CASE WHEN fs.parq_chest_pain_inactive_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.parq_chest_pain_inactive_encrypted, 'base64'), v_encryption_key)::boolean
    ELSE NULL END as parq_chest_pain_inactive,
    CASE WHEN fs.parq_balance_dizziness_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.parq_balance_dizziness_encrypted, 'base64'), v_encryption_key)::boolean
    ELSE NULL END as parq_balance_dizziness,
    CASE WHEN fs.parq_bone_joint_problem_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.parq_bone_joint_problem_encrypted, 'base64'), v_encryption_key)::boolean
    ELSE NULL END as parq_bone_joint_problem,
    CASE WHEN fs.parq_medication_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.parq_medication_encrypted, 'base64'), v_encryption_key)::boolean
    ELSE NULL END as parq_medication,
    CASE WHEN fs.parq_other_reason_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.parq_other_reason_encrypted, 'base64'), v_encryption_key)::boolean
    ELSE NULL END as parq_other_reason,
    -- Decrypt PAR-Q text fields
    CASE WHEN fs.parq_injuries_conditions_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.parq_injuries_conditions_encrypted, 'base64'), v_encryption_key)::text
    ELSE NULL END as parq_injuries_conditions,
    CASE WHEN fs.parq_additional_details_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.parq_additional_details_encrypted, 'base64'), v_encryption_key)::text
    ELSE NULL END as parq_additional_details,
    fs.needs_medical_review
  FROM form_submissions fs
  WHERE fs.id = p_submission_id;
END;
$$;

-- ============================================================
-- FUNCTION 2: get_my_latest_form_submission_phi()
-- Client self-service: returns their own latest submission PHI
-- No submission_id input to prevent IDOR attacks
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_latest_form_submission_phi()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  first_name text,
  last_name text,
  email text,
  phone_number text,
  date_of_birth date,
  parq_heart_condition boolean,
  parq_chest_pain_active boolean,
  parq_chest_pain_inactive boolean,
  parq_balance_dizziness boolean,
  parq_bone_joint_problem boolean,
  parq_medication boolean,
  parq_other_reason boolean,
  parq_injuries_conditions text,
  parq_additional_details text,
  needs_medical_review boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_requester_id uuid;
  v_encryption_key text;
  v_submission_id uuid;
BEGIN
  -- Get requester identity
  v_requester_id := auth.uid();
  
  IF v_requester_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Find the user's latest submission
  SELECT fs.id INTO v_submission_id
  FROM form_submissions fs
  WHERE fs.user_id = v_requester_id
  ORDER BY fs.created_at DESC
  LIMIT 1;
  
  IF v_submission_id IS NULL THEN
    -- No submission found, return empty
    RETURN;
  END IF;
  
  -- Get encryption key
  v_encryption_key := get_phi_encryption_key();
  
  -- Log PHI access for audit trail
  PERFORM log_phi_access(
    v_requester_id,
    v_requester_id,
    'rpc_get_my_latest_form_submission_phi',
    'form_submissions',
    v_submission_id,
    ARRAY['email', 'phone_number', 'date_of_birth', 'parq_fields'],
    NULL, NULL, NULL,
    jsonb_build_object('self_access', true)
  );
  
  -- Return decrypted PHI for the user's own submission
  RETURN QUERY
  SELECT 
    fs.id,
    fs.user_id,
    fs.first_name,
    fs.last_name,
    -- Decrypt email
    CASE WHEN fs.email_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.email_encrypted, 'base64'), v_encryption_key)::text
    ELSE NULL END as email,
    -- Decrypt phone
    CASE WHEN fs.phone_number_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.phone_number_encrypted, 'base64'), v_encryption_key)::text
    ELSE NULL END as phone_number,
    -- Decrypt DOB
    CASE WHEN fs.date_of_birth_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.date_of_birth_encrypted, 'base64'), v_encryption_key)::date
    ELSE NULL END as date_of_birth,
    -- Decrypt PAR-Q booleans
    CASE WHEN fs.parq_heart_condition_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.parq_heart_condition_encrypted, 'base64'), v_encryption_key)::boolean
    ELSE NULL END as parq_heart_condition,
    CASE WHEN fs.parq_chest_pain_active_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.parq_chest_pain_active_encrypted, 'base64'), v_encryption_key)::boolean
    ELSE NULL END as parq_chest_pain_active,
    CASE WHEN fs.parq_chest_pain_inactive_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.parq_chest_pain_inactive_encrypted, 'base64'), v_encryption_key)::boolean
    ELSE NULL END as parq_chest_pain_inactive,
    CASE WHEN fs.parq_balance_dizziness_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.parq_balance_dizziness_encrypted, 'base64'), v_encryption_key)::boolean
    ELSE NULL END as parq_balance_dizziness,
    CASE WHEN fs.parq_bone_joint_problem_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.parq_bone_joint_problem_encrypted, 'base64'), v_encryption_key)::boolean
    ELSE NULL END as parq_bone_joint_problem,
    CASE WHEN fs.parq_medication_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.parq_medication_encrypted, 'base64'), v_encryption_key)::boolean
    ELSE NULL END as parq_medication,
    CASE WHEN fs.parq_other_reason_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.parq_other_reason_encrypted, 'base64'), v_encryption_key)::boolean
    ELSE NULL END as parq_other_reason,
    -- Decrypt PAR-Q text fields
    CASE WHEN fs.parq_injuries_conditions_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.parq_injuries_conditions_encrypted, 'base64'), v_encryption_key)::text
    ELSE NULL END as parq_injuries_conditions,
    CASE WHEN fs.parq_additional_details_encrypted IS NOT NULL THEN
      extensions.pgp_sym_decrypt(decode(fs.parq_additional_details_encrypted, 'base64'), v_encryption_key)::text
    ELSE NULL END as parq_additional_details,
    fs.needs_medical_review,
    fs.created_at
  FROM form_submissions fs
  WHERE fs.id = v_submission_id;
END;
$$;

-- ============================================================
-- PERMISSIONS: Secure access control
-- ============================================================

-- Revoke execute from anon (public/unauthenticated)
REVOKE EXECUTE ON FUNCTION public.get_form_submission_phi(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_latest_form_submission_phi() FROM anon;

-- Grant execute to authenticated users (authorization checked inside function)
GRANT EXECUTE ON FUNCTION public.get_form_submission_phi(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_latest_form_submission_phi() TO authenticated;

-- Grant to service_role for edge functions
GRANT EXECUTE ON FUNCTION public.get_form_submission_phi(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_latest_form_submission_phi() TO service_role;

-- ============================================================
-- DOCUMENTATION
-- ============================================================
COMMENT ON FUNCTION public.get_form_submission_phi(uuid) IS 
'SECURITY: Returns decrypted PHI for a form submission. Access restricted to:
- Admins (can view any submission)
- Submission owner (can view only their own)
All access is logged to phi_access_audit_log. Never expose decrypted PHI via views.';

COMMENT ON FUNCTION public.get_my_latest_form_submission_phi() IS 
'SECURITY: Client self-service function to retrieve their own latest form submission PHI.
No submission_id parameter to prevent IDOR attacks. All access is logged.';