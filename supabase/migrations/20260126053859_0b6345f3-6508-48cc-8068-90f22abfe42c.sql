-- ============================================================
-- STEP 1: Create Reusable RLS Helper Functions
-- ============================================================

-- Helper: Check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = p_user_id
      AND role = 'admin'::app_role
  )
$$;

-- Helper: Check if user is coach
CREATE OR REPLACE FUNCTION public.is_coach(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = p_user_id
      AND role = 'coach'::app_role
  )
$$;

-- Helper: Check if coach is primary coach for a specific client
CREATE OR REPLACE FUNCTION public.is_primary_coach_for_user(p_coach_uid uuid, p_client_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions
    WHERE user_id = p_client_uid
      AND coach_id = p_coach_uid
      AND status IN ('active', 'pending')
  )
$$;

-- Helper: Check if user is assigned coach OR admin (common pattern)
CREATE OR REPLACE FUNCTION public.is_admin_or_coach_for_user(p_actor_uid uuid, p_client_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    public.is_admin(p_actor_uid) 
    OR public.is_primary_coach_for_user(p_actor_uid, p_client_uid)
$$;

-- ============================================================
-- STEP 2: Drop ALL existing policies on key tables to start fresh
-- ============================================================

-- profiles_public
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles_public;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles_public;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles_public;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles_public;
DROP POLICY IF EXISTS "Coaches can view assigned client profiles" ON public.profiles_public;
DROP POLICY IF EXISTS "profiles_public_select_policy" ON public.profiles_public;
DROP POLICY IF EXISTS "profiles_public_update_policy" ON public.profiles_public;
DROP POLICY IF EXISTS "profiles_public_insert_policy" ON public.profiles_public;
DROP POLICY IF EXISTS "Enable read for own profile" ON public.profiles_public;
DROP POLICY IF EXISTS "Enable update for own profile" ON public.profiles_public;
DROP POLICY IF EXISTS "Allow authenticated users to read profiles" ON public.profiles_public;

-- profiles_private
DROP POLICY IF EXISTS "Users can view own private data" ON public.profiles_private;
DROP POLICY IF EXISTS "Users can update own private data" ON public.profiles_private;
DROP POLICY IF EXISTS "Admins can view all private data" ON public.profiles_private;
DROP POLICY IF EXISTS "Admins can update all private data" ON public.profiles_private;
DROP POLICY IF EXISTS "profiles_private_select_policy" ON public.profiles_private;
DROP POLICY IF EXISTS "profiles_private_update_policy" ON public.profiles_private;
DROP POLICY IF EXISTS "profiles_private_insert_policy" ON public.profiles_private;

-- subscriptions
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Admins can view all subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Admins can update all subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Coaches can view assigned subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_select_policy" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_update_policy" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_insert_policy" ON public.subscriptions;
DROP POLICY IF EXISTS "Enable read for own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.subscriptions;

-- care_team_assignments
DROP POLICY IF EXISTS "Admins can manage care team" ON public.care_team_assignments;
DROP POLICY IF EXISTS "Coaches can view assigned care team" ON public.care_team_assignments;
DROP POLICY IF EXISTS "care_team_assignments_select_policy" ON public.care_team_assignments;
DROP POLICY IF EXISTS "care_team_assignments_insert_policy" ON public.care_team_assignments;
DROP POLICY IF EXISTS "care_team_assignments_update_policy" ON public.care_team_assignments;
DROP POLICY IF EXISTS "care_team_assignments_delete_policy" ON public.care_team_assignments;

-- form_submissions
DROP POLICY IF EXISTS "Users can view own submissions" ON public.form_submissions;
DROP POLICY IF EXISTS "Users can insert own submissions" ON public.form_submissions;
DROP POLICY IF EXISTS "Admins can view all submissions" ON public.form_submissions;
DROP POLICY IF EXISTS "form_submissions_select_policy" ON public.form_submissions;
DROP POLICY IF EXISTS "form_submissions_insert_policy" ON public.form_submissions;
DROP POLICY IF EXISTS "form_submissions_update_policy" ON public.form_submissions;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.form_submissions;
DROP POLICY IF EXISTS "Enable read for users based on user_id" ON public.form_submissions;

-- form_submissions_safe
DROP POLICY IF EXISTS "Users can view own safe submissions" ON public.form_submissions_safe;
DROP POLICY IF EXISTS "Admins can view all safe submissions" ON public.form_submissions_safe;
DROP POLICY IF EXISTS "Coaches can view assigned client submissions" ON public.form_submissions_safe;
DROP POLICY IF EXISTS "form_submissions_safe_select_policy" ON public.form_submissions_safe;
DROP POLICY IF EXISTS "form_submissions_safe_update_policy" ON public.form_submissions_safe;

-- coaches_public
DROP POLICY IF EXISTS "Public can view active coaches" ON public.coaches_public;
DROP POLICY IF EXISTS "Authenticated can view coaches" ON public.coaches_public;
DROP POLICY IF EXISTS "Admins can manage coaches" ON public.coaches_public;
DROP POLICY IF EXISTS "coaches_public_select_policy" ON public.coaches_public;
DROP POLICY IF EXISTS "coaches_public_update_policy" ON public.coaches_public;
DROP POLICY IF EXISTS "coaches_public_insert_policy" ON public.coaches_public;

-- coaches_private
DROP POLICY IF EXISTS "Coaches can view own private data" ON public.coaches_private;
DROP POLICY IF EXISTS "Admins can view all coach private data" ON public.coaches_private;
DROP POLICY IF EXISTS "coaches_private_select_policy" ON public.coaches_private;
DROP POLICY IF EXISTS "coaches_private_update_policy" ON public.coaches_private;
DROP POLICY IF EXISTS "coaches_private_insert_policy" ON public.coaches_private;

-- services
DROP POLICY IF EXISTS "Anyone can view services" ON public.services;
DROP POLICY IF EXISTS "Public can view active services" ON public.services;
DROP POLICY IF EXISTS "Authenticated can view services" ON public.services;
DROP POLICY IF EXISTS "Admins can manage services" ON public.services;
DROP POLICY IF EXISTS "services_select_policy" ON public.services;
DROP POLICY IF EXISTS "services_update_policy" ON public.services;
DROP POLICY IF EXISTS "services_insert_policy" ON public.services;

-- service_pricing
DROP POLICY IF EXISTS "Authenticated can view pricing" ON public.service_pricing;
DROP POLICY IF EXISTS "Admins can manage pricing" ON public.service_pricing;
DROP POLICY IF EXISTS "service_pricing_select_policy" ON public.service_pricing;
DROP POLICY IF EXISTS "service_pricing_update_policy" ON public.service_pricing;
DROP POLICY IF EXISTS "service_pricing_insert_policy" ON public.service_pricing;

-- user_roles
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_policy" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_insert_policy" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_update_policy" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_delete_policy" ON public.user_roles;

-- ============================================================
-- STEP 3: Ensure RLS is enabled on all key tables
-- ============================================================

ALTER TABLE public.profiles_public ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.care_team_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submissions_safe ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaches_public ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaches_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.educational_videos ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 4: Apply Template Policies
-- ============================================================

-- ========== profiles_public ==========
-- Template 1 (Self) + Admin + Coach-assigned (read-only)

CREATE POLICY "tpl1_self_select"
  ON public.profiles_public FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "tpl1_self_update"
  ON public.profiles_public FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "tpl2_admin_select"
  ON public.profiles_public FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "tpl2_admin_all"
  ON public.profiles_public FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "tpl3_coach_select_assigned"
  ON public.profiles_public FOR SELECT
  TO authenticated
  USING (
    public.is_coach(auth.uid()) 
    AND public.is_primary_coach_for_user(auth.uid(), id)
  );

-- ========== profiles_private ==========
-- Template 1 (Self) + Admin only (no coach access to PII)

CREATE POLICY "tpl1_self_select"
  ON public.profiles_private FOR SELECT
  TO authenticated
  USING (auth.uid() = profile_id);

CREATE POLICY "tpl1_self_update"
  ON public.profiles_private FOR UPDATE
  TO authenticated
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "tpl2_admin_all"
  ON public.profiles_private FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ========== subscriptions ==========
-- Template 1 (Self read) + Admin + Coach-assigned

CREATE POLICY "tpl1_self_select"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "tpl2_admin_all"
  ON public.subscriptions FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "tpl3_coach_select_assigned"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (
    public.is_coach(auth.uid()) 
    AND coach_id = auth.uid()
  );

-- ========== care_team_assignments ==========
-- Admin full + Coach select assigned + Client view own

CREATE POLICY "tpl2_admin_all"
  ON public.care_team_assignments FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "tpl3_coach_select_assigned"
  ON public.care_team_assignments FOR SELECT
  TO authenticated
  USING (
    public.is_coach(auth.uid()) 
    AND (
      staff_user_id = auth.uid()
      OR public.is_primary_coach_for_user(auth.uid(), client_id)
    )
  );

CREATE POLICY "tpl1_client_select_own"
  ON public.care_team_assignments FOR SELECT
  TO authenticated
  USING (client_id = auth.uid());

-- ========== form_submissions ==========
-- Template 1 (Self insert/select) + Admin only (no coach access to PHI table)

CREATE POLICY "tpl1_self_select"
  ON public.form_submissions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "tpl1_self_insert"
  ON public.form_submissions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tpl2_admin_all"
  ON public.form_submissions FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ========== form_submissions_safe ==========
-- Template 1 (Self) + Admin + Coach-assigned (safe data only)

CREATE POLICY "tpl1_self_select"
  ON public.form_submissions_safe FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "tpl2_admin_all"
  ON public.form_submissions_safe FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "tpl3_coach_select_assigned"
  ON public.form_submissions_safe FOR SELECT
  TO authenticated
  USING (
    public.is_coach(auth.uid()) 
    AND public.is_primary_coach_for_user(auth.uid(), user_id)
  );

-- ========== coaches_public ==========
-- Template 4 (Authenticated read-only) + Admin full

CREATE POLICY "tpl4_authenticated_select"
  ON public.coaches_public FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "tpl2_admin_all"
  ON public.coaches_public FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "tpl1_self_update"
  ON public.coaches_public FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ========== coaches_private ==========
-- Template 1 (Self) + Admin only

CREATE POLICY "tpl1_self_select"
  ON public.coaches_private FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "tpl1_self_update"
  ON public.coaches_private FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tpl2_admin_all"
  ON public.coaches_private FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ========== services ==========
-- Template 4 (Authenticated read-only) + Admin full

CREATE POLICY "tpl4_authenticated_select"
  ON public.services FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND is_active = true);

CREATE POLICY "tpl2_admin_all"
  ON public.services FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ========== service_pricing ==========
-- Template 4 (Authenticated read-only) + Admin full

CREATE POLICY "tpl4_authenticated_select"
  ON public.service_pricing FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "tpl2_admin_all"
  ON public.service_pricing FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ========== user_roles ==========
-- Template 1 (Self read only) + Admin full

CREATE POLICY "tpl1_self_select"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "tpl2_admin_all"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ========== coach_applications ==========
-- Template 4 (Authenticated insert) + Admin full

CREATE POLICY "tpl4_authenticated_insert"
  ON public.coach_applications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "tpl2_admin_all"
  ON public.coach_applications FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ========== discount_codes ==========
-- Template 4 (Authenticated select active) + Admin full

CREATE POLICY "tpl4_authenticated_select"
  ON public.discount_codes FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND is_active = true);

CREATE POLICY "tpl2_admin_all"
  ON public.discount_codes FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ========== exercises ==========
-- Template 4 (Authenticated read-only) + Admin/Coach write

CREATE POLICY "tpl4_authenticated_select"
  ON public.exercises FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "tpl2_admin_all"
  ON public.exercises FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "tpl3_coach_insert"
  ON public.exercises FOR INSERT
  TO authenticated
  WITH CHECK (public.is_coach(auth.uid()));

-- ========== educational_videos ==========
-- Template 4 (Authenticated read-only) + Admin full

CREATE POLICY "tpl4_authenticated_select"
  ON public.educational_videos FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "tpl2_admin_all"
  ON public.educational_videos FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================
-- STEP 5: Add comments documenting the template system
-- ============================================================

COMMENT ON FUNCTION public.is_admin IS 'RLS Helper: Returns true if user has admin role. Use in policies as: is_admin(auth.uid())';
COMMENT ON FUNCTION public.is_coach IS 'RLS Helper: Returns true if user has coach role. Use in policies as: is_coach(auth.uid())';
COMMENT ON FUNCTION public.is_primary_coach_for_user IS 'RLS Helper: Returns true if coach is assigned to client via active/pending subscription';
COMMENT ON FUNCTION public.is_admin_or_coach_for_user IS 'RLS Helper: Combines admin check and coach assignment check for convenience';

-- Document the template system
COMMENT ON TABLE public.profiles_public IS 'RLS Templates: tpl1_self (owner), tpl2_admin (full), tpl3_coach (assigned read)';
COMMENT ON TABLE public.profiles_private IS 'RLS Templates: tpl1_self (owner), tpl2_admin (full). NO COACH ACCESS - use RPC';
COMMENT ON TABLE public.form_submissions IS 'RLS Templates: tpl1_self (owner), tpl2_admin (full). NO COACH ACCESS - use form_submissions_safe';
COMMENT ON TABLE public.form_submissions_safe IS 'RLS Templates: tpl1_self, tpl2_admin, tpl3_coach. Safe for coach access (no PHI)';
COMMENT ON TABLE public.coaches_public IS 'RLS Templates: tpl4_authenticated (read), tpl2_admin (full), tpl1_self (update own)';
COMMENT ON TABLE public.coaches_private IS 'RLS Templates: tpl1_self, tpl2_admin. NO PUBLIC ACCESS';
COMMENT ON TABLE public.services IS 'RLS Templates: tpl4_authenticated (active only), tpl2_admin (full)';