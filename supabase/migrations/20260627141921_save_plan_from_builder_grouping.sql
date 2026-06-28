-- Program system unification — P1 schema addendum: round-trip superset/circuit grouping
-- through save_plan_from_builder. See docs/PROGRAM_SYSTEM_UNIFICATION_BUILD_PLAN.md
-- "Planning Board v2 + prescription model". CREATE OR REPLACE of the P1 materializer
-- (20260627113619) — the only delta is the plan_slots grouping columns:
--   slot.groupId     -> plan_slots.group_id
--   slot.groupType   -> plan_slots.group_type   ('superset' | 'circuit' | NULL)
--   slot.groupRounds -> plan_slots.rounds       (bracket rounds; distinct from HIIT `rounds`)
-- The builder does not emit these yet (UI = P4) so they materialize NULL today; wiring the
-- reads now means P4 only adds builder fields, no re-migration.
--
-- Per-set instruction family (amrap / weight_mode / backoff / branches / note) needs NO
-- code change here: those fields live inside each setsDetail entry and are round-tripped
-- verbatim via prescription_json.setsDetail. Resolver math is P3 (WorkoutSessionV2).
CREATE OR REPLACE FUNCTION public.save_plan_from_builder(p_template_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid           uuid := auth.uid();
  v_owner         uuid;
  v_plan_id       uuid;
  v_week          jsonb;
  v_week_index    int;
  v_week_id       uuid;
  v_session       jsonb;
  v_session_id    uuid;
  v_slot          jsonb;
  v_rule_id       uuid;
  v_old_rule_ids  uuid[];
  v_session_map   jsonb;
  v_exercise_id   uuid;
  v_weeks_count   int := 0;
  v_sessions_count int := 0;
  v_slots_count   int := 0;
  v_rules_count   int := 0;
BEGIN
  SELECT coach_id INTO v_owner FROM public.muscle_program_templates WHERE id = p_template_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'template % not found', p_template_id USING ERRCODE = '42704';
  END IF;
  IF v_uid IS NULL OR (v_uid <> v_owner AND NOT public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'Not authorised to mirror template %', p_template_id USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_plan_id FROM public.plan WHERE source_muscle_template_id = p_template_id;
  IF v_plan_id IS NULL THEN
    INSERT INTO public.plan (owner_coach_id, name, description, kind, source_muscle_template_id)
    VALUES (v_owner,
            COALESCE(NULLIF(p_payload->>'name',''), 'Untitled Muscle Plan'),
            p_payload->>'description',
            'template',
            p_template_id)
    RETURNING id INTO v_plan_id;
  ELSE
    SELECT array_agg(progression_rule_id) INTO v_old_rule_ids
      FROM public.plan_slots
      WHERE plan_id = v_plan_id AND progression_rule_id IS NOT NULL;

    UPDATE public.plan
       SET name        = COALESCE(NULLIF(p_payload->>'name',''), 'Untitled Muscle Plan'),
           description = p_payload->>'description',
           owner_coach_id = v_owner,
           updated_at  = now()
     WHERE id = v_plan_id;

    DELETE FROM public.plan_weeks WHERE plan_id = v_plan_id;
    IF v_old_rule_ids IS NOT NULL THEN
      DELETE FROM public.progression_rules WHERE id = ANY(v_old_rule_ids);
    END IF;
  END IF;

  FOR v_week, v_week_index IN
    SELECT value, ordinality
      FROM jsonb_array_elements(COALESCE(p_payload->'weeks', '[]'::jsonb)) WITH ORDINALITY
  LOOP
    INSERT INTO public.plan_weeks (plan_id, week_index, label, is_deload, deload_preset_id)
    VALUES (v_plan_id,
            v_week_index,
            v_week->>'label',
            COALESCE((v_week->>'isDeload')::boolean, false),
            v_week->>'deloadPresetId')
    RETURNING id INTO v_week_id;
    v_weeks_count := v_weeks_count + 1;

    v_session_map := '{}'::jsonb;
    FOR v_session IN
      SELECT value FROM jsonb_array_elements(COALESCE(v_week->'sessions', '[]'::jsonb))
    LOOP
      INSERT INTO public.plan_sessions (plan_id, plan_week_id, day_index, name, activity_type, sort_order)
      VALUES (v_plan_id,
              v_week_id,
              COALESCE((v_session->>'dayIndex')::int, 1),
              v_session->>'name',
              COALESCE(NULLIF(v_session->>'type',''), 'strength'),
              COALESCE((v_session->>'sortOrder')::int, 0))
      RETURNING id INTO v_session_id;
      v_session_map := v_session_map || jsonb_build_object(v_session->>'id', v_session_id::text);
      v_sessions_count := v_sessions_count + 1;
    END LOOP;

    FOR v_slot IN
      SELECT value FROM jsonb_array_elements(COALESCE(v_week->'slots', '[]'::jsonb))
    LOOP
      v_session_id := NULLIF(v_session_map->>(v_slot->>'sessionId'), '')::uuid;
      IF v_session_id IS NULL THEN
        CONTINUE;
      END IF;

      v_exercise_id := NULL;
      IF (v_slot->'exercise'->>'exerciseId') IS NOT NULL THEN
        SELECT id INTO v_exercise_id
          FROM public.exercise_library
          WHERE id = (v_slot->'exercise'->>'exerciseId')::uuid;
      END IF;

      v_rule_id := NULL;
      IF v_week_index = 1
         AND jsonb_typeof(v_slot->'deltaRules') = 'array'
         AND jsonb_array_length(v_slot->'deltaRules') > 0 THEN
        INSERT INTO public.progression_rules (owner_coach_id, name, scope, rule_json)
        VALUES (v_owner, NULL, 'slot', v_slot->'deltaRules')
        RETURNING id INTO v_rule_id;
        v_rules_count := v_rules_count + 1;
      END IF;

      INSERT INTO public.plan_slots (
        plan_id, plan_session_id, exercise_id, activity_id, activity_name,
        section, sort_order, prescription_json, progression_rule_id, manual_override, instructions,
        group_id, group_type, rounds
      ) VALUES (
        v_plan_id,
        v_session_id,
        v_exercise_id,
        v_slot->>'activityId',
        v_slot->>'activityName',
        'main',
        COALESCE((v_slot->>'sortOrder')::int, 0),
        jsonb_strip_nulls(jsonb_build_object(
          'muscleId',       v_slot->>'muscleId',
          'sets',           v_slot->'sets',
          'repMin',         v_slot->'repMin',
          'repMax',         v_slot->'repMax',
          'tempo',          v_slot->'tempo',
          'rir',            v_slot->'rir',
          'rpe',            v_slot->'rpe',
          'setsDetail',     v_slot->'setsDetail',
          'columns',        COALESCE(v_slot->'prescriptionColumns', p_payload->'globalPrescriptionColumns'),
          'clientInputs',   COALESCE(v_slot->'clientInputColumns', p_payload->'globalClientInputs'),
          'exerciseName',   v_slot->'exercise'->>'name',
          'replacements',   v_slot->'replacements',
          'manualOverrides', v_slot->'manualOverrides',
          'activityType',   v_slot->>'activityType',
          'duration',       v_slot->'duration',
          'distance',       v_slot->'distance',
          'targetHrZone',   v_slot->'targetHrZone',
          'pace',           v_slot->'pace',
          'rounds',         v_slot->'rounds',
          'workSeconds',    v_slot->'workSeconds',
          'restSeconds',    v_slot->'restSeconds',
          'difficulty',     v_slot->'difficulty',
          'activityNotes',  v_slot->'activityNotes'
        )),
        v_rule_id,
        CASE WHEN jsonb_typeof(v_slot->'manualOverrides') = 'array'
             THEN jsonb_array_length(v_slot->'manualOverrides') > 0
             ELSE false END,
        COALESCE(v_slot->'exercise'->>'instructions', v_slot->>'activityNotes'),
        NULLIF(v_slot->>'groupId', '')::uuid,
        NULLIF(v_slot->>'groupType', ''),
        (v_slot->>'groupRounds')::int
      );
      v_slots_count := v_slots_count + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'plan_id',  v_plan_id,
    'weeks',    v_weeks_count,
    'sessions', v_sessions_count,
    'slots',    v_slots_count,
    'rules',    v_rules_count
  );
END;
$function$;
