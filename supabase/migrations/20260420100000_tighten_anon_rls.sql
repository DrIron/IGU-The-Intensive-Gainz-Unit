-- =========================================================================
-- Pre-launch RLS tightening (audit B4):
--   1. public.leads anon INSERT was `WITH CHECK (true)` -- any payload.
--      Require email regex + sane length caps. UTM fields bounded too.
--   2. public.medical_reviews INSERT policy was `WITH CHECK (true)` with no
--      TO clause -- applied to PUBLIC. Restrict to authenticated user
--      inserting own review with status='pending' and no reviewer assigned.
-- Service role always bypasses RLS, so edge functions that intentionally
-- insert on behalf of other users continue to work.
-- =========================================================================

-- ---- 1. leads ----------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can submit leads" ON public.leads;

CREATE POLICY "Anyone can submit leads"
ON public.leads FOR INSERT
TO anon, authenticated
WITH CHECK (
  email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND length(email) BETWEEN 3 AND 254
  AND length(coalesce(name, '')) <= 200
  AND length(coalesce(source, '')) <= 64
  AND length(coalesce(utm_source, '')) <= 128
  AND length(coalesce(utm_medium, '')) <= 128
  AND length(coalesce(utm_campaign, '')) <= 128
  AND length(coalesce(utm_content, '')) <= 128
  AND length(coalesce(utm_term, '')) <= 128
);

-- ---- 2. medical_reviews ------------------------------------------------
DROP POLICY IF EXISTS "Service role can insert medical reviews" ON public.medical_reviews;

CREATE POLICY "Authed user can insert own medical review"
ON public.medical_reviews FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
  AND status = 'pending'
  AND reviewed_by IS NULL
);
