-- Allow anonymous users to view active services (public pricing)
-- This enables showing pricing to unauthenticated visitors

DROP POLICY IF EXISTS "Services viewable by authenticated users" ON public.services;

CREATE POLICY "Active services publicly viewable"
ON public.services FOR SELECT
TO anon, authenticated
USING (is_active = true);
