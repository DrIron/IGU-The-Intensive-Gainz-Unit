-- ============================================================
-- Consolidate profiles_public RLS policies
-- Remove duplicate/overlapping policies and keep clean standard ones
-- Access: Self, Admin, Assigned Coach, Care Team
-- ============================================================

-- Drop all existing SELECT policies (we have duplicates)
DROP POLICY IF EXISTS "Admin SELECT all profiles_public" ON public.profiles_public;
DROP POLICY IF EXISTS "Admins can view all profiles_public" ON public.profiles_public;
DROP POLICY IF EXISTS "tpl2_admin_select" ON public.profiles_public;
DROP POLICY IF EXISTS "Users can view own profiles_public" ON public.profiles_public;
DROP POLICY IF EXISTS "Users view own public profile" ON public.profiles_public;
DROP POLICY IF EXISTS "tpl1_self_select" ON public.profiles_public;
DROP POLICY IF EXISTS "Coaches can view assigned client profiles_public" ON public.profiles_public;
DROP POLICY IF EXISTS "Coaches view assigned client public profiles" ON public.profiles_public;
DROP POLICY IF EXISTS "tpl3_coach_select_assigned" ON public.profiles_public;
DROP POLICY IF EXISTS "Care team view client public profiles" ON public.profiles_public;

-- Drop duplicate INSERT/UPDATE/DELETE policies
DROP POLICY IF EXISTS "Admin INSERT profiles_public" ON public.profiles_public;
DROP POLICY IF EXISTS "Admins can insert profiles_public" ON public.profiles_public;
DROP POLICY IF EXISTS "Admin UPDATE profiles_public" ON public.profiles_public;
DROP POLICY IF EXISTS "Admins can update all profiles_public" ON public.profiles_public;
DROP POLICY IF EXISTS "Users can update own profiles_public" ON public.profiles_public;
DROP POLICY IF EXISTS "Users update own public profile" ON public.profiles_public;
DROP POLICY IF EXISTS "tpl1_self_update" ON public.profiles_public;
DROP POLICY IF EXISTS "Admin DELETE profiles_public" ON public.profiles_public;
DROP POLICY IF EXISTS "tpl2_admin_all" ON public.profiles_public;

-- ============================================================
-- Create consolidated, clean RLS policies
-- ============================================================

-- SELECT: Self can view own profile
CREATE POLICY "profiles_public_select_self"
ON public.profiles_public FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- SELECT: Admin can view all profiles
CREATE POLICY "profiles_public_select_admin"
ON public.profiles_public FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- SELECT: Primary coach can view assigned client profiles
CREATE POLICY "profiles_public_select_coach_assigned"
ON public.profiles_public FOR SELECT
TO authenticated
USING (
  public.is_coach(auth.uid()) 
  AND public.is_primary_coach_for_user(auth.uid(), id)
);

-- SELECT: Care team members can view their assigned clients
CREATE POLICY "profiles_public_select_care_team"
ON public.profiles_public FOR SELECT
TO authenticated
USING (
  public.is_on_active_care_team_for_client(auth.uid(), id)
);

-- INSERT: Admin or self (for profile creation)
CREATE POLICY "profiles_public_insert"
ON public.profiles_public FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin(auth.uid()) OR auth.uid() = id
);

-- UPDATE: Self can update own profile
CREATE POLICY "profiles_public_update_self"
ON public.profiles_public FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- UPDATE: Admin can update any profile
CREATE POLICY "profiles_public_update_admin"
ON public.profiles_public FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- DELETE: Admin only
CREATE POLICY "profiles_public_delete_admin"
ON public.profiles_public FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

-- ============================================================
-- Verify: Revoke any direct access from anon role
-- ============================================================
REVOKE ALL ON public.profiles_public FROM anon;