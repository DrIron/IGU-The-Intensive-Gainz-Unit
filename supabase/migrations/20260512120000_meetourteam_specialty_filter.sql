-- Meet Our Team -- specialty filter
--
-- Extends coaches_directory with an approved_subroles JSONB aggregate so the
-- public /meet-our-team page can render per-coach specialty badges and a
-- filter chip row (Coaches / Dietitians / Physios / etc.) without a second
-- round-trip to user_subroles (which is RLS-restricted to self+admin).
--
-- Also widens the subrole_definitions read policy to anon so the chip row
-- can render before the user authenticates. Only active rows are exposed --
-- display_name + slug + sort_order are already client-facing copy by intent.
--
-- The view continues to bypass RLS on coaches_public (security_invoker = off,
-- granted in 20260424_coaches_directory_public_read.sql) because the column
-- projection is the public-safe set. The new approved_subroles aggregate
-- only includes status = 'approved' rows from user_subroles, so no pending /
-- rejected credentials leak.

-- 1. Rebuild coaches_directory with approved_subroles aggregate ------------
DROP VIEW IF EXISTS public.coaches_directory;

CREATE VIEW public.coaches_directory AS
SELECT
  cp.user_id,
  cp.first_name,
  cp.last_name,
  cp.nickname,
  cp.display_name,
  cp.short_bio,
  cp.bio,
  cp.profile_picture_url,
  cp.qualifications,
  cp.specializations,
  cp.specialties,
  cp.location,
  cp.status,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'slug',         sd.slug,
          'display_name', sd.display_name,
          'sort_order',   sd.sort_order
        )
        ORDER BY sd.sort_order
      )
      FROM public.user_subroles us
      JOIN public.subrole_definitions sd ON sd.id = us.subrole_id
      WHERE us.user_id   = cp.user_id
        AND us.status    = 'approved'
        AND sd.is_active = true
    ),
    '[]'::jsonb
  ) AS approved_subroles
FROM public.coaches_public cp
WHERE cp.status = 'active';

-- Match the existing surface: anon-readable, bypasses RLS on coaches_public.
ALTER VIEW public.coaches_directory SET (security_invoker = off);

GRANT SELECT ON public.coaches_directory TO anon, authenticated;

COMMENT ON VIEW public.coaches_directory IS
  'Public-safe coach directory. No PII/contacts/socials. Includes '
  'approved_subroles JSONB array (slug, display_name, sort_order) sourced '
  'from user_subroles + subrole_definitions where status = ''approved''.';


-- 2. Allow anon read of active subrole_definitions ------------------------
-- The existing policy is named "Anyone can read active subrole definitions"
-- but only grants to authenticated. The /meet-our-team chip row renders
-- pre-auth, so widen to anon. Inactive rows still hidden.
DROP POLICY IF EXISTS "Anyone can read active subrole definitions"
  ON public.subrole_definitions;

CREATE POLICY "Anyone can read active subrole definitions"
  ON public.subrole_definitions FOR SELECT
  TO anon, authenticated
  USING (is_active = true);
