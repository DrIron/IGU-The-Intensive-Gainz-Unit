-- list_active_coaches_for_service read the 5 profile fields (first_name, last_name,
-- profile_picture_url, short_bio, specializations) from the DEPRECATED public.coaches
-- base columns. Coaches edit those via CoachProfile → coaches_public, so real coaches
-- (and the specializations backfill) never reached the RPC (confirmed drift on prod:
-- Fahad coaches.specializations = NULL vs coaches_public = [powerlifting,
-- nutrition_coaching]). Align with the coach-table refactor's canonical homes: keep
-- coaches c for id/user_id/status + the coach_service_limits join, but read the profile
-- fields from coaches_public. Every active coach has a coaches_public row (verified), so
-- the inner join drops nobody. p_gym_id/gym_match/spots + grants unchanged.
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
      cp.profile_picture_url,
      cp.short_bio,
      cp.specializations,
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
    'id',                  coach_id,
    'user_id',             user_id,
    'first_name',          first_name,
    'last_name',           last_name,
    'profile_picture_url', profile_picture_url,
    'short_bio',           short_bio,
    'specializations',     specializations,
    'status',              status,
    'max_clients',         COALESCE(effective_cap, 0),
    'current_clients',     current_count,
    'available_spots',     CASE WHEN effective_cap IS NULL THEN 999 ELSE GREATEST(effective_cap - current_count, 0) END,
    'gym_match',           gym_match
  ) ORDER BY gym_match DESC, coach_id), '[]'::jsonb)
  FROM coach_loads
  WHERE is_accepting = true
    AND (effective_cap IS NULL OR current_count < effective_cap);
$function$;

REVOKE ALL ON FUNCTION public.list_active_coaches_for_service(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_active_coaches_for_service(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_active_coaches_for_service(uuid, uuid) TO authenticated;
