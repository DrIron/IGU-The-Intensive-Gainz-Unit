-- Specialist parity — S1: dietitian profile data model (MODEL A — extend the per-role store).
-- Model A decided by Hasan (2026-07-04): extend `dietitians` (+ `staff_professional_info` for level)
-- with coach-parity profile fields; do NOT start the unified `professional_profiles` refactor
-- (model B → FOR_LATER). Model A avoids colliding with the in-flight coach 3-table refactor.
--
-- This slice: (1) add the profile fields, (2) tighten specialist self-edit RLS, (3) contain client
-- PII by routing assigned-client reads through a column-limited, relationship-gated safe view so a
-- client sees name/pic/bio/credentials but NEVER the license / operational columns. The dietitian
-- care-team (`care_team_assignments`) + payout behavior is untouched.

-- 1. Coach-parity profile fields. `bio`, `certifications[]`, `nutrition_specialties[]` already exist
--    on `dietitians`; add the rest, mirroring coaches_public (short_bio / qualifications /
--    specializations / profile_picture_url / location / socials). `specializations[]` holds shared
--    specialization_tags values — same vocabulary as coaches_public.specializations. Level stays on
--    staff_professional_info (admin-set, shown read-only); no profile fields go there.
ALTER TABLE public.dietitians
  ADD COLUMN IF NOT EXISTS short_bio text,
  ADD COLUMN IF NOT EXISTS qualifications text[],
  ADD COLUMN IF NOT EXISTS specializations text[],
  ADD COLUMN IF NOT EXISTS profile_picture_url text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS tiktok_url text,
  ADD COLUMN IF NOT EXISTS youtube_url text;

COMMENT ON COLUMN public.dietitians.specializations IS
  'Shared specialization_tags values (same vocabulary as coaches_public.specializations). Client-safe.';
COMMENT ON COLUMN public.dietitians.qualifications IS
  'Coach-parity credential/qualification lines. Client-safe.';
COMMENT ON COLUMN public.dietitians.short_bio IS
  'Coach-parity one-liner. Client-safe.';

-- 2. Self-edit parity + safety. The existing own_update policy had USING but no WITH CHECK, so a
--    specialist could UPDATE their row and reassign user_id to someone else. Recreate with both, and
--    scope to the authenticated role (was `public`). Self-SELECT / admin-ALL / coach-SELECT unchanged.
DROP POLICY IF EXISTS dietitians_own_update ON public.dietitians;
CREATE POLICY dietitians_own_update ON public.dietitians
  FOR UPDATE TO authenticated
  USING  ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- 3. Client PII containment. `dietitians_client_select` granted an assigned client the FULL base row
--    (incl. license_number / license_state / license_expiry / max_clients / accepting_clients). No app
--    code reads the base `dietitians` table client-side, so replace that path with the column-limited
--    safe view below and drop the base client policy — clients can no longer reach license/operational
--    columns at all. (admin / coach / self base policies remain, matching prior staff behavior.)
DROP POLICY IF EXISTS dietitians_client_select ON public.dietitians;

-- 4. Client-safe, relationship-gated view. Definer (like coaches_directory) so it projects a fixed
--    safe column set and gates on the care-team link itself; name comes from profiles_public
--    (first_name / display_name) — never profiles_private PII. Readable by: admin, the specialist
--    themselves, any coach (parity with the retained dietitians_coach_select), or a client with an
--    active/scheduled_end dietitian assignment to that specialist.
CREATE OR REPLACE VIEW public.dietitians_client_safe
WITH (security_invoker = false, security_barrier = true) AS
  SELECT
    d.user_id,
    pp.first_name,
    pp.display_name,
    d.profile_picture_url,
    d.bio,
    d.short_bio,
    d.qualifications,
    d.specializations,
    d.certifications,
    d.nutrition_specialties,
    d.location,
    d.instagram_url,
    d.tiktok_url,
    d.youtube_url
  FROM public.dietitians d
  LEFT JOIN public.profiles_public pp ON pp.id = d.user_id
  WHERE
    public.is_admin((SELECT auth.uid()))
    OR d.user_id = (SELECT auth.uid())
    OR public.is_coach((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.care_team_assignments cta
      WHERE cta.client_id = (SELECT auth.uid())
        AND cta.staff_user_id = d.user_id
        AND cta.specialty = 'dietitian'::staff_specialty
        AND cta.lifecycle_status = ANY (ARRAY['active'::care_team_status, 'scheduled_end'::care_team_status])
    );

REVOKE ALL ON public.dietitians_client_safe FROM PUBLIC;
REVOKE ALL ON public.dietitians_client_safe FROM anon;
GRANT SELECT ON public.dietitians_client_safe TO authenticated;
