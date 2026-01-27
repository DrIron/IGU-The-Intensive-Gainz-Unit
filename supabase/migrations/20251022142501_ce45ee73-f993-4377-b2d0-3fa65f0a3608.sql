-- Create a view for public coach profiles that excludes sensitive contact information
CREATE OR REPLACE VIEW public.public_coach_profiles AS
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
  status,
  age,
  created_at,
  updated_at
FROM public.coaches
WHERE status = 'approved';

-- Grant select permission on the view to anonymous users
GRANT SELECT ON public.public_coach_profiles TO anon;
GRANT SELECT ON public.public_coach_profiles TO authenticated;

-- Enable RLS on the view
ALTER VIEW public.public_coach_profiles SET (security_invoker = true);

-- Update the existing policies to be more explicit
-- Drop conflicting policies first
DROP POLICY IF EXISTS "Public can view basic approved coach info" ON public.coaches;
DROP POLICY IF EXISTS "Authenticated users can view full coach profiles" ON public.coaches;

-- Policy: Unauthenticated users cannot access coaches table directly
-- They should use public_coach_profiles view instead
CREATE POLICY "Deny anonymous direct access to coaches"
ON public.coaches
FOR SELECT
TO anon
USING (false);

-- Policy: Authenticated users can see full coach profiles (including contact info)
CREATE POLICY "Authenticated can view approved coaches with contact info"
ON public.coaches
FOR SELECT
TO authenticated
USING (status = 'approved');