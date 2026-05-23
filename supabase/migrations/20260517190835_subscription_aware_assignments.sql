-- PR J: surface client subscription status in get_coach_assignment_progress so
-- coaches can hide lapsed clients by default. No data deletion -- assignments
-- come back automatically if the client reactivates.

BEGIN;

DROP FUNCTION IF EXISTS public.get_coach_assignment_progress();

CREATE FUNCTION public.get_coach_assignment_progress()
RETURNS TABLE (
  assignment_id uuid,
  client_id uuid,
  client_first_name text,
  client_display_name text,
  client_subscription_status text,
  video_id uuid,
  video_title text,
  playlist_id uuid,
  playlist_title text,
  note text,
  assigned_at timestamptz,
  due_by timestamptz,
  is_completed boolean
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
  IF NOT (public.has_role(v_user_id, 'coach') OR public.has_role(v_user_id, 'admin')) THEN
    RAISE EXCEPTION 'Coach or admin access required';
  END IF;

  RETURN QUERY
  WITH client_status AS (
    -- Latest subscription per client. NULL when client has never had one.
    SELECT DISTINCT ON (s.user_id) s.user_id, s.status
    FROM public.subscriptions s
    ORDER BY s.user_id, s.created_at DESC
  )
  SELECT
    cca.id,
    cca.client_id,
    pp.first_name,
    pp.display_name,
    cs.status,
    cca.video_id,
    ev.title,
    cca.playlist_id,
    vpl.title,
    cca.note,
    cca.assigned_at,
    cca.due_by,
    CASE
      WHEN cca.video_id IS NOT NULL THEN EXISTS (
        SELECT 1 FROM public.video_progress vpr
        WHERE vpr.video_id = cca.video_id
          AND vpr.user_id  = cca.client_id
          AND vpr.completed_at IS NOT NULL
      )
      WHEN cca.playlist_id IS NOT NULL THEN
        NOT EXISTS (
          SELECT 1
          FROM public.playlist_videos pv2
          LEFT JOIN public.video_progress vpr
            ON vpr.video_id = pv2.video_id
            AND vpr.user_id = cca.client_id
            AND vpr.completed_at IS NOT NULL
          WHERE pv2.playlist_id = cca.playlist_id AND vpr.video_id IS NULL
        )
      ELSE false
    END
  FROM public.coach_content_assignments cca
  LEFT JOIN public.educational_videos ev  ON ev.id  = cca.video_id
  LEFT JOIN public.video_playlists vpl    ON vpl.id = cca.playlist_id
  LEFT JOIN public.profiles_public pp     ON pp.id  = cca.client_id
  LEFT JOIN client_status cs              ON cs.user_id = cca.client_id
  WHERE (cca.coach_id = v_user_id OR public.has_role(v_user_id, 'admin'))
  ORDER BY cca.assigned_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_coach_assignment_progress() TO authenticated;

COMMIT;
