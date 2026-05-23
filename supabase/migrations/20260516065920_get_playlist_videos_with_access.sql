-- RPC for playlist consumption. Mirrors get_educational_videos_with_access but
-- scoped to a playlist and ordered by order_number. Returns access state and
-- completion flag per video so the client can render VideoAccessCard directly
-- (no raw video_url leak). See docs/EDUCATIONAL_CONTENT_REVIEW.md §2 CRIT-2.

CREATE OR REPLACE FUNCTION public.get_playlist_videos_with_access(p_playlist_id uuid)
RETURNS TABLE (
  playlist_video_id uuid,
  order_number integer,
  video_id uuid,
  title text,
  description text,
  category text,
  is_pinned boolean,
  is_free_preview boolean,
  access_state text,
  is_completed boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_staff boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_is_staff := public.has_role(v_user_id, 'admin') OR public.has_role(v_user_id, 'coach');

  -- Verify the playlist exists. Clients only see active playlists; staff see all.
  IF NOT EXISTS (
    SELECT 1 FROM public.video_playlists
    WHERE id = p_playlist_id
      AND (is_active = true OR v_is_staff)
  ) THEN
    RAISE EXCEPTION 'Playlist not found or inactive';
  END IF;

  RETURN QUERY
  SELECT
    pv.id              AS playlist_video_id,
    pv.order_number,
    ev.id              AS video_id,
    ev.title,
    CASE
      WHEN public.can_access_video(v_user_id, ev.id) THEN ev.description
      ELSE NULL
    END                AS description,
    ev.category,
    ev.is_pinned,
    ev.is_free_preview,
    CASE
      WHEN ev.is_free_preview = true THEN 'preview'::text
      WHEN public.can_access_video(v_user_id, ev.id) THEN 'unlocked'::text
      ELSE 'locked'::text
    END                AS access_state,
    EXISTS (
      SELECT 1 FROM public.video_progress vp
      WHERE vp.video_id = ev.id
        AND vp.user_id  = v_user_id
        AND vp.completed_at IS NOT NULL
    )                  AS is_completed
  FROM public.playlist_videos pv
  JOIN public.educational_videos ev ON ev.id = pv.video_id
  WHERE pv.playlist_id = p_playlist_id
    AND ev.is_active = true
  ORDER BY pv.order_number ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_playlist_videos_with_access(uuid) TO authenticated;
