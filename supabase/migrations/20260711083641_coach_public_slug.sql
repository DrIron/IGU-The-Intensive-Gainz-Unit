-- T2 Migration A — coaches_public.slug for the public /coaches/:slug page.
--
-- Slug lives on coaches_public (client-facing profile store, per the coach-tables
-- refactor's canonical homes — NOT coaches). Nullable; unique on lower(slug).
-- Anon-readability comes via the get_coach_public_profile_by_slug RPC (Migration B)
-- and the coaches_directory view (extended below) — NOT a base-table grant.

ALTER TABLE public.coaches_public
  ADD COLUMN IF NOT EXISTS slug text;

COMMENT ON COLUMN public.coaches_public.slug IS
  'Public URL slug for /coaches/:slug. Generated from nickname -> display_name -> first-last; admin-editable. Unique (case-insensitive).';

CREATE UNIQUE INDEX IF NOT EXISTS coaches_public_slug_lower_uidx
  ON public.coaches_public (lower(slug))
  WHERE slug IS NOT NULL;

-- Deterministic backfill for existing coaches missing a slug.
-- slugify( coalesce(nullif(nickname,''), display_name, first_name-'-'-last_name) ):
--   lowercase, non-alphanumeric -> '-', collapse repeats, trim leading/trailing '-'.
-- Collisions on the same base get a short deterministic user_id fragment suffix.
WITH base AS (
  SELECT
    user_id,
    trim(both '-' from regexp_replace(
      lower(coalesce(
        nullif(nickname, ''),
        nullif(display_name, ''),
        nullif(first_name, '') || '-' || nullif(last_name, ''),
        nullif(first_name, '')
      )),
      '[^a-z0-9]+', '-', 'g'
    )) AS base_slug
  FROM public.coaches_public
  WHERE slug IS NULL
),
ranked AS (
  SELECT
    user_id,
    base_slug,
    row_number() OVER (PARTITION BY base_slug ORDER BY user_id) AS rn
  FROM base
  WHERE base_slug IS NOT NULL AND base_slug <> ''
)
UPDATE public.coaches_public cp
SET slug = CASE
             WHEN r.rn = 1 THEN r.base_slug
             ELSE r.base_slug || '-' || substr(replace(cp.user_id::text, '-', ''), 1, 6)
           END
FROM ranked r
WHERE cp.user_id = r.user_id;

-- Surface slug to the anon-readable coaches_directory view (feeds Meet-the-Team
-- "View profile" links). New column appended last so CREATE OR REPLACE is valid.
CREATE OR REPLACE VIEW public.coaches_directory AS
  SELECT
    user_id,
    first_name,
    last_name,
    nickname,
    display_name,
    short_bio,
    bio,
    profile_picture_url,
    qualifications,
    specializations,
    specialties,
    location,
    status,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('slug', sd.slug, 'display_name', sd.display_name, 'sort_order', sd.sort_order) ORDER BY sd.sort_order)
      FROM user_subroles us
        JOIN subrole_definitions sd ON sd.id = us.subrole_id
      WHERE us.user_id = cp.user_id AND us.status = 'approved'::subrole_status AND sd.is_active = true
    ), '[]'::jsonb) AS approved_subroles,
    is_head_coach,
    head_coach_specialisation,
    slug
  FROM public.coaches_public cp
  WHERE status = 'active'::text;
