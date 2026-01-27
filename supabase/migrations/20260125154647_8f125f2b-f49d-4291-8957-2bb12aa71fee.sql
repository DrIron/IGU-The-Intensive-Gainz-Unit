-- ============================================================
-- CRITICAL SECURITY FIX: Secure profiles VIEW with RLS
-- The profiles view joins profiles_public + profiles_private
-- and MUST be restricted to admin-only access
-- ============================================================

-- Drop existing view and recreate with security_invoker
-- This ensures RLS policies are checked for the calling user
DROP VIEW IF EXISTS public.profiles;

CREATE VIEW public.profiles
WITH (security_invoker = true) AS
SELECT 
  pp.id,
  priv.email,
  priv.full_name,
  priv.phone,
  pp.status,
  pp.created_at,
  pp.updated_at,
  pp.payment_deadline,
  pp.signup_completed_at,
  pp.onboarding_completed_at,
  pp.activation_completed_at,
  pp.first_name,
  priv.last_name,
  priv.date_of_birth,
  priv.gender,
  pp.payment_exempt,
  pp.display_name,
  pp.avatar_url
FROM profiles_public pp
LEFT JOIN profiles_private priv ON pp.id = priv.profile_id;

-- Add comment documenting security status
COMMENT ON VIEW public.profiles IS 'SECURITY: Admin-only combined profile view. Uses security_invoker=true so RLS on underlying tables (profiles_public, profiles_private) is enforced. Non-admins should use profiles_public only.';

-- ============================================================
-- Ensure profiles_private has strict admin-only RLS
-- ============================================================

-- First check existing policies and ensure admin-only access
DO $$
BEGIN
  -- Drop any existing permissive policies on profiles_private
  DROP POLICY IF EXISTS "Admin full access to profiles_private" ON public.profiles_private;
  DROP POLICY IF EXISTS "Users can view own private profile" ON public.profiles_private;
  DROP POLICY IF EXISTS "Users can update own private profile" ON public.profiles_private;
  DROP POLICY IF EXISTS "Admin can insert profiles_private" ON public.profiles_private;
  DROP POLICY IF EXISTS "Admin can delete profiles_private" ON public.profiles_private;
END $$;

-- Enable RLS on profiles_private
ALTER TABLE public.profiles_private ENABLE ROW LEVEL SECURITY;

-- Admin-only SELECT (admins can view all private profile data)
CREATE POLICY "Admin full SELECT on profiles_private"
ON public.profiles_private
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Users can view ONLY their own private profile (for account settings)
CREATE POLICY "Users view own private profile"
ON public.profiles_private
FOR SELECT
TO authenticated
USING (profile_id = auth.uid());

-- Admin-only UPDATE
CREATE POLICY "Admin full UPDATE on profiles_private"
ON public.profiles_private
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Users can update their own private profile
CREATE POLICY "Users update own private profile"
ON public.profiles_private
FOR UPDATE
TO authenticated
USING (profile_id = auth.uid())
WITH CHECK (profile_id = auth.uid());

-- Admin-only INSERT (for manual client creation, etc.)
CREATE POLICY "Admin INSERT on profiles_private"
ON public.profiles_private
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Allow service role to insert (for auth triggers)
-- This is handled automatically by Supabase service role bypassing RLS

-- Admin-only DELETE
CREATE POLICY "Admin DELETE on profiles_private"
ON public.profiles_private
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- Verify profiles_public has appropriate RLS
-- ============================================================

-- Enable RLS on profiles_public
ALTER TABLE public.profiles_public ENABLE ROW LEVEL SECURITY;

-- Check existing and add necessary policies
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view own profile_public" ON public.profiles_public;
  DROP POLICY IF EXISTS "Coaches view assigned clients" ON public.profiles_public;
  DROP POLICY IF EXISTS "Admin full access to profiles_public" ON public.profiles_public;
END $$;

-- Everyone can view their own public profile
CREATE POLICY "Users view own public profile"
ON public.profiles_public
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- Coaches can view public profiles of their assigned clients
CREATE POLICY "Coaches view assigned client public profiles"
ON public.profiles_public
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = profiles_public.id
      AND s.coach_id = auth.uid()
      AND s.status IN ('active', 'pending')
  )
);

-- Coaches can view care team client profiles
CREATE POLICY "Care team view client public profiles"
ON public.profiles_public
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.care_team_assignments cta
    WHERE cta.client_id = profiles_public.id
      AND cta.staff_user_id = auth.uid()
      AND cta.status = 'active'
  )
);

-- Admin can view all public profiles
CREATE POLICY "Admin SELECT all profiles_public"
ON public.profiles_public
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Users can update their own public profile
CREATE POLICY "Users update own public profile"
ON public.profiles_public
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Admin can update any public profile
CREATE POLICY "Admin UPDATE profiles_public"
ON public.profiles_public
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Admin can insert public profiles
CREATE POLICY "Admin INSERT profiles_public"
ON public.profiles_public
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Admin can delete public profiles
CREATE POLICY "Admin DELETE profiles_public"
ON public.profiles_public
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));