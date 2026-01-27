-- Remove INSTEAD OF triggers from profiles view to make it read-only
DROP TRIGGER IF EXISTS profiles_view_insert ON public.profiles;
DROP TRIGGER IF EXISTS profiles_view_update ON public.profiles;
DROP TRIGGER IF EXISTS profiles_view_delete ON public.profiles;

-- Drop the trigger functions
DROP FUNCTION IF EXISTS public.profiles_view_insert_handler();
DROP FUNCTION IF EXISTS public.profiles_view_update_handler();
DROP FUNCTION IF EXISTS public.profiles_view_delete_handler();

-- Revoke write permissions on the view
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon;

-- Grant only SELECT on the profiles view (admin reads only)
GRANT SELECT ON public.profiles TO authenticated;

-- Ensure profiles_public and profiles_private have proper write permissions
GRANT SELECT, INSERT, UPDATE ON public.profiles_public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles_private TO authenticated;

-- Update the view comment to reflect it's read-only
COMMENT ON VIEW public.profiles IS 'Read-only compatibility view for admin SELECTs. All writes must go directly to profiles_public or profiles_private.';