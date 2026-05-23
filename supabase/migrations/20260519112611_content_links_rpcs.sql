BEGIN;

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

COMMIT;
