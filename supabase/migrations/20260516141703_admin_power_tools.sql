-- PR E admin power tools: drop playlist UNIQUE(order_number), backfill order_index,
-- add engagement aggregate RPC. See docs/EDUCATIONAL_CONTENT_REVIEW.md §6 PR E.

BEGIN;

-- 1. Drop the (playlist_id, order_number) UNIQUE constraint so DnD writes don't conflict mid-shuffle.
--    Keep UNIQUE(playlist_id, video_id).
ALTER TABLE public.playlist_videos
  DROP CONSTRAINT IF EXISTS playlist_videos_playlist_id_order_number_key;

-- 2. Backfill educational_videos.order_index for a sensible DnD starting point.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY is_pinned DESC, created_at DESC) - 1 AS rn
  FROM public.educational_videos
)
UPDATE public.educational_videos ev
SET order_index = ranked.rn
FROM ranked
WHERE ev.id = ranked.id;

-- 3. Engagement aggregate RPC -- admin-only.
CREATE OR REPLACE FUNCTION public.get_video_engagement_stats()
RETURNS TABLE (
  video_id uuid,
  title text,
  category text,
  is_active boolean,
  is_pinned boolean,
  is_free_preview boolean,
  total_views bigint,
  unique_viewers bigint,
  completions bigint,
  completion_rate numeric,
  last_viewed_at timestamptz,
  avg_days_to_complete numeric,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  WITH views AS (
    SELECT val.video_id,
           COUNT(*)::bigint                    AS total_views,
           COUNT(DISTINCT val.user_id)::bigint AS unique_viewers,
           MAX(val.created_at)                 AS last_viewed_at
    FROM public.video_access_log val
    WHERE val.access_granted = true
    GROUP BY val.video_id
  ),
  comps AS (
    SELECT vp.video_id, COUNT(*)::bigint AS completions
    FROM public.video_progress vp
    WHERE vp.completed_at IS NOT NULL
    GROUP BY vp.video_id
  ),
  first_views AS (
    SELECT val.user_id, val.video_id, MIN(val.created_at) AS first_viewed_at
    FROM public.video_access_log val
    WHERE val.access_granted = true
    GROUP BY val.user_id, val.video_id
  ),
  comp_times AS (
    SELECT vp.video_id,
           AVG(EXTRACT(EPOCH FROM (vp.completed_at - fv.first_viewed_at)) / 86400.0) AS avg_days_to_complete
    FROM public.video_progress vp
    JOIN first_views fv ON fv.user_id = vp.user_id AND fv.video_id = vp.video_id
    WHERE vp.completed_at IS NOT NULL
    GROUP BY vp.video_id
  )
  SELECT
    ev.id, ev.title, ev.category, ev.is_active, ev.is_pinned, ev.is_free_preview,
    COALESCE(v.total_views, 0)        AS total_views,
    COALESCE(v.unique_viewers, 0)     AS unique_viewers,
    COALESCE(c.completions, 0)        AS completions,
    CASE
      WHEN COALESCE(v.unique_viewers, 0) > 0
        THEN ROUND((COALESCE(c.completions, 0)::numeric / v.unique_viewers) * 100.0, 1)
      ELSE 0::numeric
    END                                AS completion_rate,
    v.last_viewed_at,
    ROUND(ct.avg_days_to_complete::numeric, 1) AS avg_days_to_complete,
    ev.created_at
  FROM public.educational_videos ev
  LEFT JOIN views v       ON v.video_id  = ev.id
  LEFT JOIN comps c       ON c.video_id  = ev.id
  LEFT JOIN comp_times ct ON ct.video_id = ev.id
  ORDER BY COALESCE(v.total_views, 0) DESC, ev.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_video_engagement_stats() TO authenticated;

COMMIT;
