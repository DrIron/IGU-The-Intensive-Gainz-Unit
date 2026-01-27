-- =====================================================
-- DISCOUNT_CODES: Admin-only access
-- =====================================================

-- Enable RLS
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;

-- Drop any existing permissive policies
DROP POLICY IF EXISTS "Admins can manage discount codes" ON public.discount_codes;
DROP POLICY IF EXISTS "Admin full access to discount_codes" ON public.discount_codes;
DROP POLICY IF EXISTS "Authenticated users can view active codes" ON public.discount_codes;
DROP POLICY IF EXISTS "Users can view codes they have grants for" ON public.discount_codes;
DROP POLICY IF EXISTS "discount_codes_admin_select" ON public.discount_codes;
DROP POLICY IF EXISTS "discount_codes_admin_insert" ON public.discount_codes;
DROP POLICY IF EXISTS "discount_codes_admin_update" ON public.discount_codes;
DROP POLICY IF EXISTS "discount_codes_admin_delete" ON public.discount_codes;

-- Create strict admin-only policies
CREATE POLICY "discount_codes_admin_select"
  ON public.discount_codes FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "discount_codes_admin_insert"
  ON public.discount_codes FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "discount_codes_admin_update"
  ON public.discount_codes FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "discount_codes_admin_delete"
  ON public.discount_codes FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Revoke direct access from anon
REVOKE ALL ON public.discount_codes FROM anon;

-- =====================================================
-- DISCOUNT_CODE_GRANTS: Admin + user self-view (limited)
-- =====================================================

-- Enable RLS
ALTER TABLE public.discount_code_grants ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Admin full access to grants" ON public.discount_code_grants;
DROP POLICY IF EXISTS "discount_code_grants_admin_all" ON public.discount_code_grants;
DROP POLICY IF EXISTS "discount_code_grants_user_select_own" ON public.discount_code_grants;

-- Admin full access
CREATE POLICY "discount_code_grants_admin_all"
  ON public.discount_code_grants FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Users can view their own grants (but will need a view to hide sensitive fields)
-- Note: This allows SELECT only, user cannot see plaintext code (it's not in this table anyway)
CREATE POLICY "discount_code_grants_user_select_own"
  ON public.discount_code_grants FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Revoke from anon
REVOKE ALL ON public.discount_code_grants FROM anon;

-- =====================================================
-- DISCOUNT_REDEMPTIONS: Admin + user self-view
-- =====================================================

-- Enable RLS
ALTER TABLE public.discount_redemptions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Admin full access to redemptions" ON public.discount_redemptions;
DROP POLICY IF EXISTS "Users can view own redemptions" ON public.discount_redemptions;
DROP POLICY IF EXISTS "discount_redemptions_admin_all" ON public.discount_redemptions;
DROP POLICY IF EXISTS "discount_redemptions_user_select_own" ON public.discount_redemptions;

-- Admin full access
CREATE POLICY "discount_redemptions_admin_all"
  ON public.discount_redemptions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Users can view their own redemptions
-- Note: Only exposes code_id, not the plaintext code (which is in discount_codes table)
CREATE POLICY "discount_redemptions_user_select_own"
  ON public.discount_redemptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Revoke from anon
REVOKE ALL ON public.discount_redemptions FROM anon;

-- =====================================================
-- DISCOUNT_VALIDATION_LOG: Admin-only read, service_role insert
-- =====================================================

-- Enable RLS
ALTER TABLE public.discount_validation_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Admin can view validation logs" ON public.discount_validation_log;
DROP POLICY IF EXISTS "Service can insert validation logs" ON public.discount_validation_log;
DROP POLICY IF EXISTS "discount_validation_log_admin_select" ON public.discount_validation_log;

-- Admin read-only (inserts happen via service_role in edge functions)
CREATE POLICY "discount_validation_log_admin_select"
  ON public.discount_validation_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Revoke from anon and authenticated for direct writes
REVOKE ALL ON public.discount_validation_log FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.discount_validation_log FROM authenticated;