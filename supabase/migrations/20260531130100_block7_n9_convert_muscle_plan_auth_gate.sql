-- B7-N9: add authorization gate to convert_muscle_plan_to_program_v2.
--
-- This SECURITY DEFINER RPC is GRANT EXECUTE TO authenticated and previously had
-- ZERO authorization checks in its body. It accepts p_coach_id from the client, so
-- a malicious authenticated user could create program_templates rows owned by
-- another coach. Lower blast radius than B7-N3 (no client data written) but the
-- same defense-in-depth pattern.
--
-- Body below is copied VERBATIM from the live prod definition
-- (pg_get_functiondef, project ghotrbotrywonaejlppg, 2026-05-31). The ONLY change
-- is the auth gate prepended immediately after BEGIN.
--
-- Gate: caller must be p_coach_id, OR admin. ERRCODE 42501 (insufficient_privilege)
-- so the FE error matches Postgres' RLS-denial convention.

CREATE OR REPLACE FUNCTION public.convert_muscle_plan_to_program_v2(p_coach_id uuid, p_plan_name text, p_plan_description text, p_muscle_template_id uuid DEFAULT NULL::uuid, p_sessions jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- B7-N9 auth gate (defense-in-depth; FE callsites also gate).
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() <> p_coach_id AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

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
$function$;
