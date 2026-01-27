
-- ============================================================
-- SECURITY BASELINE HARDENING MIGRATION
-- ============================================================
-- Rules enforced:
-- 1. No decrypted PHI views accessible to non-admins
-- 2. No USING(true) policies (replace with auth.uid() IS NOT NULL)
-- 3. anon role has ZERO access to all tables
-- 4. Revoke SELECT on sensitive views from authenticated role
-- ============================================================

-- ============================================================
-- PART 1: REVOKE anon ACCESS FROM ALL TABLES
-- ============================================================

-- Revoke anon from all public tables
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- ============================================================
-- PART 2: REVOKE SELECT ON SENSITIVE VIEWS
-- ============================================================

-- profiles view (combined PII) - already hardened but ensure
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM authenticated;

-- coaches_full view (has email, phone, DOB)
REVOKE SELECT ON public.coaches_full FROM anon;
REVOKE SELECT ON public.coaches_full FROM authenticated;

-- form_submissions_decrypted view (has decrypted PHI)
REVOKE SELECT ON public.form_submissions_decrypted FROM anon;
REVOKE SELECT ON public.form_submissions_decrypted FROM authenticated;

-- coaches_directory - only for authenticated (already enforced via RLS but belt and suspenders)
REVOKE SELECT ON public.coaches_directory FROM anon;

-- ============================================================
-- PART 3: FIX POLICIES USING 'true' 
-- ============================================================

-- Fix: coaches_public SELECT policy (was USING(true))
DROP POLICY IF EXISTS "coaches_public_authenticated_select" ON public.coaches_public;
CREATE POLICY "coaches_public_authenticated_select"
  ON public.coaches_public FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Fix: service_billing_components SELECT policy (was USING(true))
DROP POLICY IF EXISTS "Authenticated users can view billing components" ON public.service_billing_components;
CREATE POLICY "Authenticated users can view billing components"
  ON public.service_billing_components FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Fix: coach_applications INSERT policy (was WITH CHECK(true))
-- This allows public applications but now requires authenticated users only
DROP POLICY IF EXISTS "Anyone can submit coach application" ON public.coach_applications;
CREATE POLICY "Authenticated users can submit coach applications"
  ON public.coach_applications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- PART 4: HARDEN services AND team_plan_settings POLICIES
-- ============================================================

-- services: replace (is_active = true) with auth check
DROP POLICY IF EXISTS "Services viewable by authenticated users" ON public.services;
CREATE POLICY "Services viewable by authenticated users"
  ON public.services FOR SELECT
  USING (is_active = true AND auth.uid() IS NOT NULL);

-- service_pricing: add auth check
DROP POLICY IF EXISTS "Authenticated users can read active service_pricing" ON public.service_pricing;
CREATE POLICY "Authenticated users can read active service_pricing"
  ON public.service_pricing FOR SELECT
  USING (is_active = true AND auth.uid() IS NOT NULL);

-- addon_pricing: add auth check (already has auth.uid() IS NOT NULL but verify)
DROP POLICY IF EXISTS "Authenticated users can read active addon_pricing" ON public.addon_pricing;
CREATE POLICY "Authenticated users can read active addon_pricing"
  ON public.addon_pricing FOR SELECT
  USING (is_active = true AND auth.uid() IS NOT NULL);

-- ============================================================
-- PART 5: CREATE STANDARDIZED RPC PATTERNS
-- ============================================================

-- Admin-only RPC for coaches_full data (consolidated pattern)
CREATE OR REPLACE FUNCTION public.admin_get_coaches_full()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  first_name text,
  last_name text,
  nickname text,
  display_name text,
  bio text,
  short_bio text,
  location text,
  profile_picture_url text,
  qualifications text[],
  specializations text[],
  specialties staff_specialty[],
  status text,
  max_onetoone_clients integer,
  max_team_clients integer,
  last_assigned_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  email text,
  phone text,
  whatsapp_number text,
  date_of_birth date,
  gender text,
  instagram_url text,
  tiktok_url text,
  snapchat_url text,
  youtube_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_id uuid;
BEGIN
  v_requester_id := auth.uid();
  
  IF v_requester_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  IF NOT has_role(v_requester_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied: Admin role required';
  END IF;
  
  -- Log PHI access
  PERFORM log_phi_access(
    v_requester_id,
    NULL,
    'admin_get_coaches_full',
    'coaches_full',
    NULL,
    ARRAY['email', 'phone', 'date_of_birth'],
    NULL, NULL, NULL,
    jsonb_build_object('function', 'admin_get_coaches_full')
  );
  
  RETURN QUERY
  SELECT 
    cp.id,
    cp.user_id,
    cp.first_name,
    cp.last_name,
    cp.nickname,
    cp.display_name,
    cp.bio,
    cp.short_bio,
    cp.location,
    cp.profile_picture_url,
    cp.qualifications,
    cp.specializations,
    cp.specialties,
    cp.status,
    cp.max_onetoone_clients,
    cp.max_team_clients,
    cp.last_assigned_at,
    cp.created_at,
    cp.updated_at,
    cpriv.email,
    cpriv.phone,
    cpriv.whatsapp_number,
    cpriv.date_of_birth,
    cpriv.gender,
    cpriv.instagram_url,
    cpriv.tiktok_url,
    cpriv.snapchat_url,
    cpriv.youtube_url
  FROM coaches_public cp
  LEFT JOIN coaches_private cpriv ON cp.id = cpriv.coach_public_id;
END;
$$;

-- Revoke execute from anon, grant to authenticated (admin check is inside)
REVOKE EXECUTE ON FUNCTION public.admin_get_coaches_full() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_coaches_full() TO authenticated;

-- ============================================================
-- PART 6: ENSURE PHI DECRYPTION FUNCTIONS ARE SECURE
-- ============================================================

-- Revoke execute on decrypt functions from anon
REVOKE EXECUTE ON FUNCTION public.decrypt_phi_text(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.decrypt_phi_boolean(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.decrypt_phi_date(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.decrypt_phi_text_logged(text, uuid, uuid, text) FROM anon;

-- Also restrict from authenticated (should only be used via SECURITY DEFINER RPCs)
REVOKE EXECUTE ON FUNCTION public.decrypt_phi_text(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_phi_boolean(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_phi_date(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_phi_text_logged(text, uuid, uuid, text) FROM authenticated;

-- Revoke get_phi_encryption_key from anon and authenticated
REVOKE EXECUTE ON FUNCTION public.get_phi_encryption_key() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_phi_encryption_key() FROM authenticated;

-- ============================================================
-- PART 7: ENSURE CORE SECURITY FUNCTIONS ARE PROTECTED
-- ============================================================

-- log_phi_access should only be callable by service_role and SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.log_phi_access(uuid, uuid, text, text, uuid, text[], text, text, text, jsonb) FROM anon;

-- log_approval_action protected
REVOKE EXECUTE ON FUNCTION public.log_approval_action(uuid, text, text, uuid, uuid, text, text, text, jsonb, text, text) FROM anon;

-- log_phi_access_by_role protected
REVOKE EXECUTE ON FUNCTION public.log_phi_access_by_role(uuid, uuid, text, text, text[], jsonb) FROM anon;

-- scan_phi_plaintext_violations is admin only via internal check
REVOKE EXECUTE ON FUNCTION public.scan_phi_plaintext_violations() FROM anon;

-- check_legacy_table_security is admin only
REVOKE EXECUTE ON FUNCTION public.check_legacy_table_security() FROM anon;

-- get_rls_audit_report is admin only
REVOKE EXECUTE ON FUNCTION public.get_rls_audit_report() FROM anon;

-- ============================================================
-- PART 8: ADD COMMENTS FOR DOCUMENTATION
-- ============================================================

COMMENT ON VIEW public.profiles IS 'SECURITY: Admin-only combined view. SELECT revoked from anon/authenticated. Use admin_get_profile_private RPC.';
COMMENT ON VIEW public.coaches_full IS 'SECURITY: Admin-only combined view. SELECT revoked from anon/authenticated. Use admin_get_coaches_full RPC.';
COMMENT ON VIEW public.form_submissions_decrypted IS 'SECURITY: Admin/service_role only. Contains decrypted PHI. Use get_form_submission_phi RPC.';
COMMENT ON VIEW public.coaches_directory IS 'SECURITY: Authenticated users only. Public-safe fields only.';

COMMENT ON TABLE public.profiles_public IS 'SECURITY: Public profile data. Coaches access via assignment. No PII.';
COMMENT ON TABLE public.profiles_private IS 'SECURITY: PII table. Admin or owner access only. Coaches explicitly denied.';
COMMENT ON TABLE public.form_submissions IS 'SECURITY: PHI encrypted. Plaintext columns are auto-nullified. Use RPCs for decryption.';
