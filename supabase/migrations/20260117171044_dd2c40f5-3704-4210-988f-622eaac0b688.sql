-- Create coaches_public view with ONLY safe public fields (no age, no PII)
-- This is the ONLY view clients should query for coach listings
CREATE OR REPLACE VIEW public.coaches_public AS
SELECT 
  id,
  user_id,
  first_name,
  last_name,
  nickname,
  short_bio,
  bio,
  location,
  profile_picture_url,
  qualifications,
  specializations,
  specialties,
  status,
  max_onetoone_clients,
  max_team_clients,
  gender,
  created_at,
  updated_at,
  last_assigned_at
FROM public.coaches
WHERE status IN ('approved', 'active');

-- Add comment explaining the view's purpose
COMMENT ON VIEW public.coaches_public IS 'Public-safe coach data for client-facing queries. No age, email, DOB, or contact info exposed.';

-- Drop the old public_coach_profiles view if it exists (it exposed age)
DROP VIEW IF EXISTS public.public_coach_profiles;

-- Tighten coach_contacts RLS: remove the policy that lets active clients view contact info
-- Clients should NEVER see coach contact details directly
DROP POLICY IF EXISTS "Active clients can view assigned coach contact" ON public.coach_contacts;

-- Add a comment explaining the security model
COMMENT ON TABLE public.coach_contacts IS 'Private coach contact information. Only accessible by admins and the coach themselves. Clients contact coaches via edge functions only.';