-- =============================================================================
-- FIX SECURITY DEFINER VIEW WARNINGS
-- Convert views to use SECURITY INVOKER so RLS policies are respected
-- =============================================================================

-- Recreate form_submissions_decrypted with SECURITY INVOKER
DROP VIEW IF EXISTS public.form_submissions_decrypted;
CREATE VIEW public.form_submissions_decrypted 
WITH (security_invoker = true) AS
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
  -- Decrypted PHI fields (only accessible for admins and data owner)
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
  -- Encrypted versions
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

-- Recreate form_submissions_coach_view with SECURITY INVOKER
DROP VIEW IF EXISTS public.form_submissions_coach_view;
CREATE VIEW public.form_submissions_coach_view 
WITH (security_invoker = true) AS
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
  CASE WHEN fs.parq_injuries_conditions_encrypted IS NOT NULL THEN true ELSE false END as has_injuries_conditions,
  CASE WHEN fs.parq_additional_details_encrypted IS NOT NULL THEN true ELSE false END as has_additional_details,
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

-- Re-grant permissions
GRANT SELECT ON public.form_submissions_decrypted TO authenticated;
GRANT SELECT ON public.form_submissions_coach_view TO authenticated;

-- Add documentation
COMMENT ON VIEW public.form_submissions_decrypted IS 'Secure view with SECURITY INVOKER that auto-decrypts PHI for admins and data owners only. RLS is enforced.';
COMMENT ON VIEW public.form_submissions_coach_view IS 'Coach view with SECURITY INVOKER showing submission metadata without decrypted PHI. RLS is enforced.';