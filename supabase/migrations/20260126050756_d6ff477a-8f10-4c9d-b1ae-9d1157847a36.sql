-- ============================================================
-- SECURITY HARDENING: Lock down form_submissions_decrypted view
-- This view contains decrypted PHI and must NEVER be accessible
-- from client-side code (anon or authenticated roles).
-- Only service_role (server) or postgres should access it.
-- ============================================================

-- Revoke ALL privileges from public, anon, and authenticated
REVOKE ALL ON public.form_submissions_decrypted FROM public;
REVOKE ALL ON public.form_submissions_decrypted FROM anon;
REVOKE ALL ON public.form_submissions_decrypted FROM authenticated;

-- Grant SELECT only to service_role (for edge functions/server-side use)
GRANT SELECT ON public.form_submissions_decrypted TO service_role;

-- Add security documentation comment
COMMENT ON VIEW public.form_submissions_decrypted IS 
'SECURITY: ADMIN/SERVER-ONLY - Contains decrypted PHI (email, phone, DOB, PAR-Q medical data).
Never expose via client-side queries. Access restricted to service_role only.
Frontend components must use form_submissions_safe for coach access or direct admin edge functions.';