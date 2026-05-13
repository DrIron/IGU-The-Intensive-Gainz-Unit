-- Fix branding violation: "Dr. Iron" appears in the live homepage In-Person
-- service description row seeded by 20260207200001_seed_site_content.sql.
-- CLAUDE.md branding non-negotiable: the product brand is "IGU", never
-- "Dr Iron". Parent-entity references in the footer (homepage/footer/about
-- and homepage/footer/copyright) intentionally stay unchanged — those are
-- the legal entity name, not marketing copy.
--
-- Guarded by `value LIKE '%Dr. Iron%'` so the UPDATE is a no-op if the
-- string was already corrected via the admin Site Content UI.

UPDATE public.site_content
SET value = 'Premium hands-on coaching with your assigned coach at their available gym locations in Kuwait.',
    updated_at = NOW()
WHERE page = 'homepage'
  AND section = 'programs'
  AND key = 'inperson_description'
  AND value LIKE '%Dr. Iron%';
