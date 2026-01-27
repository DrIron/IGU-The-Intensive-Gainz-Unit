-- ============================================================
-- STEP 1: Permanently neutralize form_submissions_decrypted
-- ============================================================

-- Revoke ALL access from anon and authenticated (belt and suspenders)
REVOKE ALL ON public.form_submissions_decrypted FROM anon;
REVOKE ALL ON public.form_submissions_decrypted FROM authenticated;

-- Add explicit denial comment
COMMENT ON VIEW public.form_submissions_decrypted IS 
  'SECURITY: NEVER grant SELECT to anon/authenticated. Access ONLY via get_form_submission_phi() RPC. Coaches use get_client_medical_flags() RPC for safe flags only.';

-- ============================================================
-- STEP 2: Permanently neutralize combined profiles view
-- ============================================================

-- Revoke ALL access from anon and authenticated
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.profiles FROM authenticated;

-- Add explicit denial comment
COMMENT ON VIEW public.profiles IS 
  'SECURITY: NEVER grant SELECT to anon/authenticated. Admin uses admin_get_profile_private() RPC. Coaches query profiles_public only.';

-- ============================================================
-- STEP 3: Permanently neutralize coaches_full view
-- ============================================================

-- Revoke ALL access from anon and authenticated
REVOKE ALL ON public.coaches_full FROM anon;
REVOKE ALL ON public.coaches_full FROM authenticated;

-- Add explicit denial comment
COMMENT ON VIEW public.coaches_full IS 
  'SECURITY: NEVER grant SELECT to anon/authenticated. Admin uses admin_get_coaches_full() RPC only.';

-- ============================================================
-- STEP 4: Secure coaches_directory view - sanitized fields only
-- ============================================================

-- Drop and recreate coaches_directory with ONLY public-safe fields
DROP VIEW IF EXISTS public.coaches_directory CASCADE;

CREATE VIEW public.coaches_directory 
WITH (security_invoker = true)
AS
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
  cp.max_team_clients
  -- EXCLUDED: email, phone, whatsapp_number, date_of_birth, gender (PII)
  -- EXCLUDED: instagram_url, tiktok_url, youtube_url (kept in coaches_public for self-update)
FROM public.coaches_public cp
WHERE cp.status = 'active';

-- Grant authenticated read-only access to sanitized directory
GRANT SELECT ON public.coaches_directory TO authenticated;

-- Explicitly deny anon access
REVOKE ALL ON public.coaches_directory FROM anon;

COMMENT ON VIEW public.coaches_directory IS 
  'SECURITY: Public-safe coach listing. NO PII (email, phone, DOB). Authenticated read-only. Anon access DENIED.';

-- ============================================================
-- STEP 5: Verify coaches_private is properly isolated
-- ============================================================

-- Ensure coaches_private has RLS enabled
ALTER TABLE public.coaches_private ENABLE ROW LEVEL SECURITY;

-- Drop any overly permissive policies that may exist
DROP POLICY IF EXISTS "Anyone can view coach contacts" ON public.coaches_private;
DROP POLICY IF EXISTS "Public can view coach contacts" ON public.coaches_private;
DROP POLICY IF EXISTS "Authenticated can view coach contacts" ON public.coaches_private;
DROP POLICY IF EXISTS "coaches_private_select_all" ON public.coaches_private;

-- Verify only self + admin policies exist (already created in previous migration)
-- tpl1_self_select, tpl1_self_update, tpl2_admin_all

COMMENT ON TABLE public.coaches_private IS 
  'SECURITY: Contains coach PII (email, phone, DOB, gender). RLS: Self + Admin ONLY. Coaches cannot see other coaches PII.';

-- ============================================================
-- STEP 6: Ensure coaches_public social media fields are self-update only
-- ============================================================

-- Drop existing coaches_public policies that might allow coach-to-coach viewing of social links
-- (Already handled by tpl4_authenticated_select which is fine for public bio data)

-- Add column-level security comment
COMMENT ON COLUMN public.coaches_public.instagram_url IS 'Social link - visible to authenticated users. Self-update only via tpl1_self_update.';
COMMENT ON COLUMN public.coaches_public.tiktok_url IS 'Social link - visible to authenticated users. Self-update only via tpl1_self_update.';
COMMENT ON COLUMN public.coaches_public.youtube_url IS 'Social link - visible to authenticated users. Self-update only via tpl1_self_update.';

-- ============================================================
-- STEP 7: Add security verification function
-- ============================================================

-- Function to verify PHI view isolation (for regression checks)
CREATE OR REPLACE FUNCTION public.verify_phi_view_isolation()
RETURNS TABLE (
  view_name text,
  has_anon_access boolean,
  has_authenticated_access boolean,
  is_secure boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH view_grants AS (
    SELECT 
      table_name::text as view_name,
      grantee,
      privilege_type
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name IN ('form_submissions_decrypted', 'profiles', 'coaches_full')
  )
  SELECT 
    v.view_name,
    EXISTS (SELECT 1 FROM view_grants vg WHERE vg.view_name = v.view_name AND vg.grantee = 'anon' AND vg.privilege_type = 'SELECT') as has_anon_access,
    EXISTS (SELECT 1 FROM view_grants vg WHERE vg.view_name = v.view_name AND vg.grantee = 'authenticated' AND vg.privilege_type = 'SELECT') as has_authenticated_access,
    NOT EXISTS (SELECT 1 FROM view_grants vg WHERE vg.view_name = v.view_name AND vg.grantee IN ('anon', 'authenticated') AND vg.privilege_type = 'SELECT') as is_secure
  FROM (VALUES ('form_submissions_decrypted'), ('profiles'), ('coaches_full')) AS v(view_name);
$$;

-- Restrict execution to admin only
REVOKE EXECUTE ON FUNCTION public.verify_phi_view_isolation() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_phi_view_isolation() TO service_role;

COMMENT ON FUNCTION public.verify_phi_view_isolation IS 
  'Security audit function: Verifies PHI views have no anon/authenticated SELECT access. Admin/service_role only.';

-- ============================================================
-- STEP 8: Document the RPC-only access patterns
-- ============================================================

-- Add documentation comments to RPC functions
COMMENT ON FUNCTION public.get_form_submission_phi IS 
  'PHI Access Gateway: Returns decrypted PHI for admin OR owner only. Logs to phi_access_audit_log. Coaches use get_client_medical_flags() instead.';

COMMENT ON FUNCTION public.get_my_latest_form_submission_phi IS 
  'Self-service PHI Access: Returns users own decrypted form submission. IDOR-safe (no ID parameter). Logs access.';

COMMENT ON FUNCTION public.get_client_medical_flags IS 
  'Coach-safe Medical Access: Returns ONLY status flags (needs_review, cleared, has_injuries). NO raw PHI. Coach must be assigned to client.';

COMMENT ON FUNCTION public.admin_get_profile_private IS 
  'Admin-only Profile PII: Returns email, phone, DOB for specified user. Logs to phi_access_audit_log.';

COMMENT ON FUNCTION public.get_my_profile_private IS 
  'Self-service Profile PII: Returns users own private data. IDOR-safe (no ID parameter).';

COMMENT ON FUNCTION public.admin_get_coaches_full IS 
  'Admin-only Coach Data: Returns full coach record including PII. Logs access.';