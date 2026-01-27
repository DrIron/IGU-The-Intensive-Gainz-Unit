
-- STEP 1: Backfill encrypted columns only
UPDATE public.form_submissions SET
  email_encrypted = COALESCE(email_encrypted, public.encrypt_phi_text(email)),
  phone_number_encrypted = COALESCE(phone_number_encrypted, public.encrypt_phi_text(phone_number)),
  date_of_birth_encrypted = COALESCE(date_of_birth_encrypted, public.encrypt_phi_date(date_of_birth)),
  parq_heart_condition_encrypted = COALESCE(parq_heart_condition_encrypted, public.encrypt_phi_boolean(parq_heart_condition)),
  parq_chest_pain_active_encrypted = COALESCE(parq_chest_pain_active_encrypted, public.encrypt_phi_boolean(parq_chest_pain_active)),
  parq_chest_pain_inactive_encrypted = COALESCE(parq_chest_pain_inactive_encrypted, public.encrypt_phi_boolean(parq_chest_pain_inactive)),
  parq_balance_dizziness_encrypted = COALESCE(parq_balance_dizziness_encrypted, public.encrypt_phi_boolean(parq_balance_dizziness)),
  parq_bone_joint_problem_encrypted = COALESCE(parq_bone_joint_problem_encrypted, public.encrypt_phi_boolean(parq_bone_joint_problem)),
  parq_medication_encrypted = COALESCE(parq_medication_encrypted, public.encrypt_phi_boolean(parq_medication)),
  parq_other_reason_encrypted = COALESCE(parq_other_reason_encrypted, public.encrypt_phi_boolean(parq_other_reason)),
  parq_injuries_conditions_encrypted = COALESCE(parq_injuries_conditions_encrypted, public.encrypt_phi_text(parq_injuries_conditions)),
  parq_additional_details_encrypted = COALESCE(parq_additional_details_encrypted, public.encrypt_phi_text(parq_additional_details));
