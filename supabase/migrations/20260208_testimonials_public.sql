-- Allow anonymous users to view approved testimonials
-- This enables displaying testimonials to all visitors

-- Drop existing policy if it exists (to handle re-runs)
DROP POLICY IF EXISTS "Anyone can view approved testimonials" ON public.testimonials;

CREATE POLICY "Anyone can view approved testimonials"
ON public.testimonials FOR SELECT
TO anon, authenticated
USING (is_approved = true AND is_archived = false);
