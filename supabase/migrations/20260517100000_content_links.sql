BEGIN;

-- ========== 1. PROGRAM TEMPLATE CONTENT LINKS ==========
-- One row per (template, video|playlist). Shared across every active
-- client_program with this source_template_id.

CREATE TABLE IF NOT EXISTS public.program_template_content_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_template_id UUID NOT NULL REFERENCES public.program_templates(id) ON DELETE CASCADE,
  video_id    UUID REFERENCES public.educational_videos(id) ON DELETE CASCADE,
  playlist_id UUID REFERENCES public.video_playlists(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT false,
  note        TEXT NULL,
  added_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((video_id IS NULL) <> (playlist_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_ptcl_template ON public.program_template_content_links (program_template_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ptcl_video
  ON public.program_template_content_links (program_template_id, video_id)
  WHERE video_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ptcl_playlist
  ON public.program_template_content_links (program_template_id, playlist_id)
  WHERE playlist_id IS NOT NULL;

ALTER TABLE public.program_template_content_links ENABLE ROW LEVEL SECURITY;

-- Read: template owner OR admin OR a client whose ACTIVE client_programs row uses this template
CREATE POLICY "ptcl_select_owner_admin_assigned"
  ON public.program_template_content_links
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.program_templates pt
      WHERE pt.id = program_template_content_links.program_template_id
        AND pt.owner_coach_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.client_programs cp
      WHERE cp.user_id = auth.uid()
        AND cp.source_template_id = program_template_content_links.program_template_id
        AND cp.status = 'active'
    )
  );

-- Write: template owner OR admin
CREATE POLICY "ptcl_write_owner_admin"
  ON public.program_template_content_links
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.program_templates pt
      WHERE pt.id = program_template_content_links.program_template_id
        AND pt.owner_coach_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.program_templates pt
      WHERE pt.id = program_template_content_links.program_template_id
        AND pt.owner_coach_id = auth.uid()
    )
  );

REVOKE ALL ON public.program_template_content_links FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_template_content_links TO authenticated;

-- ========== 2. NUTRITION PHASE CONTENT LINKS ==========
-- Per-client. Phase row carries user_id + coach_id; we gate via it.

CREATE TABLE IF NOT EXISTS public.nutrition_phase_content_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nutrition_phase_id UUID NOT NULL REFERENCES public.nutrition_phases(id) ON DELETE CASCADE,
  video_id    UUID REFERENCES public.educational_videos(id) ON DELETE CASCADE,
  playlist_id UUID REFERENCES public.video_playlists(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT false,
  note        TEXT NULL,
  added_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((video_id IS NULL) <> (playlist_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_npcl_phase ON public.nutrition_phase_content_links (nutrition_phase_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_npcl_video
  ON public.nutrition_phase_content_links (nutrition_phase_id, video_id)
  WHERE video_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_npcl_playlist
  ON public.nutrition_phase_content_links (nutrition_phase_id, playlist_id)
  WHERE playlist_id IS NOT NULL;

ALTER TABLE public.nutrition_phase_content_links ENABLE ROW LEVEL SECURITY;

-- Client reads their own
CREATE POLICY "npcl_client_read_own"
  ON public.nutrition_phase_content_links
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.nutrition_phases np
      WHERE np.id = nutrition_phase_content_links.nutrition_phase_id
        AND np.user_id = auth.uid()
    )
  );

-- Primary coach manages
CREATE POLICY "npcl_primary_coach_manages"
  ON public.nutrition_phase_content_links
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.nutrition_phases np
      WHERE np.id = nutrition_phase_content_links.nutrition_phase_id
        AND public.is_primary_coach_for_user(auth.uid(), np.user_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.nutrition_phases np
      WHERE np.id = nutrition_phase_content_links.nutrition_phase_id
        AND public.is_primary_coach_for_user(auth.uid(), np.user_id)
    )
  );

-- Care team reads
CREATE POLICY "npcl_care_team_reads"
  ON public.nutrition_phase_content_links
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.nutrition_phases np
      WHERE np.id = nutrition_phase_content_links.nutrition_phase_id
        AND public.is_on_active_care_team_for_client(auth.uid(), np.user_id)
    )
  );

-- Admin all
CREATE POLICY "npcl_admin_all"
  ON public.nutrition_phase_content_links
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.nutrition_phase_content_links FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_phase_content_links TO authenticated;

-- ========== 3. RPC: get_my_program_linked_content() ==========
-- Returns video + playlist link rows for the caller's currently-active client_programs.

CREATE OR REPLACE FUNCTION public.get_my_program_linked_content()
RETURNS TABLE (
  link_id uuid,
  program_template_id uuid,
  program_template_title text,
  kind text,
  video_id uuid,
  playlist_id uuid,
  title text,
  description text,
  category text,
  is_pinned boolean,
  is_free_preview boolean,
  duration_seconds integer,
  thumbnail_url text,
  access_state text,
  is_completed boolean,
  is_required boolean,
  sort_order integer,
  note text
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
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  RETURN QUERY
  WITH active_templates AS (
    SELECT DISTINCT cp.source_template_id AS template_id
    FROM public.client_programs cp
    WHERE cp.user_id = v_user_id
      AND cp.status = 'active'
      AND cp.source_template_id IS NOT NULL
  ),
  -- Video link rows
  video_rows AS (
    SELECT
      ptcl.id           AS link_id,
      pt.id             AS program_template_id,
      pt.title          AS program_template_title,
      'video'::text     AS kind,
      ev.id             AS video_id,
      NULL::uuid        AS playlist_id,
      ev.title          AS title,
      CASE WHEN public.can_access_video(v_user_id, ev.id) THEN ev.description ELSE NULL END AS description,
      ev.category       AS category,
      ev.is_pinned      AS is_pinned,
      ev.is_free_preview AS is_free_preview,
      ev.duration_seconds AS duration_seconds,
      public.extract_video_thumbnail(ev.video_url, ev.video_type) AS thumbnail_url,
      CASE
        WHEN ev.is_free_preview THEN 'preview'::text
        WHEN public.can_access_video(v_user_id, ev.id) THEN 'unlocked'::text
        ELSE 'locked'::text
      END               AS access_state,
      EXISTS (
        SELECT 1 FROM public.video_progress vp
        WHERE vp.video_id = ev.id AND vp.user_id = v_user_id AND vp.completed_at IS NOT NULL
      )                 AS is_completed,
      ptcl.is_required  AS is_required,
      ptcl.sort_order   AS sort_order,
      ptcl.note         AS note
    FROM public.program_template_content_links ptcl
    JOIN active_templates at         ON at.template_id = ptcl.program_template_id
    JOIN public.program_templates pt ON pt.id = ptcl.program_template_id
    JOIN public.educational_videos ev ON ev.id = ptcl.video_id
    WHERE ev.is_active = true
  ),
  -- Playlist link rows (completion = all child active videos completed)
  playlist_rows AS (
    SELECT
      ptcl.id           AS link_id,
      pt.id             AS program_template_id,
      pt.title          AS program_template_title,
      'playlist'::text  AS kind,
      NULL::uuid        AS video_id,
      vpl.id            AS playlist_id,
      vpl.title         AS title,
      vpl.description   AS description,
      NULL::text        AS category,
      false             AS is_pinned,
      false             AS is_free_preview,
      NULL::integer     AS duration_seconds,
      NULL::text        AS thumbnail_url,
      'unlocked'::text  AS access_state,
      NOT EXISTS (
        SELECT 1
        FROM public.playlist_videos pv2
        JOIN public.educational_videos ev2 ON ev2.id = pv2.video_id AND ev2.is_active = true
        LEFT JOIN public.video_progress vpr
          ON vpr.video_id = pv2.video_id
          AND vpr.user_id  = v_user_id
          AND vpr.completed_at IS NOT NULL
        WHERE pv2.playlist_id = vpl.id AND vpr.video_id IS NULL
      )                 AS is_completed,
      ptcl.is_required  AS is_required,
      ptcl.sort_order   AS sort_order,
      ptcl.note         AS note
    FROM public.program_template_content_links ptcl
    JOIN active_templates at         ON at.template_id = ptcl.program_template_id
    JOIN public.program_templates pt ON pt.id = ptcl.program_template_id
    JOIN public.video_playlists vpl  ON vpl.id = ptcl.playlist_id
    WHERE vpl.is_active = true
  )
  SELECT * FROM video_rows
  UNION ALL
  SELECT * FROM playlist_rows
  ORDER BY 17 ASC, 7 ASC;  -- sort_order, title
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_program_linked_content() TO authenticated;

-- ========== 4. RPC: get_my_phase_linked_content() ==========
-- Returns video + playlist link rows for the caller's ACTIVE nutrition phase(s).
-- If multiple phases happen to be is_active=true, returns links from all of them;
-- the FE picks the current one.

CREATE OR REPLACE FUNCTION public.get_my_phase_linked_content()
RETURNS TABLE (
  link_id uuid,
  nutrition_phase_id uuid,
  phase_name text,
  kind text,
  video_id uuid,
  playlist_id uuid,
  title text,
  description text,
  category text,
  is_pinned boolean,
  is_free_preview boolean,
  duration_seconds integer,
  thumbnail_url text,
  access_state text,
  is_completed boolean,
  is_required boolean,
  sort_order integer,
  note text
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
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  RETURN QUERY
  WITH my_active_phases AS (
    SELECT np.id, np.phase_name
    FROM public.nutrition_phases np
    WHERE np.user_id = v_user_id AND np.is_active = true
  ),
  video_rows AS (
    SELECT
      npcl.id           AS link_id,
      map.id            AS nutrition_phase_id,
      map.phase_name    AS phase_name,
      'video'::text     AS kind,
      ev.id             AS video_id,
      NULL::uuid        AS playlist_id,
      ev.title          AS title,
      CASE WHEN public.can_access_video(v_user_id, ev.id) THEN ev.description ELSE NULL END AS description,
      ev.category       AS category,
      ev.is_pinned      AS is_pinned,
      ev.is_free_preview AS is_free_preview,
      ev.duration_seconds AS duration_seconds,
      public.extract_video_thumbnail(ev.video_url, ev.video_type) AS thumbnail_url,
      CASE
        WHEN ev.is_free_preview THEN 'preview'::text
        WHEN public.can_access_video(v_user_id, ev.id) THEN 'unlocked'::text
        ELSE 'locked'::text
      END               AS access_state,
      EXISTS (
        SELECT 1 FROM public.video_progress vp
        WHERE vp.video_id = ev.id AND vp.user_id = v_user_id AND vp.completed_at IS NOT NULL
      )                 AS is_completed,
      npcl.is_required  AS is_required,
      npcl.sort_order   AS sort_order,
      npcl.note         AS note
    FROM public.nutrition_phase_content_links npcl
    JOIN my_active_phases map ON map.id = npcl.nutrition_phase_id
    JOIN public.educational_videos ev ON ev.id = npcl.video_id
    WHERE ev.is_active = true
  ),
  playlist_rows AS (
    SELECT
      npcl.id           AS link_id,
      map.id            AS nutrition_phase_id,
      map.phase_name    AS phase_name,
      'playlist'::text  AS kind,
      NULL::uuid        AS video_id,
      vpl.id            AS playlist_id,
      vpl.title         AS title,
      vpl.description   AS description,
      NULL::text        AS category,
      false             AS is_pinned,
      false             AS is_free_preview,
      NULL::integer     AS duration_seconds,
      NULL::text        AS thumbnail_url,
      'unlocked'::text  AS access_state,
      NOT EXISTS (
        SELECT 1
        FROM public.playlist_videos pv2
        JOIN public.educational_videos ev2 ON ev2.id = pv2.video_id AND ev2.is_active = true
        LEFT JOIN public.video_progress vpr
          ON vpr.video_id = pv2.video_id
          AND vpr.user_id  = v_user_id
          AND vpr.completed_at IS NOT NULL
        WHERE pv2.playlist_id = vpl.id AND vpr.video_id IS NULL
      )                 AS is_completed,
      npcl.is_required  AS is_required,
      npcl.sort_order   AS sort_order,
      npcl.note         AS note
    FROM public.nutrition_phase_content_links npcl
    JOIN my_active_phases map ON map.id = npcl.nutrition_phase_id
    JOIN public.video_playlists vpl ON vpl.id = npcl.playlist_id
    WHERE vpl.is_active = true
  )
  SELECT * FROM video_rows
  UNION ALL
  SELECT * FROM playlist_rows
  ORDER BY 17 ASC, 7 ASC;  -- sort_order, title
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_phase_linked_content() TO authenticated;

-- ========== 5. Extend get_required_content_summary with link counts ==========
-- Drop+recreate (signature changes -- adds 4 columns).

DROP FUNCTION IF EXISTS public.get_required_content_summary();

CREATE FUNCTION public.get_required_content_summary()
RETURNS TABLE (
  required_total integer,
  required_pending integer,
  assigned_total integer,
  assigned_pending integer,
  program_linked_total integer,
  program_linked_pending integer,
  phase_linked_total integer,
  phase_linked_pending integer
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
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

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
             JOIN public.educational_videos ev2 ON ev2.id = pv2.video_id AND ev2.is_active = true
             LEFT JOIN public.video_progress vpr
               ON vpr.video_id = pv2.video_id
               AND vpr.user_id  = v_user_id
               AND vpr.completed_at IS NOT NULL
             WHERE pv2.playlist_id = cca.playlist_id AND vpr.video_id IS NULL
           ) AS done
    FROM public.coach_content_assignments cca
    WHERE cca.client_id = v_user_id AND cca.playlist_id IS NOT NULL
  ),
  active_templates AS (
    SELECT DISTINCT cp.source_template_id AS template_id
    FROM public.client_programs cp
    WHERE cp.user_id = v_user_id
      AND cp.status = 'active'
      AND cp.source_template_id IS NOT NULL
  ),
  program_videos AS (
    SELECT ptcl.id,
           EXISTS (
             SELECT 1 FROM public.video_progress vp
             WHERE vp.video_id = ptcl.video_id AND vp.user_id = v_user_id AND vp.completed_at IS NOT NULL
           ) AS done
    FROM public.program_template_content_links ptcl
    JOIN active_templates at ON at.template_id = ptcl.program_template_id
    WHERE ptcl.video_id IS NOT NULL
  ),
  program_playlists AS (
    SELECT ptcl.id,
           NOT EXISTS (
             SELECT 1
             FROM public.playlist_videos pv2
             JOIN public.educational_videos ev2 ON ev2.id = pv2.video_id AND ev2.is_active = true
             LEFT JOIN public.video_progress vpr
               ON vpr.video_id = pv2.video_id AND vpr.user_id = v_user_id AND vpr.completed_at IS NOT NULL
             WHERE pv2.playlist_id = ptcl.playlist_id AND vpr.video_id IS NULL
           ) AS done
    FROM public.program_template_content_links ptcl
    JOIN active_templates at ON at.template_id = ptcl.program_template_id
    WHERE ptcl.playlist_id IS NOT NULL
  ),
  active_phases AS (
    SELECT np.id FROM public.nutrition_phases np
    WHERE np.user_id = v_user_id AND np.is_active = true
  ),
  phase_videos AS (
    SELECT npcl.id,
           EXISTS (
             SELECT 1 FROM public.video_progress vp
             WHERE vp.video_id = npcl.video_id AND vp.user_id = v_user_id AND vp.completed_at IS NOT NULL
           ) AS done
    FROM public.nutrition_phase_content_links npcl
    JOIN active_phases ap ON ap.id = npcl.nutrition_phase_id
    WHERE npcl.video_id IS NOT NULL
  ),
  phase_playlists AS (
    SELECT npcl.id,
           NOT EXISTS (
             SELECT 1
             FROM public.playlist_videos pv2
             JOIN public.educational_videos ev2 ON ev2.id = pv2.video_id AND ev2.is_active = true
             LEFT JOIN public.video_progress vpr
               ON vpr.video_id = pv2.video_id AND vpr.user_id = v_user_id AND vpr.completed_at IS NOT NULL
             WHERE pv2.playlist_id = npcl.playlist_id AND vpr.video_id IS NULL
           ) AS done
    FROM public.nutrition_phase_content_links npcl
    JOIN active_phases ap ON ap.id = npcl.nutrition_phase_id
    WHERE npcl.playlist_id IS NOT NULL
  )
  SELECT
    (SELECT COUNT(*) FROM required)::integer,
    (SELECT COUNT(*) FROM required WHERE NOT done)::integer,
    ((SELECT COUNT(*) FROM assigned_videos) + (SELECT COUNT(*) FROM assigned_playlists))::integer,
    ((SELECT COUNT(*) FROM assigned_videos WHERE NOT done) + (SELECT COUNT(*) FROM assigned_playlists WHERE NOT done))::integer,
    ((SELECT COUNT(*) FROM program_videos) + (SELECT COUNT(*) FROM program_playlists))::integer,
    ((SELECT COUNT(*) FROM program_videos WHERE NOT done) + (SELECT COUNT(*) FROM program_playlists WHERE NOT done))::integer,
    ((SELECT COUNT(*) FROM phase_videos) + (SELECT COUNT(*) FROM phase_playlists))::integer,
    ((SELECT COUNT(*) FROM phase_videos WHERE NOT done) + (SELECT COUNT(*) FROM phase_playlists WHERE NOT done))::integer;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_required_content_summary() TO authenticated;

COMMIT;
