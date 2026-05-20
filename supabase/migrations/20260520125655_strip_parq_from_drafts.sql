-- One-time cleanup: strip plaintext PAR-Q (medical PHI) from onboarding_drafts.
-- onboarding_drafts.form_data is unencrypted JSONB; PAR-Q answers were auto-saved
-- there in plaintext before the app stopped persisting them. form_submissions
-- encrypts PAR-Q at rest via encrypt_phi_trigger -- drafts have no equivalent.
-- The `-` operator drops a top-level key (no-op if absent); the `?|` WHERE clause
-- skips rows that carry none of the keys.
UPDATE public.onboarding_drafts
SET form_data = form_data - 'parq_heart_condition'
                         - 'parq_chest_pain_active'
                         - 'parq_chest_pain_inactive'
                         - 'parq_balance_dizziness'
                         - 'parq_bone_joint_problem'
                         - 'parq_medication'
                         - 'parq_other_reason'
                         - 'parq_injuries_conditions'
                         - 'parq_additional_details'
WHERE form_data ?| ARRAY[
  'parq_heart_condition','parq_chest_pain_active','parq_chest_pain_inactive',
  'parq_balance_dizziness','parq_bone_joint_problem','parq_medication',
  'parq_other_reason','parq_injuries_conditions','parq_additional_details'
];
