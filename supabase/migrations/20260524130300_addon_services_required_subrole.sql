-- Phase 0/F7 of addon-services Path B rebuild.
-- See docs/ADDON_SERVICES_BUILD_SPEC.md § 1 (F7) and § "Open Questions"
-- (cross-subrole eligibility -- resolved 2026-05-24 as Strict-match).
--
-- Adds an explicit required_subrole column to addon_services. Strict-match
-- rule: a staff user can log an addon session only when their approved
-- subrole equals the required_subrole AND they are an active care-team
-- member for the client. Helper is_addon_eligible_professional in
-- 20260524130600 reads from this column.
--
-- Seed values inferred from the catalog seeded in 20260211073308:
--   session_pack rows                  -> 'coach'        (in-person sessions)
--   "Sports Psychologist" rows         -> 'sports_psychologist'
--   "Physiotherapist" rows             -> 'physiotherapist'
--   "Posing Coach" rows                -> 'coach'        (no posing_coach subrole exists)
--   one_time / monthly_addon (Initial Consult, Photo Shoot, Comp Prep) -> 'coach'
--
-- Valid slugs are constrained by FK to subrole_definitions (see CLAUDE.md
-- § 5 -- coach, dietitian, physiotherapist, sports_psychologist, mobility_coach).

ALTER TABLE public.addon_services
  ADD COLUMN required_subrole TEXT;

UPDATE public.addon_services
   SET required_subrole = 'sports_psychologist'
 WHERE name ILIKE 'Sports Psychologist%';

UPDATE public.addon_services
   SET required_subrole = 'physiotherapist'
 WHERE name ILIKE 'Physiotherapist%';

UPDATE public.addon_services
   SET required_subrole = 'coach'
 WHERE required_subrole IS NULL;

ALTER TABLE public.addon_services
  ALTER COLUMN required_subrole SET NOT NULL,
  ADD CONSTRAINT addon_services_required_subrole_fk
    FOREIGN KEY (required_subrole)
    REFERENCES public.subrole_definitions (slug)
    ON UPDATE CASCADE
    ON DELETE RESTRICT;

-- Data normalisation: pre-existing rows have pack_size=1 with pack_price_kwd
-- NULL (single-session services priced via base_price_kwd, not via a real
-- pack). The new pack_consistency CHECK below requires both columns NULL OR
-- both populated. NULL out pack_size for these rows so they satisfy the
-- "both NULL" branch. Inverse case (pack_size NULL, pack_price NOT NULL) was
-- verified empty before this migration.
UPDATE public.addon_services
   SET pack_size = NULL
 WHERE pack_size IS NOT NULL AND pack_price_kwd IS NULL;

ALTER TABLE public.addon_services
  ADD CONSTRAINT addon_services_payout_nonneg
    CHECK (professional_payout_kwd >= 0 AND igu_take_kwd >= 0),
  ADD CONSTRAINT addon_services_base_price_nonneg
    CHECK (base_price_kwd >= 0),
  ADD CONSTRAINT addon_services_pack_consistency
    CHECK (
      (pack_size IS NULL AND pack_price_kwd IS NULL)
      OR
      (pack_size IS NOT NULL AND pack_size >= 1
       AND pack_price_kwd IS NOT NULL AND pack_price_kwd >= 0)
    );

COMMENT ON COLUMN public.addon_services.required_subrole IS
  'Slug of the subrole_definitions row a professional must hold (approved) '
  'to log a session against a purchase of this addon. Strict-match policy: '
  'no cross-subrole logging. Admins bypass via is_admin() inside the helper.';
