-- PR G: surface playlist-level coach_content_assignments to the client UI.
-- Schema already supports cca.playlist_id (PR F); only RPCs need extending.

BEGIN;

-- 1. RPC: which playlists are assigned to the caller.
CREATE OR REPLACE FUNCTION public.get_my_assigned_playlists()
RETURNS TABLE (playlist_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT DISTINCT cca.playlist_id
  FROM public.coach_content_assignments cca
  WHERE cca.client_id = v_user_id AND cca.playlist_id IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_assigned_playlists() TO authenticated;

-- 2. Update get_required_content_summary -- count playlist assignments too.
--    A playlist counts as "complete" when ALL its child videos are completed.
CREATE OR REPLACE FUNCTION public.get_required_content_summary()
RETURNS TABLE (
  required_total integer,
  required_pending integer,
  assigned_total integer,
  assigned_pending integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_role text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_user_role := CASE
    WHEN public.has_role(v_user_id, 'admin') THEN 'admin'
    WHEN public.has_role(v_user_id, 'coach') THEN 'coach'
    ELSE 'client'
  END;

  RETURN QUERY
  WITH required AS (
    SELECT ev.id,
           EXISTS (
             SELECT 1 FROM public.video_progress vp
             WHERE vp.video_id = ev.id AND vp.user_id = v_user_id AND vp.completed_at IS NOT NULL
           ) AS done
    FROM public.educational_videos ev
    WHERE ev.is_active = true
      AND ev.required_for_role IS NOT NULL
      AND (ev.required_for_role = 'all' OR ev.required_for_role = v_user_role)
  ),
  assigned_videos AS (
    SELECT cca.id,
           EXISTS (
             SELECT 1 FROM public.video_progress vp
             WHERE vp.video_id = cca.video_id AND vp.user_id = v_user_id AND vp.completed_at IS NOT NULL
           ) AS done
    FROM public.coach_content_assignments cca
    WHERE cca.client_id = v_user_id AND cca.video_id IS NOT NULL
  ),
  assigned_playlists AS (
    SELECT cca.id,
           NOT EXISTS (
             SELECT 1
             FROM public.playlist_videos pv2
             LEFT JOIN public.video_progress vpr
               ON vpr.video_id = pv2.video_id
               AND vpr.user_id = v_user_id
               AND vpr.completed_at IS NOT NULL
             WHERE pv2.playlist_id = cca.playlist_id
               AND vpr.video_id IS NULL
           ) AS done
    FROM public.coach_content_assignments cca
    WHERE cca.client_id = v_user_id AND cca.playlist_id IS NOT NULL
  )
  SELECT
    (SELECT COUNT(*) FROM required)::integer,
    (SELECT COUNT(*) FROM required WHERE NOT done)::integer,
    ((SELECT COUNT(*) FROM assigned_videos) + (SELECT COUNT(*) FROM assigned_playlists))::integer,
    ((SELECT COUNT(*) FROM assigned_videos WHERE NOT done)
      + (SELECT COUNT(*) FROM assigned_playlists WHERE NOT done))::integer;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_required_content_summary() TO authenticated;

COMMIT;
