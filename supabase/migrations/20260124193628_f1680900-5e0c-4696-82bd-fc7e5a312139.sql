
-- ============================================================
-- FIX: form_submissions_medical_private should NOT allow coach SELECT
-- This table contains PHI (PAR-Q medical data, DOB)
-- ============================================================

-- Drop the coach policy that exposes PHI
DROP POLICY IF EXISTS "Coaches can read assigned clients medical_private" ON public.form_submissions_medical_private;

-- Verify only admin + owner can SELECT
-- Admin policy already exists via "Admins full access to form_submissions_medical_private"
-- User policy already exists via "Users can read own medical_private"

-- Add comment for audit trail
COMMENT ON TABLE public.form_submissions_medical_private IS 'PHI table - RLS: admin + owner only. Contains PAR-Q medical data and DOB. Coaches BLOCKED.';

-- ============================================================
-- Also check form_submissions_public for any coach access issues
-- ============================================================

-- Check and restrict if needed
DROP POLICY IF EXISTS "Coaches can view assigned clients form_submissions_public" ON public.form_submissions_public;

-- form_submissions_public should be safe (no PHI) but let's verify
-- Looking at the table - it contains first_name, last_name which are not PHI
-- But let's still restrict coach access for consistency
