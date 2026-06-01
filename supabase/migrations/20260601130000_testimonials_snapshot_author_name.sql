-- B9-N1: Homepage testimonial author names broken for every visitor.
--
-- src/pages/Index.tsx read profiles_private.full_name to display testimonial
-- author names on the public homepage. profiles_private has only a self-select
-- RLS policy (tpl1_self_select USING auth.uid() = profile_id) -- no anon path --
-- so anon visitors hit `42501 permission denied for table profiles_private`
-- and every testimonial card renders without an author name.
--
-- Fix: snapshot the display name onto the testimonial row at submission time.
-- Anon homepage browsers then read the name directly off the (anon-readable)
-- testimonials row, never traversing RLS-gated profiles_private/profiles_public.

ALTER TABLE public.testimonials
  ADD COLUMN author_display_name TEXT;

COMMENT ON COLUMN public.testimonials.author_display_name IS
  'Snapshot of profiles_public.display_name (fallback: first_name) at testimonial submission time. Populated by the client at INSERT. Allows anon homepage browsers to read author names without traversing RLS-gated profiles_private/profiles_public. Backfilled once at deploy time.';

-- One-shot backfill from profiles_public for any existing rows.
-- At write time there are 0 testimonials in prod (verified 2026-06-01), so
-- this is a no-op there but stays idempotent for any environment.
UPDATE public.testimonials t
   SET author_display_name = COALESCE(pp.display_name, pp.first_name)
  FROM public.profiles_public pp
 WHERE pp.id = t.user_id
   AND t.author_display_name IS NULL;
