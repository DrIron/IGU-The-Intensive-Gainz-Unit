-- Drop and recreate coaches_public view with ONLY safe, non-sensitive fields
DROP VIEW IF EXISTS public.coaches_public;

CREATE VIEW public.coaches_public AS
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
    created_at
FROM public.coaches
WHERE status IN ('approved', 'active');

-- Add comment explaining this is the public-safe view
COMMENT ON VIEW public.coaches_public IS 'Public-safe coach profile data. Contains NO sensitive fields (email, phone, DOB, socials, max clients, etc). Use this for all client-facing queries.';

-- Grant SELECT to authenticated users (read-only)
GRANT SELECT ON public.coaches_public TO authenticated;

-- Revoke any other permissions that might exist
REVOKE INSERT, UPDATE, DELETE ON public.coaches_public FROM authenticated;
REVOKE ALL ON public.coaches_public FROM anon;

-- Ensure coach_contacts RLS is strictly enforced (verify existing policies)
-- The table already has proper RLS: admins full access, coaches own record only
-- No changes needed to coach_contacts RLS as it's already secure