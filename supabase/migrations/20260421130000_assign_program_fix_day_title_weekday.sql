-- ============================================================
-- assign_program_to_client: recompute client_program_days.title using
-- the actual scheduled weekday.
--
-- Previously the client_program_days.title was copied verbatim from the
-- template's program_template_days.day_title, which is formatted as
-- `<TemplateWeekday> — <content>` by convert_muscle_plan_to_program_v2
-- (e.g. "Mon — Push"). That weekday is the template's creation-time
-- ordinal, not the actual scheduled weekday after assignment.
--
-- Repro: assign a template with day_index=1 (built as Mon) on a Tuesday
--   → client dashboard shows "Mon — Strength" on a Tuesday.
--
-- Fix: strip any 3-letter weekday prefix followed by " — " or " - "
-- from v_day.day_title and replace with the weekday of the actual
-- v_day_date. If no prefix found, prepend the real weekday.
-- Everything else about assign_program_to_client is unchanged.
-- ============================================================

CREATE OR REPLACE FUNCTION public.assign_program_to_client(
  p_coach_id UUID,
  p_client_id UUID,
  p_subscription_id UUID,
  p_template_id UUID,
  p_start_date DATE,
  p_team_id UUID DEFAULT NULL,
  p_macrocycle_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_program_id UUID;
  v_template RECORD;
  v_day RECORD;
  v_client_day_id UUID;
  v_day_date DATE;
  v_module RECORD;
  v_client_module_id UUID;
  v_exercise RECORD;
  v_prescription RECORD;
  v_care_member RECORD;
  v_max_sort_order INT;
  v_existing_module_count INT;
  v_total_days INT := 0;
  v_total_modules INT := 0;
  v_total_exercises INT := 0;
  v_day_names TEXT[] := ARRAY['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  v_actual_weekday TEXT;
  v_title_body TEXT;
  v_final_title TEXT;
BEGIN
  SELECT id, title INTO v_template
  FROM program_templates
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Program template not found: %', p_template_id;
  END IF;

  INSERT INTO client_programs (
    user_id, subscription_id, primary_coach_id, source_template_id,
    start_date, status, team_id, macrocycle_id
  ) VALUES (
    p_client_id, p_subscription_id, p_coach_id, p_template_id,
    p_start_date, 'active', p_team_id, p_macrocycle_id
  )
  RETURNING id INTO v_client_program_id;

  FOR v_day IN
    SELECT id, day_index, day_title
    FROM program_template_days
    WHERE program_template_id = p_template_id
    ORDER BY day_index
  LOOP
    v_day_date := p_start_date + (v_day.day_index - 1);
    v_max_sort_order := 0;

    -- Derive weekday from v_day_date. extract(dow) is 0=Sun..6=Sat;
    -- array is 1-indexed so +1.
    v_actual_weekday := v_day_names[EXTRACT(DOW FROM v_day_date)::int + 1];

    -- Strip any template weekday prefix ("Mon — ", "Tue - ", etc.) so we
    -- don't end up with duplicated/mismatched weekdays in the client
    -- title. Regex covers all 7 abbreviations + unicode em-dash and ASCII
    -- hyphen separators with optional spaces.
    v_title_body := regexp_replace(
      COALESCE(v_day.day_title, ''),
      '^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*[—-]\s*',
      '',
      'i'
    );

    IF v_title_body = '' THEN
      v_final_title := v_actual_weekday;
    ELSE
      v_final_title := v_actual_weekday || ' — ' || v_title_body;
    END IF;

    INSERT INTO client_program_days (
      client_program_id, day_index, title, date
    ) VALUES (
      v_client_program_id, v_day.day_index, v_final_title, v_day_date
    )
    RETURNING id INTO v_client_day_id;

    v_total_days := v_total_days + 1;

    FOR v_module IN
      SELECT *
      FROM day_modules
      WHERE program_template_day_id = v_day.id
        AND status = 'published'
      ORDER BY sort_order
    LOOP
      INSERT INTO client_day_modules (
        client_program_day_id, source_day_module_id, module_owner_coach_id,
        module_type, session_type, session_timing, title, sort_order, status
      ) VALUES (
        v_client_day_id, v_module.id, v_module.module_owner_coach_id,
        v_module.module_type, v_module.session_type, v_module.session_timing,
        v_module.title, v_module.sort_order, 'scheduled'
      )
      RETURNING id INTO v_client_module_id;

      v_total_modules := v_total_modules + 1;
      v_max_sort_order := GREATEST(v_max_sort_order, v_module.sort_order);

      FOR v_exercise IN
        SELECT me.*
        FROM module_exercises me
        WHERE me.day_module_id = v_module.id
        ORDER BY me.sort_order
      LOOP
        SELECT * INTO v_prescription
        FROM exercise_prescriptions
        WHERE module_exercise_id = v_exercise.id
        LIMIT 1;

        INSERT INTO client_module_exercises (
          client_day_module_id, exercise_id, section, sort_order,
          instructions, prescription_snapshot_json
        ) VALUES (
          v_client_module_id, v_exercise.exercise_id, v_exercise.section,
          v_exercise.sort_order, v_exercise.instructions,
          CASE WHEN v_prescription.id IS NOT NULL THEN
            jsonb_build_object(
              'set_count', v_prescription.set_count,
              'rep_range_min', v_prescription.rep_range_min,
              'rep_range_max', v_prescription.rep_range_max,
              'tempo', v_prescription.tempo,
              'rest_seconds', v_prescription.rest_seconds,
              'intensity_type', v_prescription.intensity_type,
              'intensity_value', v_prescription.intensity_value,
              'warmup_sets_json', v_prescription.warmup_sets_json,
              'custom_fields_json', v_prescription.custom_fields_json,
              'progression_notes', v_prescription.progression_notes,
              'sets_json', COALESCE(v_prescription.sets_json, 'null'::jsonb),
              'column_config', COALESCE(v_prescription.column_config, '[]'::jsonb),
              'linear_progression_enabled', COALESCE(v_prescription.linear_progression_enabled, false),
              'progression_config', COALESCE(v_prescription.progression_config, 'null'::jsonb)
            )
          ELSE '{}'::jsonb
          END
        );

        v_total_exercises := v_total_exercises + 1;
      END LOOP;

      INSERT INTO module_threads (client_day_module_id)
      VALUES (v_client_module_id);
    END LOOP;

    FOR v_care_member IN
      SELECT staff_user_id, specialty
      FROM care_team_assignments
      WHERE subscription_id = p_subscription_id
        AND lifecycle_status IN ('active', 'scheduled_end')
        AND active_from <= v_day_date
        AND (active_until IS NULL OR active_until >= v_day_date)
    LOOP
      SELECT COUNT(*) INTO v_existing_module_count
      FROM day_modules
      WHERE program_template_day_id = v_day.id
        AND status = 'published'
        AND module_owner_coach_id = v_care_member.staff_user_id
        AND module_type = v_care_member.specialty;

      IF v_existing_module_count = 0 THEN
        v_max_sort_order := v_max_sort_order + 1;

        INSERT INTO client_day_modules (
          client_program_day_id, module_owner_coach_id, module_type,
          title, sort_order, status
        ) VALUES (
          v_client_day_id, v_care_member.staff_user_id, v_care_member.specialty,
          initcap(v_care_member.specialty) || ' Session',
          v_max_sort_order, 'scheduled'
        );

        v_total_modules := v_total_modules + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'client_program_id', v_client_program_id,
    'total_days', v_total_days,
    'total_modules', v_total_modules,
    'total_exercises', v_total_exercises
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_program_to_client TO authenticated;
