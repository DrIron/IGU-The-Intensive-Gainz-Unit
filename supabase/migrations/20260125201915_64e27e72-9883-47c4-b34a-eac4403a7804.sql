-- ============================================================
-- SECURITY FIX: Enable RLS on coaches_directory view
-- This view is already safe (only uses coaches_public fields)
-- but needs RLS to prevent anonymous access
-- ============================================================

-- Recreate the view with security_invoker to inherit RLS from base table
DROP VIEW IF EXISTS public.coaches_directory;

CREATE VIEW public.coaches_directory
WITH (security_invoker = true) AS
SELECT 
  id,
  user_id,
  first_name,
  COALESCE(nickname, first_name) AS display_name,
  short_bio,
  profile_picture_url,
  specializations,
  specialties,
  qualifications,
  location,
  status
FROM public.coaches_public
WHERE status = ANY (ARRAY['active'::text, 'approved'::text]);

-- Add comment for security audit
COMMENT ON VIEW public.coaches_directory IS 
'SECURITY: Public-safe coach directory for authenticated users only. 
Contains only non-sensitive profile data from coaches_public. 
No PII (email, phone, DOB, contact details) exposed.
RLS: security_invoker=true inherits coaches_public RLS policies.';

-- Grant SELECT to authenticated role only (not anon)
REVOKE ALL ON public.coaches_directory FROM anon;
REVOKE ALL ON public.coaches_directory FROM public;
GRANT SELECT ON public.coaches_directory TO authenticated;