-- =============================================================================
-- PHI ENCRYPTION FOR FORM_SUBMISSIONS TABLE
-- Uses pgcrypto (in extensions schema) with PHI_ENCRYPTION_KEY from secrets
-- =============================================================================

-- Step 1: Create a function to safely get the encryption key
-- This will raise an exception if the key is not configured
CREATE OR REPLACE FUNCTION public.get_phi_encryption_key()
RETURNS text AS $$
DECLARE
  key_value text;
BEGIN
  -- Attempt to get the key from app settings (set via Supabase secrets)
  key_value := current_setting('app.phi_encryption_key', true);
  
  IF key_value IS NULL OR key_value = '' THEN
    RAISE EXCEPTION 'PHI_ENCRYPTION_KEY is not configured. Cannot proceed with encryption.';
  END IF;
  
  RETURN key_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, extensions;

-- Step 2: Create encryption function for text fields
CREATE OR REPLACE FUNCTION public.encrypt_phi_text(plain_text text)
RETURNS text AS $$
BEGIN
  IF plain_text IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Encrypt using pgp_sym_encrypt from extensions schema and encode as base64
  RETURN encode(
    extensions.pgp_sym_encrypt(plain_text::bytea, get_phi_encryption_key()),
    'base64'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Step 3: Create encryption function for boolean fields (stored as encrypted text)
CREATE OR REPLACE FUNCTION public.encrypt_phi_boolean(bool_value boolean)
RETURNS text AS $$
BEGIN
  IF bool_value IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Convert boolean to text and encrypt
  RETURN encode(
    extensions.pgp_sym_encrypt((bool_value::text)::bytea, get_phi_encryption_key()),
    'base64'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Step 4: Create encryption function for date fields
CREATE OR REPLACE FUNCTION public.encrypt_phi_date(date_value date)
RETURNS text AS $$
BEGIN
  IF date_value IS NULL THEN
    RETURN NULL;
  END IF;
  
  RETURN encode(
    extensions.pgp_sym_encrypt((date_value::text)::bytea, get_phi_encryption_key()),
    'base64'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Step 5: Create decryption function for text fields
CREATE OR REPLACE FUNCTION public.decrypt_phi_text(encrypted_text text)
RETURNS text AS $$
BEGIN
  IF encrypted_text IS NULL THEN
    RETURN NULL;
  END IF;
  
  RETURN convert_from(
    extensions.pgp_sym_decrypt(
      decode(encrypted_text, 'base64'),
      get_phi_encryption_key()
    ),
    'UTF8'
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Return NULL if decryption fails (wrong key, corrupted data, etc.)
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Step 6: Create decryption function for boolean fields
CREATE OR REPLACE FUNCTION public.decrypt_phi_boolean(encrypted_text text)
RETURNS boolean AS $$
DECLARE
  decrypted_value text;
BEGIN
  IF encrypted_text IS NULL THEN
    RETURN NULL;
  END IF;
  
  decrypted_value := convert_from(
    extensions.pgp_sym_decrypt(
      decode(encrypted_text, 'base64'),
      get_phi_encryption_key()
    ),
    'UTF8'
  );
  
  RETURN decrypted_value::boolean;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Step 7: Create decryption function for date fields
CREATE OR REPLACE FUNCTION public.decrypt_phi_date(encrypted_text text)
RETURNS date AS $$
DECLARE
  decrypted_value text;
BEGIN
  IF encrypted_text IS NULL THEN
    RETURN NULL;
  END IF;
  
  decrypted_value := convert_from(
    extensions.pgp_sym_decrypt(
      decode(encrypted_text, 'base64'),
      get_phi_encryption_key()
    ),
    'UTF8'
  );
  
  RETURN decrypted_value::date;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Step 8: Add encrypted columns to form_submissions table
ALTER TABLE public.form_submissions 
ADD COLUMN IF NOT EXISTS parq_heart_condition_encrypted text,
ADD COLUMN IF NOT EXISTS parq_chest_pain_active_encrypted text,
ADD COLUMN IF NOT EXISTS parq_chest_pain_inactive_encrypted text,
ADD COLUMN IF NOT EXISTS parq_balance_dizziness_encrypted text,
ADD COLUMN IF NOT EXISTS parq_bone_joint_problem_encrypted text,
ADD COLUMN IF NOT EXISTS parq_medication_encrypted text,
ADD COLUMN IF NOT EXISTS parq_other_reason_encrypted text,
ADD COLUMN IF NOT EXISTS parq_injuries_conditions_encrypted text,
ADD COLUMN IF NOT EXISTS parq_additional_details_encrypted text,
ADD COLUMN IF NOT EXISTS date_of_birth_encrypted text;

-- Step 9: Create trigger function for automatic encryption on INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.encrypt_phi_on_form_submission()
RETURNS TRIGGER AS $$
BEGIN
  -- Encrypt PAR-Q boolean fields
  NEW.parq_heart_condition_encrypted := encrypt_phi_boolean(NEW.parq_heart_condition);
  NEW.parq_chest_pain_active_encrypted := encrypt_phi_boolean(NEW.parq_chest_pain_active);
  NEW.parq_chest_pain_inactive_encrypted := encrypt_phi_boolean(NEW.parq_chest_pain_inactive);
  NEW.parq_balance_dizziness_encrypted := encrypt_phi_boolean(NEW.parq_balance_dizziness);
  NEW.parq_bone_joint_problem_encrypted := encrypt_phi_boolean(NEW.parq_bone_joint_problem);
  NEW.parq_medication_encrypted := encrypt_phi_boolean(NEW.parq_medication);
  NEW.parq_other_reason_encrypted := encrypt_phi_boolean(NEW.parq_other_reason);
  
  -- Encrypt text fields (injuries/conditions)
  NEW.parq_injuries_conditions_encrypted := encrypt_phi_text(NEW.parq_injuries_conditions);
  NEW.parq_additional_details_encrypted := encrypt_phi_text(NEW.parq_additional_details);
  
  -- Encrypt date of birth
  NEW.date_of_birth_encrypted := encrypt_phi_date(NEW.date_of_birth);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Step 10: Apply encryption trigger
DROP TRIGGER IF EXISTS encrypt_phi_trigger ON public.form_submissions;
CREATE TRIGGER encrypt_phi_trigger
BEFORE INSERT OR UPDATE ON public.form_submissions
FOR EACH ROW
EXECUTE FUNCTION public.encrypt_phi_on_form_submission();

-- Step 11: Create a secure view for authorized access with automatic decryption
-- This view decrypts PHI only for admins and the data owner
DROP VIEW IF EXISTS public.form_submissions_decrypted;
CREATE VIEW public.form_submissions_decrypted AS
SELECT 
  id,
  form_type,
  user_id,
  first_name,
  last_name,
  email,
  phone_number,
  discord_username,
  heard_about_us,
  heard_about_us_other,
  preferred_coach_id,
  training_goals,
  training_experience,
  plan_name,
  -- Decrypted PHI fields (only accessible via view with proper RLS)
  CASE 
    WHEN has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = user_id 
    THEN decrypt_phi_boolean(parq_heart_condition_encrypted)
    ELSE NULL
  END as parq_heart_condition_decrypted,
  CASE 
    WHEN has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = user_id 
    THEN decrypt_phi_boolean(parq_chest_pain_active_encrypted)
    ELSE NULL
  END as parq_chest_pain_active_decrypted,
  CASE 
    WHEN has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = user_id 
    THEN decrypt_phi_boolean(parq_chest_pain_inactive_encrypted)
    ELSE NULL
  END as parq_chest_pain_inactive_decrypted,
  CASE 
    WHEN has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = user_id 
    THEN decrypt_phi_boolean(parq_balance_dizziness_encrypted)
    ELSE NULL
  END as parq_balance_dizziness_decrypted,
  CASE 
    WHEN has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = user_id 
    THEN decrypt_phi_boolean(parq_bone_joint_problem_encrypted)
    ELSE NULL
  END as parq_bone_joint_problem_decrypted,
  CASE 
    WHEN has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = user_id 
    THEN decrypt_phi_boolean(parq_medication_encrypted)
    ELSE NULL
  END as parq_medication_decrypted,
  CASE 
    WHEN has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = user_id 
    THEN decrypt_phi_boolean(parq_other_reason_encrypted)
    ELSE NULL
  END as parq_other_reason_decrypted,
  CASE 
    WHEN has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = user_id 
    THEN decrypt_phi_text(parq_injuries_conditions_encrypted)
    ELSE NULL
  END as parq_injuries_conditions_decrypted,
  CASE 
    WHEN has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = user_id 
    THEN decrypt_phi_text(parq_additional_details_encrypted)
    ELSE NULL
  END as parq_additional_details_decrypted,
  CASE 
    WHEN has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = user_id 
    THEN decrypt_phi_date(date_of_birth_encrypted)
    ELSE NULL
  END as date_of_birth_decrypted,
  -- Keep encrypted versions for reference
  parq_heart_condition_encrypted,
  parq_chest_pain_active_encrypted,
  parq_chest_pain_inactive_encrypted,
  parq_balance_dizziness_encrypted,
  parq_bone_joint_problem_encrypted,
  parq_medication_encrypted,
  parq_other_reason_encrypted,
  parq_injuries_conditions_encrypted,
  parq_additional_details_encrypted,
  date_of_birth_encrypted,
  -- Non-PHI fields
  needs_medical_review,
  preferred_training_times,
  preferred_gym_location,
  training_days_per_week,
  gym_access_type,
  home_gym_equipment,
  accepts_team_program,
  accepts_lower_body_only,
  understands_no_nutrition,
  agreed_terms,
  agreed_privacy,
  agreed_medical_disclaimer,
  agreed_refund_policy,
  agreed_intellectual_property,
  nutrition_approach,
  submission_status,
  airtable_record_id,
  created_at,
  updated_at,
  master_agreement_url,
  liability_release_url,
  documents_verified,
  verified_by_coach_id,
  verified_at,
  payment_enabled,
  cancelled_at,
  cancellation_reason,
  coach_uploaded_agreement_url,
  coach_uploaded_liability_url,
  client_signed_agreement_url,
  client_signed_liability_url,
  documents_approved_by_coach,
  documents_approved_at,
  agreed_terms_at,
  agreed_privacy_at,
  agreed_refund_policy_at,
  agreed_intellectual_property_at,
  agreed_medical_disclaimer_at,
  focus_areas,
  coach_preference_type,
  requested_coach_id
FROM public.form_submissions;

-- Step 12: Create a coach-specific view that shows PHI metadata without decrypted values
DROP VIEW IF EXISTS public.form_submissions_coach_view;
CREATE VIEW public.form_submissions_coach_view AS
SELECT 
  fs.id,
  fs.form_type,
  fs.user_id,
  fs.first_name,
  fs.last_name,
  fs.email,
  fs.training_goals,
  fs.training_experience,
  fs.plan_name,
  fs.needs_medical_review,
  -- Show only that PHI exists, not the values
  CASE WHEN fs.parq_injuries_conditions_encrypted IS NOT NULL THEN true ELSE false END as has_injuries_conditions,
  CASE WHEN fs.parq_additional_details_encrypted IS NOT NULL THEN true ELSE false END as has_additional_details,
  -- Non-PHI fields coaches can access
  fs.preferred_training_times,
  fs.preferred_gym_location,
  fs.training_days_per_week,
  fs.gym_access_type,
  fs.focus_areas,
  fs.created_at,
  fs.updated_at
FROM public.form_submissions fs
WHERE has_role(auth.uid(), 'coach'::app_role)
  AND fs.user_id IN (
    SELECT s.user_id FROM subscriptions s 
    WHERE s.coach_id = auth.uid() 
    AND s.status IN ('active', 'pending')
  );

-- Step 13: Grant appropriate permissions on the views
GRANT SELECT ON public.form_submissions_decrypted TO authenticated;
GRANT SELECT ON public.form_submissions_coach_view TO authenticated;

-- Step 14: Add comments for documentation
COMMENT ON FUNCTION public.get_phi_encryption_key() IS 'Retrieves PHI encryption key from app settings. Fails safely if key not configured.';
COMMENT ON FUNCTION public.encrypt_phi_text(text) IS 'Encrypts text PHI data using pgp_sym_encrypt with the PHI key.';
COMMENT ON FUNCTION public.decrypt_phi_text(text) IS 'Decrypts text PHI data. Returns NULL on decryption failure.';
COMMENT ON VIEW public.form_submissions_decrypted IS 'Secure view that auto-decrypts PHI for admins and data owners only.';
COMMENT ON VIEW public.form_submissions_coach_view IS 'Coach view showing submission metadata without decrypted PHI.';