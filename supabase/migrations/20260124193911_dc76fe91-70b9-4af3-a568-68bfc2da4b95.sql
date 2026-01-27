
-- ============================================================
-- SECURITY HARDENING: Revoke anon/authenticated access to 
-- SECURITY DEFINER functions that should be admin/service only
-- ============================================================

-- CRITICAL: PHI encryption key should NEVER be callable by users
REVOKE EXECUTE ON FUNCTION public.get_phi_encryption_key() FROM anon, authenticated;

-- CRITICAL: Decrypt functions expose PHI to any authenticated user
REVOKE EXECUTE ON FUNCTION public.decrypt_phi_text(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_phi_boolean(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_phi_date(text) FROM anon, authenticated;

-- HIGH: Encrypt functions - only service_role should call these
-- (triggered automatically, not called directly by users)
REVOKE EXECUTE ON FUNCTION public.encrypt_phi_text(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_phi_boolean(boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_phi_date(date) FROM anon, authenticated;

-- HIGH: Payment processing should be service_role only
REVOKE EXECUTE ON FUNCTION public.check_failed_payments() FROM anon, authenticated;

-- MEDIUM: Admin analytics should only be callable by admin role
-- But since we can't check role at GRANT level, revoke from anon only
REVOKE EXECUTE ON FUNCTION public.get_admin_analytics() FROM anon;

-- MEDIUM: RLS audit report is sensitive metadata
REVOKE EXECUTE ON FUNCTION public.get_rls_audit_report() FROM anon;

-- PHI scan should be admin/service only
REVOKE EXECUTE ON FUNCTION public.scan_phi_plaintext_violations() FROM anon, authenticated;

-- Trigger functions don't need direct EXECUTE (they're called via triggers)
REVOKE EXECUTE ON FUNCTION public.assign_member_role() FROM anon;
REVOKE EXECUTE ON FUNCTION public.assign_member_to_payment_exempt() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_coach_user_role() FROM anon;
REVOKE EXECUTE ON FUNCTION public.encrypt_phi_on_form_submission() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_no_plaintext_phi() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_form_submissions_safe() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_medical_fields_from_coach_update() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_view_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_view_update() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_subscription_totals() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_addon_to_care_team() FROM anon, authenticated;

-- Add comments for audit trail
COMMENT ON FUNCTION public.get_phi_encryption_key() IS 'SECURITY: service_role only - returns encryption key from vault';
COMMENT ON FUNCTION public.decrypt_phi_text(text) IS 'SECURITY: service_role only - decrypts PHI';
COMMENT ON FUNCTION public.decrypt_phi_boolean(text) IS 'SECURITY: service_role only - decrypts PHI';
COMMENT ON FUNCTION public.decrypt_phi_date(text) IS 'SECURITY: service_role only - decrypts PHI';
COMMENT ON FUNCTION public.check_failed_payments() IS 'SECURITY: service_role only - modifies subscription status';
