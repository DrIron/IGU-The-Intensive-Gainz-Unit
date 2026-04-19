-- ============================================================
-- convert_muscle_plan_to_program_v2 — session-aware conversion
--
-- Planning Board now groups activities into coach-defined sessions
-- (1 session = 1 day_module). The legacy v1 RPC created one module per
-- muscle slot which produced fragmented client workouts.
--
-- v2 takes sessions (one module per session) and returns a map from the
-- coach-side session id to the created day_module id, so the client can
-- insert module_exercises (one per slot) under the correct module.
-- ============================================================

CREATE OR REPLACE FUNCTION convert_muscle_plan_to_program_v2(
  p_coach_id UUID,
  p_plan_name TEXT,
  p_plan_description TEXT,
  p_muscle_template_id UUID DEFAULT NULL,
  p_sessions JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program_id UUID;
  v_day_record RECORD;
  v_day_id UUID;
  v_session JSONB;
  v_session_type TEXT;
  v_session_title TEXT;
  v_day_module_id UUID;
  v_total_modules INT := 0;
  v_total_days INT := 0;
  v_session_to_module JSONB := '{}'::jsonb;
  v_day_names TEXT[] := ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  v_day_of_week INT;
  v_day_title_titles TEXT;
  v_sort_idx INT;
BEGIN
  -- 1. Program shell
  INSERT INTO program_templates (owner_coach_id, title, description, visibility)
  VALUES (p_coach_id, p_plan_name, p_plan_description, 'private')
  RETURNING id INTO v_program_id;

  -- 2. Group sessions by dayIndex and create one program_template_day per used day.
  --    Absolute dayIndex covers multi-week mesocycles (W1=1-7, W2=8-14...).
  FOR v_day_record IN
    SELECT
      (elem->>'dayIndex')::int AS day_index,
      jsonb_agg(elem ORDER BY (elem->>'sortOrder')::int) AS sessions
    FROM jsonb_array_elements(p_sessions) AS elem
    GROUP BY (elem->>'dayIndex')::int
    ORDER BY (elem->>'dayIndex')::int
  LOOP
    v_day_of_week := ((v_day_record.day_index - 1) % 7) + 1;

    -- Day title: concatenate session names (or types) separated by " + ".
    SELECT string_agg(
      COALESCE(NULLIF(TRIM(s->>'name'), ''), INITCAP(s->>'type')),
      ' + '
      ORDER BY (s->>'sortOrder')::int
    )
    INTO v_day_title_titles
    FROM jsonb_array_elements(v_day_record.sessions) AS s;

    INSERT INTO program_template_days (program_template_id, day_index, day_title)
    VALUES (
      v_program_id,
      v_day_record.day_index,
      v_day_names[v_day_of_week] || ' — ' || COALESCE(v_day_title_titles, 'Session')
    )
    RETURNING id INTO v_day_id;

    v_total_days := v_total_days + 1;

    -- 3. One day_module per session. session_type maps directly from the
    --    session's activity type (strength/cardio/hiit/yoga_mobility/
    --    recovery/sport_specific). yoga_mobility collapses to 'mobility'
    --    to match the existing `session_type` enum used elsewhere.
    v_sort_idx := 0;
    FOR v_session IN SELECT * FROM jsonb_array_elements(v_day_record.sessions)
    LOOP
      v_session_type := CASE v_session->>'type'
        WHEN 'yoga_mobility' THEN 'mobility'
        WHEN 'sport_specific' THEN 'sport_specific'
        ELSE v_session->>'type'
      END;

      v_session_title := COALESCE(
        NULLIF(TRIM(v_session->>'name'), ''),
        INITCAP(v_session->>'type')
      );

      INSERT INTO day_modules (
        program_template_day_id,
        module_owner_coach_id,
        module_type,
        session_type,
        session_timing,
        title,
        sort_order,
        status
      ) VALUES (
        v_day_id,
        p_coach_id,
        'strength',
        v_session_type,
        'anytime',
        v_session_title,
        v_sort_idx,
        'draft'
      )
      RETURNING id INTO v_day_module_id;

      v_session_to_module := v_session_to_module
        || jsonb_build_object(v_session->>'id', v_day_module_id::text);

      v_total_modules := v_total_modules + 1;
      v_sort_idx := v_sort_idx + 1;
    END LOOP;
  END LOOP;

  -- 4. Link source muscle plan → converted program (for "Open program" UX).
  IF p_muscle_template_id IS NOT NULL THEN
    UPDATE muscle_program_templates
    SET converted_program_id = v_program_id
    WHERE id = p_muscle_template_id AND coach_id = p_coach_id;
  END IF;

  RETURN jsonb_build_object(
    'program_id', v_program_id,
    'total_days', v_total_days,
    'total_modules', v_total_modules,
    'session_to_module', v_session_to_module
  );
END;
$$;

GRANT EXECUTE ON FUNCTION convert_muscle_plan_to_program_v2 TO authenticated;
