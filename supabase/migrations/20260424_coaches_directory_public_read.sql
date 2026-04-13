-- Allow anonymous (public marketing page) read access to coaches_directory.
--
-- The coaches_directory view exposes only safe fields (no email, phone, DOB,
-- discord, socials) — just first/last name, bio, location, photo, qualifications,
-- specializations, level, head coach flags. Visitors hitting /meet-our-team need
-- to see this without authenticating.
--
-- The view was created with security_invoker = on, which means SELECTs run with
-- the caller's permissions and hit RLS on the underlying coaches_public table.
-- Anon doesn't have SELECT on coaches_public, so the page silently fell back
-- to "Our coaching team is being assembled" instead of showing real coaches.
--
-- Fix: switch the view to security_invoker = off so it runs with the view
-- owner's permissions and bypasses RLS on the underlying table. This is safe
-- because the view's column list is the public projection — no PII leaks.
-- Then explicitly grant SELECT to anon and authenticated.

ALTER VIEW public.coaches_directory SET (security_invoker = off);

GRANT SELECT ON public.coaches_directory TO anon, authenticated;
