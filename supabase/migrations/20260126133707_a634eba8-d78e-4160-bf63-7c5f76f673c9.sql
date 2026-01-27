-- ============================================================
-- Create safe coach views for client-facing UI
-- NO contact info, NO social URLs, NO PII
-- ============================================================

-- Drop existing coaches_directory and recreate without social URLs
DROP VIEW IF EXISTS public.coaches_directory;

-- Create coaches_directory with ONLY safe fields
-- This is the primary view for authenticated users to browse coaches
CREATE VIEW public.coaches_directory 
WITH (security_invoker = true) AS
SELECT 
  cp.user_id,
  cp.first_name,
  cp.last_name,
  cp.nickname,
  cp.display_name,
  cp.short_bio,
  cp.bio,
  cp.profile_picture_url,
  cp.qualifications,
  cp.specializations,
  cp.specialties,
  cp.location,
  cp.status
  -- EXCLUDED: instagram_url, tiktok_url, youtube_url (social media)
  -- EXCLUDED: All contact info is in coaches_private (email, phone, whatsapp, DOB, gender)
FROM public.coaches_public cp
WHERE cp.status = 'active';

-- Grant SELECT to authenticated users only
GRANT SELECT ON public.coaches_directory TO authenticated;
REVOKE ALL ON public.coaches_directory FROM anon;

-- ============================================================
-- Create coaches_client_safe for coach selection/onboarding
-- Absolute minimum fields needed for client UI
-- ============================================================
DROP VIEW IF EXISTS public.coaches_client_safe;

CREATE VIEW public.coaches_client_safe
WITH (security_invoker = true) AS
SELECT 
  c.id,
  c.user_id,
  c.first_name,
  c.last_name,
  c.profile_picture_url,
  c.short_bio,
  c.specializations,
  c.status
  -- EXCLUDED: bio, qualifications, location, age, gender, etc.
FROM public.coaches c
WHERE c.status = 'active';

-- Grant SELECT to authenticated users only
GRANT SELECT ON public.coaches_client_safe TO authenticated;
REVOKE ALL ON public.coaches_client_safe FROM anon;

-- Add comment for documentation
COMMENT ON VIEW public.coaches_directory IS 'Public-safe coach directory for authenticated users. Contains NO contact info, NO social URLs, NO PII.';
COMMENT ON VIEW public.coaches_client_safe IS 'Minimal coach info for client UI (selection, display). Contains NO contact info, NO PII.';