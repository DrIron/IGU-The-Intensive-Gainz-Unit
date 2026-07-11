-- T2 Migration B — anon read path for the public /coaches/:slug page.
--
-- coaches_public is NOT anon-readable (only authenticated SELECTs it), so this
-- SECURITY DEFINER RPC is the ONLY anon path to a coach's public profile. Never
-- grant anon on the base table.
--
-- Active-coach gate: coaches.status = 'active' (authoritative lifecycle; enum
-- values are 'active'/'pending'). Slug-not-found OR inactive -> NULL (page 404s).
-- Returns every field the CoachPublicProfile card needs (specializations as
-- VALUES — the page resolves labels), plus coach_user_id so the page can call
-- get_coach_client_count_band + build the CTA.

CREATE OR REPLACE FUNCTION public.get_coach_public_profile_by_slug(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'coach_user_id',             cp.user_id,
    'first_name',                cp.first_name,
    'last_name',                 cp.last_name,
    'nickname',                  cp.nickname,
    'display_name',              cp.display_name,
    'profile_picture_url',       cp.profile_picture_url,
    'location',                  cp.location,
    'bio',                       cp.bio,
    'short_bio',                 cp.short_bio,
    'qualifications',            cp.qualifications,
    'specializations',           cp.specializations,
    'specialties',               cp.specialties,
    'intro_video_url',           cp.intro_video_url,
    'years_experience',          cp.years_experience,
    'is_head_coach',             cp.is_head_coach,
    'head_coach_specialisation', cp.head_coach_specialisation,
    'coach_level',               cp.coach_level,
    'socials', jsonb_build_object(
      'instagram', pr.instagram_url,
      'tiktok',    pr.tiktok_url,
      'youtube',   pr.youtube_url,
      'snapchat',  pr.snapchat_url
    ),
    'gyms', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) ORDER BY g.sort_order, g.name)
      FROM public.coach_gyms cg
      JOIN public.gyms g ON g.id = cg.gym_id
      WHERE cg.coach_user_id = cp.user_id AND g.is_active = true
    ), '[]'::jsonb)
  )
  FROM public.coaches_public cp
  JOIN public.coaches c ON c.user_id = cp.user_id
  LEFT JOIN public.coaches_private pr ON pr.user_id = cp.user_id
  WHERE lower(cp.slug) = lower(p_slug)
    AND c.status = 'active'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_coach_public_profile_by_slug(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_coach_public_profile_by_slug(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_coach_public_profile_by_slug(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_coach_public_profile_by_slug(text) IS
  'Anon-safe public coach profile by slug for /coaches/:slug. Active coaches only (coaches.status=active); NULL when not found/inactive. SECURITY DEFINER, anon+authenticated EXECUTE, no PUBLIC.';
