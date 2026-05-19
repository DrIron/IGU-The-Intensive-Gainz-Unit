-- 1. Optional duration on educational_videos.
ALTER TABLE public.educational_videos
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER NULL CHECK (duration_seconds > 0);

COMMENT ON COLUMN public.educational_videos.duration_seconds IS
  'Optional video duration in seconds. Manually entered by admin (or auto-filled later via YouTube oEmbed).';

-- 2. Index for the continue-watching lookup pattern.
CREATE INDEX IF NOT EXISTS idx_video_access_log_user_granted
  ON public.video_access_log (user_id, created_at DESC)
  WHERE access_granted = true;

-- 3. Thumbnail extractor -- pure function, immutable.
CREATE OR REPLACE FUNCTION public.extract_video_thumbnail(p_url text, p_type text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_id text;
BEGIN
  IF p_type IS NULL OR p_url IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_type = 'youtube' THEN
    v_id := COALESCE(
      substring(p_url FROM 'youtube\.com/watch\?v=([A-Za-z0-9_-]{11})'),
      substring(p_url FROM 'youtu\.be/([A-Za-z0-9_-]{11})'),
      substring(p_url FROM 'youtube\.com/embed/([A-Za-z0-9_-]{11})'),
      substring(p_url FROM 'youtube\.com/shorts/([A-Za-z0-9_-]{11})')
    );
    IF v_id IS NOT NULL THEN
      RETURN 'https://i.ytimg.com/vi/' || v_id || '/hqdefault.jpg';
    END IF;
  END IF;
  -- Loom doesn't expose a stable public thumbnail; fall through to NULL.
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.extract_video_thumbnail(text, text) TO authenticated;

-- 4. Drop+recreate get_educational_videos_with_access -- adds duration_seconds, thumbnail_url, last_accessed_at.
DROP FUNCTION IF EXISTS public.get_educational_videos_with_access();

CREATE FUNCTION public.get_educational_videos_with_access()
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  category text,
  is_pinned boolean,
  is_free_preview boolean,
  duration_seconds integer,
  thumbnail_url text,
  created_at timestamptz,
  access_state text,
  is_completed boolean,
  last_accessed_at timestamptz
)
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
  WITH user_access AS (
    SELECT val.video_id, MAX(val.created_at) AS last_accessed_at
    FROM public.video_access_log val
    WHERE val.user_id = v_user_id AND val.access_granted = true
    GROUP BY val.video_id
  )
  SELECT
    ev.id,
    ev.title,
    CASE WHEN public.can_access_video(v_user_id, ev.id) THEN ev.description ELSE NULL END AS description,
    ev.category,
    ev.is_pinned,
    ev.is_free_preview,
    ev.duration_seconds,
    public.extract_video_thumbnail(ev.video_url, ev.video_type) AS thumbnail_url,
    ev.created_at,
    CASE
      WHEN ev.is_free_preview = true THEN 'preview'::text
      WHEN public.can_access_video(v_user_id, ev.id) THEN 'unlocked'::text
      ELSE 'locked'::text
    END AS access_state,
    EXISTS (
      SELECT 1 FROM public.video_progress vp
      WHERE vp.video_id = ev.id
        AND vp.user_id  = v_user_id
        AND vp.completed_at IS NOT NULL
    ) AS is_completed,
    ua.last_accessed_at
  FROM public.educational_videos ev
  LEFT JOIN user_access ua ON ua.video_id = ev.id
  WHERE ev.is_active = true
  ORDER BY ev.is_pinned DESC, ev.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_educational_videos_with_access() TO authenticated;

-- 5. Drop+recreate get_playlist_videos_with_access -- adds duration_seconds + thumbnail_url.
DROP FUNCTION IF EXISTS public.get_playlist_videos_with_access(uuid);

CREATE FUNCTION public.get_playlist_videos_with_access(p_playlist_id uuid)
RETURNS TABLE (
  playlist_video_id uuid,
  order_number integer,
  video_id uuid,
  title text,
  description text,
  category text,
  is_pinned boolean,
  is_free_preview boolean,
  duration_seconds integer,
  thumbnail_url text,
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
    CASE WHEN public.can_access_video(v_user_id, ev.id) THEN ev.description ELSE NULL END AS description,
    ev.category,
    ev.is_pinned,
    ev.is_free_preview,
    ev.duration_seconds,
    public.extract_video_thumbnail(ev.video_url, ev.video_type) AS thumbnail_url,
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
