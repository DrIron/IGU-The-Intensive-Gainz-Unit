-- ============================================================
-- Tighten profiles_public policies per requirements
-- INSERT: Self only (for onboarding)
-- UPDATE: Self only (no admin override needed)
-- ============================================================

-- Drop existing INSERT policy (was admin OR self)
DROP POLICY IF EXISTS "profiles_public_insert" ON public.profiles_public;

-- Drop admin UPDATE policy (not needed - self is sufficient)
DROP POLICY IF EXISTS "profiles_public_update_admin" ON public.profiles_public;

-- CREATE: Users can INSERT their own row only (for onboarding)
CREATE POLICY "profiles_public_insert_self"
ON public.profiles_public FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Note: Keeping admin SELECT and DELETE for administrative purposes
-- but removing admin UPDATE per requirement to minimize write access