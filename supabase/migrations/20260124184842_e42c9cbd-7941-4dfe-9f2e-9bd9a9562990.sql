
-- Fix the SECURITY DEFINER view issue by recreating with SECURITY INVOKER
DROP VIEW IF EXISTS public.coaches_directory;

CREATE VIEW public.coaches_directory
WITH (security_invoker = true)
AS
SELECT 
  id,
  user_id,
  first_name,
  COALESCE(nickname, first_name) as display_name,
  short_bio,
  profile_picture_url,
  specializations,
  specialties,
  qualifications,
  location,
  status
FROM public.coaches_public
WHERE status IN ('active', 'approved');

-- Grant SELECT to all authenticated users
GRANT SELECT ON public.coaches_directory TO authenticated;

COMMENT ON VIEW public.coaches_directory IS 'Public-safe directory view (SECURITY INVOKER) - no PII. For authenticated users to browse coaches.';
