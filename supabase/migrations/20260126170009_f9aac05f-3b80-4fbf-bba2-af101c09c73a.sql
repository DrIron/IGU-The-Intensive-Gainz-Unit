-- Make the profiles view respect caller permissions (RLS on underlying tables is enforced)
ALTER VIEW public.profiles SET (security_invoker = true);

-- Add comment documenting the security model
COMMENT ON VIEW public.profiles IS 'Combined profile view (public + private). SECURITY INVOKER enabled - caller must have access to underlying tables. Admin-only recommended; use profiles_public for non-admin access.';