-- Program system unification — P1: materialize a Planning Board save into the
-- canonical plan* model. See docs/PROGRAM_SYSTEM_UNIFICATION_BUILD_PLAN.md §P1.
--
-- This is a MIRROR used during the soak: muscle_program_templates.slot_config stays
-- authoritative. The hook calls this fire-and-forget AFTER the slot_config write, so a
-- failure here is a stale mirror, not data loss.
--
-- Strategy: upsert ONE `plan` keyed by plan.source_muscle_template_id = p_template_id
-- (kind='template' — there is no 'meso' kind; CHECK is ('template','client_frozen')),
-- then delete-and-recreate all children (plan_weeks cascade plan_sessions + plan_slots),
-- plus the progression_rules this plan's W1 slots referenced.
--
-- Payload shape (the serialized builder state):
--   { name, description, weeks: WeekData[], globalClientInputs[], globalPrescriptionColumns[] }
--   WeekData = { label?, isDeload?, sessions: SessionData[], slots: MuscleSlotData[] }
-- Mapping (architecture §P1):
--   WeekData    -> plan_weeks    (week_index = array ordinality, label, is_deload)
--   SessionData -> plan_sessions (day_index, name, activity_type = type, sort_order)
--   MuscleSlotData -> plan_slots (exercise_id, activity_id/name, prescription_json bundle,
--                                 manual_override, instructions; section defaults 'main')
--   W1 slot.deltaRules -> progression_rules (scope 'slot') referenced by plan_slots.progression_rule_id
-- prescription_json keeps everything the canonical row needs to be self-describing:
--   sets/repMin/repMax/tempo/rir/rpe/setsDetail, effective columns + clientInputs
--   (per-slot override else the payload globals), muscleId, exerciseName, replacements,
--   manualOverrides, and the non-strength activity fields.
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
  -- Authorization: caller must own the source muscle template (or be admin).
  SELECT coach_id INTO v_owner FROM public.muscle_program_templates WHERE id = p_template_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'template % not found', p_template_id USING ERRCODE = '42704';
  END IF;
  IF v_uid IS NULL OR (v_uid <> v_owner AND NOT public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'Not authorised to mirror template %', p_template_id USING ERRCODE = '42501';
  END IF;

  -- Upsert the plan keyed by source_muscle_template_id.
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
    -- Collect the rule ids this plan referenced so we can delete them after the
    -- children are gone (progression_rules has no plan_id link; clean up by reference).
    SELECT array_agg(progression_rule_id) INTO v_old_rule_ids
      FROM public.plan_slots
      WHERE plan_id = v_plan_id AND progression_rule_id IS NOT NULL;

    UPDATE public.plan
       SET name        = COALESCE(NULLIF(p_payload->>'name',''), 'Untitled Muscle Plan'),
           description = p_payload->>'description',
           owner_coach_id = v_owner,
           updated_at  = now()
     WHERE id = v_plan_id;

    DELETE FROM public.plan_weeks WHERE plan_id = v_plan_id;  -- cascades sessions + slots
    IF v_old_rule_ids IS NOT NULL THEN
      DELETE FROM public.progression_rules WHERE id = ANY(v_old_rule_ids);
    END IF;
  END IF;

  -- Recreate children, week by week.
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

    -- Map the client-side session ids -> the new plan_session ids (per week).
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

    -- Slots — bound to their session via the map.
    FOR v_slot IN
      SELECT value FROM jsonb_array_elements(COALESCE(v_week->'slots', '[]'::jsonb))
    LOOP
      v_session_id := NULLIF(v_session_map->>(v_slot->>'sessionId'), '')::uuid;
      IF v_session_id IS NULL THEN
        CONTINUE;  -- orphan slot (no matching session in this week) — skip in the mirror
      END IF;

      -- Resolve exercise_id defensively (FK to exercise_library); keep the name in
      -- prescription_json regardless so a stale/unknown id never fails the mirror.
      v_exercise_id := NULL;
      IF (v_slot->'exercise'->>'exerciseId') IS NOT NULL THEN
        SELECT id INTO v_exercise_id
          FROM public.exercise_library
          WHERE id = (v_slot->'exercise'->>'exerciseId')::uuid;
      END IF;

      -- W1 delta rules -> a reusable progression_rules row referenced by this slot.
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
        section, sort_order, prescription_json, progression_rule_id, manual_override, instructions
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
        COALESCE(v_slot->'exercise'->>'instructions', v_slot->>'activityNotes')
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
