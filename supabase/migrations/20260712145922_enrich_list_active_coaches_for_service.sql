-- ON2 — enrich the onboarding coach-selection profile.
--
-- WHY: `CoachPreferenceSection` fed `CoachDetailDialog` a deliberately lite coach
-- object, hard-nulling location / qualifications / gyms / socials / intro video /
-- headline / years, with the comment "RLS-gated pre-subscription".
--
-- That justification was FALSE. Three disproofs (verified 2026-07-12):
--   1. This function is SECURITY DEFINER — RLS does not apply to it at all. It
--      returned 5 profile columns only because its body SELECTed 5 columns.
--   2. coaches_public RLS is `tpl4_authenticated_select USING (auth.uid() IS NOT
--      NULL)` (20260126053859:337-340) — any authenticated user already reads every
--      column. There is no pre-subscription RLS tier in this schema.
--   3. Every field the dialog nulled is served to ANON today by
--      get_coach_public_profile_by_slug (20260711083642:20-49, GRANT ... TO anon)
--      for /coaches/:slug, and by coaches_directory for /meet-our-team — which
--      renders the SAME CoachDetailDialog with location + qualifications populated.
--
-- So this is pure data plumbing: project the already-public columns. NO policy
-- change, NO new grant surface — the REVOKE/GRANT block below is byte-identical to
-- the one this function already carried (authenticated only; onboarding callers are
-- authenticated by definition, and anon keeps its separate slug-keyed path).
--
-- Field parity is deliberately kept with get_coach_public_profile_by_slug so both
-- surfaces render the same CoachPublicProfile sections. Two shape notes:
--   * headline is NOT computed here. The FE derives it via the shared
--     `deriveCoachHeadline()` (CoachPublicProfile.tsx:54) so onboarding,
--     /coaches/:slug and /meet-our-team all build it identically — hence the raw
--     is_head_coach / head_coach_specialisation / coach_level fields.
--   * client_count_band is inlined rather than left to a per-coach
--     get_coach_client_count_band() call, which would be an N+1 across the list.
--     Same semantics: active subscriptions floored to the nearest 10, NULL under 10
--     (engagement metric -> `subscriptions`, incl. payment-exempt, per CLAUDE.md).
--
-- `slug` unblocks the dialog's "View full profile" deep-link to /coaches/:slug.

CREATE OR REPLACE FUNCTION public.list_active_coaches_for_service(p_service_id uuid, p_gym_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH coach_loads AS (
    SELECT
      c.id                  AS coach_id,
      c.user_id,
      cp.first_name,
      cp.last_name,
      cp.nickname,
      cp.slug,
      cp.profile_picture_url,
      cp.short_bio,
      cp.bio,
      cp.location,
      cp.qualifications,
      cp.specializations,
      cp.intro_video_url,
      cp.years_experience,
      cp.is_head_coach,
      cp.head_coach_specialisation,
      cp.coach_level,
      c.status,
      LEAST(NULLIF(csl.max_clients, 0), csl.coach_max_clients) AS effective_cap,
      csl.is_accepting,
      (
        SELECT COUNT(*)::int
        FROM public.subscriptions s
        WHERE s.coach_id = c.user_id
          AND s.service_id = p_service_id
          AND s.status IN ('pending', 'active')
      ) AS current_count,
      -- Engagement band across ALL services (mirrors get_coach_client_count_band):
      -- floor to nearest 10, NULL under 10 so a thin/new coach shows no stat.
      (
        SELECT CASE WHEN COUNT(*) < 10 THEN NULL ELSE (COUNT(*)::int / 10) * 10 END
        FROM public.subscriptions s2
        WHERE s2.coach_id = c.user_id
          AND s2.status = 'active'
      ) AS client_count_band,
      (
        SELECT jsonb_build_object(
          'instagram', pr.instagram_url,
          'tiktok',    pr.tiktok_url,
          'youtube',   pr.youtube_url,
          'snapchat',  pr.snapchat_url
        )
        FROM public.coaches_private pr
        WHERE pr.user_id = c.user_id
      ) AS socials,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) ORDER BY g.sort_order, g.name)
        FROM public.coach_gyms cg
        JOIN public.gyms g ON g.id = cg.gym_id
        WHERE cg.coach_user_id = c.user_id AND g.is_active = true
      ), '[]'::jsonb) AS gyms,
      CASE
        WHEN p_gym_id IS NULL THEN false
        ELSE EXISTS (
          SELECT 1 FROM public.coach_gyms cg
          WHERE cg.coach_user_id = c.user_id AND cg.gym_id = p_gym_id
        )
      END AS gym_match
    FROM public.coaches c
    JOIN public.coaches_public cp
      ON cp.user_id = c.user_id
    JOIN public.coach_service_limits csl
      ON csl.coach_id = c.id
     AND csl.service_id = p_service_id
    WHERE c.status = 'active'
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',                        coach_id,
    'user_id',                   user_id,
    'first_name',                first_name,
    'last_name',                 last_name,
    'nickname',                  nickname,
    'slug',                      slug,
    'profile_picture_url',       profile_picture_url,
    'short_bio',                 short_bio,
    'bio',                       bio,
    'location',                  location,
    'qualifications',            qualifications,
    'specializations',           specializations,
    'intro_video_url',           intro_video_url,
    'years_experience',          years_experience,
    'is_head_coach',             is_head_coach,
    'head_coach_specialisation', head_coach_specialisation,
    'coach_level',               coach_level,
    'socials',                   socials,
    'gyms',                      gyms,
    'client_count_band',         client_count_band,
    'status',                    status,
    'max_clients',               COALESCE(effective_cap, 0),
    'current_clients',           current_count,
    'available_spots',           CASE WHEN effective_cap IS NULL THEN 999 ELSE GREATEST(effective_cap - current_count, 0) END,
    'gym_match',                 gym_match
  ) ORDER BY gym_match DESC, coach_id), '[]'::jsonb)
  FROM coach_loads
  WHERE is_accepting = true
    AND (effective_cap IS NULL OR current_count < effective_cap);
$function$;

-- Unchanged from 20260707163133 — re-stated because CREATE OR REPLACE does not
-- reset grants, but keeping them here makes the migration self-describing and
-- guards against a future re-create dropping the REVOKE (CLAUDE.md § SECURITY
-- DEFINER RPCs — mandatory REVOKE pattern).
REVOKE ALL ON FUNCTION public.list_active_coaches_for_service(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_active_coaches_for_service(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_active_coaches_for_service(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.list_active_coaches_for_service(uuid, uuid) IS
  'Onboarding coach picker: active, accepting, under-cap coaches for a service, with capacity counted server-side and the full public profile (location, qualifications, gyms, socials, intro video, slug) — same fields get_coach_public_profile_by_slug already serves anon. SECURITY DEFINER, authenticated EXECUTE, no anon/PUBLIC (ON2).';
