-- Migration: Allow anonymous users to submit coach applications and read specialization tags
-- Both are needed because the coach application form is public/unauthenticated

-- ============================================================================
-- PART 1: coach_applications - Allow anon INSERT with status='pending' only
-- ============================================================================

-- Drop any existing anon insert policy if it exists (clean slate)
DROP POLICY IF EXISTS "anon_can_submit_applications" ON public.coach_applications;

-- Create anon INSERT policy - only allows inserting with status='pending'
-- This prevents anonymous users from inserting pre-approved applications
CREATE POLICY "anon_can_submit_applications"
  ON public.coach_applications
  FOR INSERT
  TO anon
  WITH CHECK (status = 'pending');

-- Grant table-level INSERT permission to anon role
-- (RLS policy above controls which rows, this grants the basic permission)
GRANT INSERT ON public.coach_applications TO anon;

-- Verify: Existing policies should be:
-- - Admin can SELECT/UPDATE/DELETE (for reviewing applications)
-- - Anon can INSERT with status = 'pending' (this new one)
-- - No SELECT for anon (applicants can't read other applications)

-- ============================================================================
-- PART 2: specialization_tags - Ensure anon can read active tags
-- ============================================================================

-- The previous migration created a policy "Public read for active specialization tags"
-- but it may not have explicitly granted to anon role. Let's ensure both anon and
-- authenticated can read.

-- Drop the existing policy and recreate with explicit role grants
DROP POLICY IF EXISTS "Public read for active specialization tags" ON public.specialization_tags;
DROP POLICY IF EXISTS "anon_can_read_active_tags" ON public.specialization_tags;
DROP POLICY IF EXISTS "Anyone can read active specialization tags" ON public.specialization_tags;

-- Create separate policies for anon and authenticated to be explicit
CREATE POLICY "anon_can_read_active_tags"
  ON public.specialization_tags
  FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY "authenticated_can_read_active_tags"
  ON public.specialization_tags
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Note: Admin INSERT/UPDATE/DELETE policies should already exist from previous migration
