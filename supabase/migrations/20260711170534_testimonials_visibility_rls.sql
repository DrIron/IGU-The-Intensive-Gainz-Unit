-- T1 Migration B — testimonials public-visibility RLS rewrite (spec §2).
-- Drop the two is_approved-gate anon SELECT policies; replace with one
-- consent/curation-based visibility rule. Keep the clients-only INSERT gate,
-- admin SELECT/UPDATE, own-row SELECT, and coach-views-own SELECT untouched.
-- Non-admin curation writes go exclusively through the SECURITY DEFINER RPCs
-- (Migration C) — NO broad coach/client UPDATE policy (column-level control
-- isn't RLS-expressible).

DROP POLICY IF EXISTS "Anyone can view approved testimonials" ON public.testimonials;
DROP POLICY IF EXISTS "anon_can_read_approved_testimonials" ON public.testimonials;

CREATE POLICY testimonials_public_visible ON public.testimonials
  FOR SELECT
  TO anon, authenticated
  USING (
    display_consent
    AND withdrawn_at IS NULL
    AND (show_on_coach_page OR featured_public)
    AND NOT hidden_by_admin
  );
