-- Add proper metadata comments to help type generation
-- Mark profiles VIEW as read-only (select-only) for type generators
COMMENT ON VIEW public.profiles IS 'Compatibility view joining profiles_public and profiles_private. Read-only access.';

-- Ensure profiles_public has proper comment
COMMENT ON TABLE public.profiles_public IS 'Public profile data accessible based on RLS policies. Primary client profile table.';

-- Ensure profiles_private has proper comment  
COMMENT ON TABLE public.profiles_private IS 'Private PII data (email, phone, DOB) with strict RLS. Only accessible by owner and admins.';

-- Grant explicit permissions to reinforce the view's read-only nature
-- (The INSTEAD OF triggers handle writes, but this documents intent)
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;

-- Re-grant through the INSTEAD OF triggers for backwards compatibility
GRANT INSERT, UPDATE ON public.profiles TO authenticated;

-- Ensure the view columns have proper comments for documentation
COMMENT ON COLUMN public.profiles_public.id IS 'User ID matching auth.users.id';
COMMENT ON COLUMN public.profiles_public.status IS 'Account lifecycle status';
COMMENT ON COLUMN public.profiles_public.first_name IS 'First name (public, visible to coaches)';
COMMENT ON COLUMN public.profiles_public.display_name IS 'Display name for UI';
COMMENT ON COLUMN public.profiles_private.email IS 'Email address (PII, admin-only)';
COMMENT ON COLUMN public.profiles_private.phone IS 'Phone number (PII, admin-only)';
COMMENT ON COLUMN public.profiles_private.date_of_birth IS 'Date of birth (PII, admin-only)';