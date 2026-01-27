-- Add timestamp columns for legal agreement acceptances
ALTER TABLE public.form_submissions
ADD COLUMN agreed_terms_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN agreed_privacy_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN agreed_refund_policy_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN agreed_intellectual_property_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN agreed_medical_disclaimer_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.form_submissions.agreed_terms_at IS 'Timestamp when user accepted Terms and Conditions';
COMMENT ON COLUMN public.form_submissions.agreed_privacy_at IS 'Timestamp when user accepted Privacy Policy';
COMMENT ON COLUMN public.form_submissions.agreed_refund_policy_at IS 'Timestamp when user accepted Refund Policy';
COMMENT ON COLUMN public.form_submissions.agreed_intellectual_property_at IS 'Timestamp when user accepted IP Protection';
COMMENT ON COLUMN public.form_submissions.agreed_medical_disclaimer_at IS 'Timestamp when user accepted Medical Disclaimer';