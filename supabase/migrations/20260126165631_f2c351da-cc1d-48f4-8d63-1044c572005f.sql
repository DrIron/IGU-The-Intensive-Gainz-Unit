-- First drop ALL existing SELECT and UPDATE policies on profiles_public
DROP POLICY IF EXISTS "profiles_public_select_self" ON public.profiles_public;
DROP POLICY IF EXISTS "profiles_public_select_admin" ON public.profiles_public;
DROP POLICY IF EXISTS "profiles_public_select_assigned_coach" ON public.profiles_public;
DROP POLICY IF EXISTS "profiles_public_select_care_team" ON public.profiles_public;
DROP POLICY IF EXISTS "Profiles public are viewable by authenticated" ON public.profiles_public;
DROP POLICY IF EXISTS "Authenticated can view profiles_public" ON public.profiles_public;
DROP POLICY IF EXISTS "profiles_public readable by authenticated" ON public.profiles_public;
DROP POLICY IF EXISTS "profiles_public_select_authenticated" ON public.profiles_public;
DROP POLICY IF EXISTS "Anyone authenticated can read profiles_public" ON public.profiles_public;
DROP POLICY IF EXISTS "profiles_public_update_self" ON public.profiles_public;
DROP POLICY IF EXISTS "profiles_public_update_admin" ON public.profiles_public;
DROP POLICY IF EXISTS "Users can update own profiles_public" ON public.profiles_public;
DROP POLICY IF EXISTS "Users can insert own profiles_public" ON public.profiles_public;
DROP POLICY IF EXISTS "profiles_public_insert_self" ON public.profiles_public;

-- Ensure RLS is on
ALTER TABLE public.profiles_public ENABLE ROW LEVEL SECURITY;

-- 1) Self can read own public profile row
CREATE POLICY "profiles_public_select_self"
ON public.profiles_public
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- 2) Admin can read all
CREATE POLICY "profiles_public_select_admin"
ON public.profiles_public
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 3) Assigned coach can read their clients (active OR pending)
CREATE POLICY "profiles_public_select_assigned_coach"
ON public.profiles_public
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = profiles_public.id
      AND s.coach_id = auth.uid()
      AND s.status IN ('active', 'pending')
  )
);

-- 4) Active care-team staff can read client profile during active assignment
CREATE POLICY "profiles_public_select_care_team"
ON public.profiles_public
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.care_team_assignments cta
    JOIN public.subscriptions s ON s.id = cta.subscription_id
    WHERE s.user_id = profiles_public.id
      AND cta.staff_user_id = auth.uid()
      AND cta.lifecycle_status IN ('active', 'scheduled_end')
  )
);

-- 5) Users can update ONLY their own row
CREATE POLICY "profiles_public_update_self"
ON public.profiles_public
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- 6) Admin can update all
CREATE POLICY "profiles_public_update_admin"
ON public.profiles_public
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 7) Users can insert their own profile (needed for new signups)
CREATE POLICY "profiles_public_insert_self"
ON public.profiles_public
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- Ensure anon has zero access
REVOKE ALL ON public.profiles_public FROM anon;