-- Add payment_exempt flag to profiles table
ALTER TABLE public.profiles
ADD COLUMN payment_exempt BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.payment_exempt IS 'True for manually created clients who are exempt from payment requirements';