BEGIN;

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
