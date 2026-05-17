-- PR F: required viewing flag + coach content assignments + summary RPCs.
-- Closes docs/EDUCATIONAL_CONTENT_REVIEW.md.

BEGIN;

-- 1. Required-for-role flag.
ALTER TABLE public.educational_videos
  ADD COLUMN IF NOT EXISTS required_for_role TEXT NULL
  CHECK (required_for_role IS NULL OR required_for_role IN ('client', 'coach', 'all'));

COMMENT ON COLUMN public.educational_videos.required_for_role IS
  'NULL = not required. ''client'' = required for clients. ''coach'' = required for active coaches (ongoing CE, distinct from coach_educational_content onboarding). ''all'' = required for both.';

CREATE INDEX IF NOT EXISTS idx_educational_videos_required_for_role
  ON public.educational_videos (required_for_role)
  WHERE required_for_role IS NOT NULL;

-- 2. Coach-curated content assignments.
CREATE TABLE IF NOT EXISTS public.coach_content_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id   UUID REFERENCES public.educational_videos(id) ON DELETE CASCADE,
  playlist_id UUID REFERENCES public.video_playlists(id) ON DELETE CASCADE,
  note       TEXT NULL,
  due_by     TIMESTAMPTZ NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((video_id IS NULL) <> (playlist_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_coach_content_assignments_client ON public.coach_content_assignments (client_id);
CREATE INDEX IF NOT EXISTS idx_coach_content_assignments_coach  ON public.coach_content_assignments (coach_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_coach_content_assignments_video
  ON public.coach_content_assignments (coach_id, client_id, video_id)
  WHERE video_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_coach_content_assignments_playlist
  ON public.coach_content_assignments (coach_id, client_id, playlist_id)
  WHERE playlist_id IS NOT NULL;

ALTER TABLE public.coach_content_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_read_own_assignments"
  ON public.coach_content_assignments
  FOR SELECT TO authenticated
  USING (client_id = auth.uid());

CREATE POLICY "primary_coach_manages_assignments"
  ON public.coach_content_assignments
  FOR ALL TO authenticated
  USING (
    coach_id = auth.uid()
    AND public.is_primary_coach_for_user(auth.uid(), client_id)
  )
  WITH CHECK (
    coach_id = auth.uid()
    AND public.is_primary_coach_for_user(auth.uid(), client_id)
  );

CREATE POLICY "care_team_reads_assignments"
  ON public.coach_content_assignments
  FOR SELECT TO authenticated
  USING (public.is_on_active_care_team_for_client(auth.uid(), client_id));

CREATE POLICY "admin_manages_all_assignments"
  ON public.coach_content_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.coach_content_assignments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_content_assignments TO authenticated;

-- 3. Drop+recreate get_educational_videos_with_access -- add is_required, is_assigned_by_coach, prerequisite_title.
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
  last_accessed_at timestamptz,
  is_required boolean,
  is_assigned_by_coach boolean,
  prerequisite_title text
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
  WITH user_access AS (
    SELECT val.video_id, MAX(val.created_at) AS last_accessed_at
    FROM public.video_access_log val
    WHERE val.user_id = v_user_id AND val.access_granted = true
    GROUP BY val.video_id
  ),
  my_assignments AS (
    SELECT cca.video_id
    FROM public.coach_content_assignments cca
    WHERE cca.client_id = v_user_id AND cca.video_id IS NOT NULL
  )
  SELECT
    ev.id,
    ev.title,
    CASE WHEN public.can_access_video(v_user_id, ev.id) THEN ev.description ELSE NULL END,
    ev.category,
    ev.is_pinned,
    ev.is_free_preview,
    ev.duration_seconds,
    public.extract_video_thumbnail(ev.video_url, ev.video_type),
    ev.created_at,
    CASE
      WHEN ev.is_free_preview THEN 'preview'::text
      WHEN public.can_access_video(v_user_id, ev.id) THEN 'unlocked'::text
      ELSE 'locked'::text
    END,
    EXISTS (
      SELECT 1 FROM public.video_progress vp
      WHERE vp.video_id = ev.id AND vp.user_id = v_user_id AND vp.completed_at IS NOT NULL
    ),
    ua.last_accessed_at,
    (
      ev.required_for_role IS NOT NULL
      AND (ev.required_for_role = 'all' OR ev.required_for_role = v_user_role)
    ),
    EXISTS (SELECT 1 FROM my_assignments a WHERE a.video_id = ev.id),
    CASE
      WHEN NOT public.can_access_video(v_user_id, ev.id) AND ev.prerequisite_video_id IS NOT NULL
        THEN (SELECT pre.title FROM public.educational_videos pre WHERE pre.id = ev.prerequisite_video_id)
      ELSE NULL
    END
  FROM public.educational_videos ev
  LEFT JOIN user_access ua ON ua.video_id = ev.id
  WHERE ev.is_active = true
  ORDER BY ev.is_pinned DESC, ev.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_educational_videos_with_access() TO authenticated;

-- 4. Required-content summary for the dashboard banner.
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
  assigned AS (
    SELECT cca.video_id AS id,
           EXISTS (
             SELECT 1 FROM public.video_progress vp
             WHERE vp.video_id = cca.video_id AND vp.user_id = v_user_id AND vp.completed_at IS NOT NULL
           ) AS done
    FROM public.coach_content_assignments cca
    WHERE cca.client_id = v_user_id AND cca.video_id IS NOT NULL
  )
  SELECT
    (SELECT COUNT(*) FROM required)::integer,
    (SELECT COUNT(*) FROM required WHERE NOT done)::integer,
    (SELECT COUNT(*) FROM assigned)::integer,
    (SELECT COUNT(*) FROM assigned WHERE NOT done)::integer;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_required_content_summary() TO authenticated;

-- 5. Coach's clients (for assignment dialog).
CREATE OR REPLACE FUNCTION public.get_my_assignable_clients()
RETURNS TABLE (
  client_id uuid,
  first_name text,
  display_name text
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
  SELECT DISTINCT s.user_id, pp.first_name, pp.display_name
  FROM public.subscriptions s
  LEFT JOIN public.profiles_public pp ON pp.id = s.user_id
  WHERE s.status = 'active'
    AND (
      s.coach_id = v_user_id
      OR public.has_role(v_user_id, 'admin')
    )
  ORDER BY pp.first_name NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_assignable_clients() TO authenticated;

-- 6. Coach's assignment progress overview.
CREATE OR REPLACE FUNCTION public.get_coach_assignment_progress()
RETURNS TABLE (
  assignment_id uuid,
  client_id uuid,
  client_first_name text,
  client_display_name text,
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
  SELECT
    cca.id,
    cca.client_id,
    pp.first_name,
    pp.display_name,
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
        WHERE vpr.video_id = cca.video_id AND vpr.user_id = cca.client_id AND vpr.completed_at IS NOT NULL
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
  WHERE (cca.coach_id = v_user_id OR public.has_role(v_user_id, 'admin'))
  ORDER BY cca.assigned_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_coach_assignment_progress() TO authenticated;

COMMIT;
