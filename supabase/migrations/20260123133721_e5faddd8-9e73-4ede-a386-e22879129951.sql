
-- Drop NOT NULL constraints on ALL remaining PHI plaintext columns
ALTER TABLE public.form_submissions ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.form_submissions ALTER COLUMN phone_number DROP NOT NULL;
ALTER TABLE public.form_submissions ALTER COLUMN parq_heart_condition DROP NOT NULL;
ALTER TABLE public.form_submissions ALTER COLUMN parq_chest_pain_active DROP NOT NULL;
ALTER TABLE public.form_submissions ALTER COLUMN parq_chest_pain_inactive DROP NOT NULL;
ALTER TABLE public.form_submissions ALTER COLUMN parq_balance_dizziness DROP NOT NULL;
ALTER TABLE public.form_submissions ALTER COLUMN parq_bone_joint_problem DROP NOT NULL;
ALTER TABLE public.form_submissions ALTER COLUMN parq_medication DROP NOT NULL;
ALTER TABLE public.form_submissions ALTER COLUMN parq_other_reason DROP NOT NULL;

-- Add encrypted columns for email/phone if missing
ALTER TABLE public.form_submissions 
ADD COLUMN IF NOT EXISTS email_encrypted text,
ADD COLUMN IF NOT EXISTS phone_number_encrypted text;
