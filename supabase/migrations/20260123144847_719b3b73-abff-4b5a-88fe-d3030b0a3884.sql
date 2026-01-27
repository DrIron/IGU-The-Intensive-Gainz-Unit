
-- STEP 2: Scrub plaintext columns
UPDATE public.form_submissions SET
  email = NULL, phone_number = NULL, date_of_birth = NULL,
  parq_heart_condition = NULL, parq_chest_pain_active = NULL, parq_chest_pain_inactive = NULL,
  parq_balance_dizziness = NULL, parq_bone_joint_problem = NULL, parq_medication = NULL,
  parq_other_reason = NULL, parq_injuries_conditions = NULL, parq_additional_details = NULL;

-- STEP 3: Update trigger to use existing function
DROP TRIGGER IF EXISTS encrypt_phi_trigger ON public.form_submissions;
CREATE TRIGGER encrypt_phi_trigger
  BEFORE INSERT OR UPDATE ON public.form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_phi_on_form_submission();

-- STEP 4: Update decrypted view
DROP VIEW IF EXISTS public.form_submissions_decrypted;
CREATE VIEW public.form_submissions_decrypted WITH (security_invoker = true) AS
SELECT 
  id, form_type, user_id, first_name, last_name,
  public.decrypt_phi_text(email_encrypted) as email,
  public.decrypt_phi_text(phone_number_encrypted) as phone_number,
  public.decrypt_phi_date(date_of_birth_encrypted) as date_of_birth,
  discord_username, heard_about_us, heard_about_us_other,
  preferred_coach_id, training_goals, training_experience, plan_name,
  public.decrypt_phi_boolean(parq_heart_condition_encrypted) as parq_heart_condition,
  public.decrypt_phi_boolean(parq_chest_pain_active_encrypted) as parq_chest_pain_active,
  public.decrypt_phi_boolean(parq_chest_pain_inactive_encrypted) as parq_chest_pain_inactive,
  public.decrypt_phi_boolean(parq_balance_dizziness_encrypted) as parq_balance_dizziness,
  public.decrypt_phi_boolean(parq_bone_joint_problem_encrypted) as parq_bone_joint_problem,
  public.decrypt_phi_boolean(parq_medication_encrypted) as parq_medication,
  public.decrypt_phi_boolean(parq_other_reason_encrypted) as parq_other_reason,
  public.decrypt_phi_text(parq_injuries_conditions_encrypted) as parq_injuries_conditions,
  public.decrypt_phi_text(parq_additional_details_encrypted) as parq_additional_details,
  needs_medical_review, preferred_training_times, preferred_gym_location,
  training_days_per_week, gym_access_type, home_gym_equipment,
  accepts_team_program, accepts_lower_body_only, understands_no_nutrition,
  agreed_terms, agreed_privacy, agreed_medical_disclaimer, agreed_refund_policy,
  nutrition_approach, submission_status, airtable_record_id, created_at, updated_at,
  master_agreement_url, liability_release_url, documents_verified, verified_by_coach_id,
  verified_at, payment_enabled, cancelled_at, cancellation_reason,
  coach_uploaded_agreement_url, coach_uploaded_liability_url,
  client_signed_agreement_url, client_signed_liability_url,
  documents_approved_by_coach, documents_approved_at, agreed_intellectual_property,
  agreed_terms_at, agreed_privacy_at, agreed_refund_policy_at,
  agreed_intellectual_property_at, agreed_medical_disclaimer_at,
  focus_areas, coach_preference_type, requested_coach_id
FROM public.form_submissions;

-- STEP 5: Update coach view (NO PHI)
DROP VIEW IF EXISTS public.form_submissions_coach_view;
CREATE VIEW public.form_submissions_coach_view WITH (security_invoker = true) AS
SELECT 
  id, form_type, user_id, first_name, last_name,
  discord_username, heard_about_us, heard_about_us_other,
  preferred_coach_id, training_goals, training_experience, plan_name,
  needs_medical_review,
  preferred_training_times, preferred_gym_location, training_days_per_week,
  gym_access_type, home_gym_equipment, accepts_team_program, accepts_lower_body_only,
  understands_no_nutrition, agreed_terms, agreed_privacy, agreed_medical_disclaimer,
  agreed_refund_policy, agreed_intellectual_property, nutrition_approach,
  submission_status, created_at, updated_at, documents_verified, verified_by_coach_id,
  verified_at, payment_enabled, cancelled_at, cancellation_reason,
  documents_approved_by_coach, documents_approved_at, focus_areas,
  coach_preference_type, requested_coach_id
FROM public.form_submissions;

-- STEP 6: RLS policies
DROP POLICY IF EXISTS "form_submissions_admin_all" ON public.form_submissions;
DROP POLICY IF EXISTS "form_submissions_user_insert" ON public.form_submissions;
DROP POLICY IF EXISTS "form_submissions_user_select" ON public.form_submissions;
DROP POLICY IF EXISTS "form_submissions_coach_select" ON public.form_submissions;

CREATE POLICY "form_submissions_admin_all" ON public.form_submissions
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "form_submissions_user_insert" ON public.form_submissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "form_submissions_user_select" ON public.form_submissions
  FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.is_coach_for_submission(submission_user_id uuid)
RETURNS boolean AS $$
DECLARE current_coach_id uuid;
BEGIN
  SELECT id INTO current_coach_id FROM public.coaches 
  WHERE user_id = auth.uid() AND status = 'active';
  IF current_coach_id IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM public.subscriptions 
    WHERE user_id = submission_user_id AND coach_id = current_coach_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE POLICY "form_submissions_coach_select" ON public.form_submissions
  FOR SELECT USING (
    public.has_role(auth.uid(), 'coach'::app_role) 
    AND public.is_coach_for_submission(user_id)
  );

GRANT SELECT ON public.form_submissions_decrypted TO authenticated;
GRANT SELECT ON public.form_submissions_coach_view TO authenticated;
