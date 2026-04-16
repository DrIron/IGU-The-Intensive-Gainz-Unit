-- ============================================================
-- Update batch conversion RPC to handle multi-week mesocycles
-- Day indices > 7 represent week 2+ (8-14 = W2, 15-21 = W3, etc.)
-- ============================================================

CREATE OR REPLACE FUNCTION convert_muscle_plan_to_program(
  p_coach_id UUID,
  p_plan_name TEXT,
  p_plan_description TEXT,
  p_muscle_template_id UUID DEFAULT NULL,
  p_day_slots JSONB DEFAULT '[]'::jsonb
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
  v_slot JSONB;
  v_slot_index INT;
  v_day_index INT;
  v_muscle_names TEXT;
  v_total_modules INT := 0;
  v_total_days INT := 0;
BEGIN
  -- 1. Create program template
  INSERT INTO program_templates (owner_coach_id, title, description, visibility)
  VALUES (p_coach_id, p_plan_name, p_plan_description, 'private')
  RETURNING id INTO v_program_id;

  -- 2. Group slots by dayIndex and create days + modules
  FOR v_day_record IN
    SELECT
      (elem->>'dayIndex')::int AS day_index,
      jsonb_agg(elem ORDER BY (elem->>'sortOrder')::int) AS slots
    FROM jsonb_array_elements(p_day_slots) AS elem
    GROUP BY (elem->>'dayIndex')::int
    ORDER BY (elem->>'dayIndex')::int
  LOOP
    SELECT string_agg(s->>'muscleLabel', ', ' ORDER BY (s->>'sortOrder')::int)
    INTO v_muscle_names
    FROM jsonb_array_elements(v_day_record.slots) AS s;

    DECLARE
      v_day_names TEXT[] := ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      v_day_label TEXT;
      v_day_of_week INT;
      v_week_num INT;
    BEGIN
      v_day_of_week := ((v_day_record.day_index - 1) % 7) + 1;
      v_week_num := ((v_day_record.day_index - 1) / 7) + 1;
      v_day_label := v_day_names[v_day_of_week];

      INSERT INTO program_template_days (program_template_id, day_index, day_title)
      VALUES (v_program_id, v_day_record.day_index, v_day_label || ' — ' || v_muscle_names)
      RETURNING id INTO v_day_id;
    END;

    v_total_days := v_total_days + 1;

    v_slot_index := 0;
    FOR v_slot IN SELECT * FROM jsonb_array_elements(v_day_record.slots)
    LOOP
      INSERT INTO day_modules (
        program_template_day_id,
        module_owner_coach_id,
        module_type,
        session_type,
        session_timing,
        title,
        sort_order,
        status,
        source_muscle_id
      ) VALUES (
        v_day_id,
        p_coach_id,
        'strength',
        'strength',
        'anytime',
        (v_slot->>'muscleLabel') || ' — ' || (v_slot->>'sets') || ' sets',
        v_slot_index,
        'draft',
        v_slot->>'muscleId'
      );

      v_total_modules := v_total_modules + 1;
      v_slot_index := v_slot_index + 1;
    END LOOP;
  END LOOP;

  -- 3. Link muscle template to created program
  IF p_muscle_template_id IS NOT NULL THEN
    UPDATE muscle_program_templates
    SET converted_program_id = v_program_id
    WHERE id = p_muscle_template_id AND coach_id = p_coach_id;
  END IF;

  RETURN jsonb_build_object(
    'program_id', v_program_id,
    'total_days', v_total_days,
    'total_modules', v_total_modules
  );
END;
$$;

GRANT EXECUTE ON FUNCTION convert_muscle_plan_to_program TO authenticated;
