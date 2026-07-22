CREATE OR REPLACE FUNCTION public.save_template_plan(p_plan_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid; v_kind text; v_plan_id uuid;
  v_week jsonb; v_week_index int; v_week_id uuid;
  v_session jsonb; v_session_bid text; v_session_id uuid;
  v_slot jsonb; v_slot_bid text; v_slot_id uuid;
  v_rule_id uuid; v_exercise_id uuid; v_old_rule_ids uuid[];
  v_seen_week_idx int[] := '{}'; v_seen_session uuid[] := '{}'; v_seen_slot uuid[] := '{}';
  v_session_map jsonb := '{}'::jsonb;
  v_weeks_count int := 0; v_sessions_count int := 0; v_slots_count int := 0; v_rules_count int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  IF p_plan_id IS NULL THEN
    INSERT INTO public.plan (owner_coach_id, name, description, kind)
    VALUES (v_uid, COALESCE(NULLIF(p_payload->>'name',''),'Untitled Template'), p_payload->>'description','template')
    RETURNING id, owner_coach_id INTO v_plan_id, v_owner;
  ELSE
    SELECT owner_coach_id, kind INTO v_owner, v_kind FROM public.plan WHERE id=p_plan_id;
    IF v_owner IS NULL THEN RAISE EXCEPTION 'plan % not found', p_plan_id USING ERRCODE='42704'; END IF;
    IF v_kind <> 'template' THEN RAISE EXCEPTION 'save_template_plan only edits template plans (got kind=%)', v_kind USING ERRCODE='42501'; END IF;
    IF v_uid <> v_owner AND NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'Not authorised to edit plan %', p_plan_id USING ERRCODE='42501'; END IF;
    v_plan_id := p_plan_id;
    UPDATE public.plan SET name=COALESCE(NULLIF(p_payload->>'name',''),name), description=p_payload->>'description', updated_at=now() WHERE id=v_plan_id;
  END IF;

  SELECT array_agg(progression_rule_id) INTO v_old_rule_ids FROM public.plan_slots WHERE plan_id=v_plan_id AND progression_rule_id IS NOT NULL;

  FOR v_week, v_week_index IN SELECT value, ordinality FROM jsonb_array_elements(COALESCE(p_payload->'weeks','[]'::jsonb)) WITH ORDINALITY
  LOOP
    INSERT INTO public.plan_weeks (plan_id, week_index, label, is_deload, deload_preset_id, deload_placement)
    VALUES (v_plan_id, v_week_index, v_week->>'label', COALESCE((v_week->>'isDeload')::boolean,false), v_week->>'deloadPresetId', NULLIF(v_week->>'deloadPlacement',''))
    ON CONFLICT (plan_id, week_index) DO UPDATE SET label=EXCLUDED.label, is_deload=EXCLUDED.is_deload, deload_preset_id=EXCLUDED.deload_preset_id, deload_placement=EXCLUDED.deload_placement, updated_at=now()
    RETURNING id INTO v_week_id;
    v_weeks_count := v_weeks_count+1; v_seen_week_idx := v_seen_week_idx || v_week_index;

    FOR v_session IN SELECT value FROM jsonb_array_elements(COALESCE(v_week->'sessions','[]'::jsonb))
    LOOP
      v_session_bid := v_session->>'id'; IF NULLIF(v_session_bid,'') IS NULL THEN CONTINUE; END IF;
      INSERT INTO public.plan_sessions (plan_id, plan_week_id, day_index, name, activity_type, sort_order, builder_session_id)
      VALUES (v_plan_id, v_week_id, COALESCE((v_session->>'dayIndex')::int,1), v_session->>'name', COALESCE(NULLIF(v_session->>'type',''),'strength'), COALESCE((v_session->>'sortOrder')::int,0), v_session_bid::uuid)
      ON CONFLICT (plan_id, builder_session_id) WHERE builder_session_id IS NOT NULL DO UPDATE SET plan_week_id=EXCLUDED.plan_week_id, day_index=EXCLUDED.day_index, name=EXCLUDED.name, activity_type=EXCLUDED.activity_type, sort_order=EXCLUDED.sort_order, updated_at=now()
      RETURNING id INTO v_session_id;
      v_sessions_count := v_sessions_count+1; v_seen_session := v_seen_session || v_session_id;
      v_session_map := v_session_map || jsonb_build_object(v_session_bid, v_session_id::text);
    END LOOP;

    FOR v_slot IN SELECT value FROM jsonb_array_elements(COALESCE(v_week->'slots','[]'::jsonb))
    LOOP
      v_session_id := NULLIF(v_session_map->>(v_slot->>'sessionId'),'')::uuid; IF v_session_id IS NULL THEN CONTINUE; END IF;
      v_slot_bid := v_slot->>'id'; IF NULLIF(v_slot_bid,'') IS NULL THEN CONTINUE; END IF;
      v_exercise_id := NULL;
      IF (v_slot->'exercise'->>'exerciseId') IS NOT NULL THEN SELECT id INTO v_exercise_id FROM public.exercise_library WHERE id=(v_slot->'exercise'->>'exerciseId')::uuid; END IF;
      v_rule_id := NULL;
      IF v_week_index=1 AND jsonb_typeof(v_slot->'deltaRules')='array' AND jsonb_array_length(v_slot->'deltaRules')>0 THEN
        INSERT INTO public.progression_rules (owner_coach_id, name, scope, rule_json) VALUES (v_owner, NULL, 'slot', v_slot->'deltaRules') RETURNING id INTO v_rule_id;
        v_rules_count := v_rules_count+1;
      END IF;
      INSERT INTO public.plan_slots (plan_id, plan_session_id, exercise_id, activity_id, activity_name, section, sort_order, prescription_json, progression_rule_id, manual_override, instructions, group_id, group_type, rounds, builder_slot_id)
      VALUES (v_plan_id, v_session_id, v_exercise_id, v_slot->>'activityId', v_slot->>'activityName', 'main', COALESCE((v_slot->>'sortOrder')::int,0),
        jsonb_strip_nulls(jsonb_build_object('muscleId',v_slot->>'muscleId','sets',v_slot->'sets','repMin',v_slot->'repMin','repMax',v_slot->'repMax','tempo',v_slot->'tempo','rir',v_slot->'rir','rpe',v_slot->'rpe','setsDetail',v_slot->'setsDetail','columns',COALESCE(v_slot->'prescriptionColumns',p_payload->'globalPrescriptionColumns'),'clientInputs',COALESCE(v_slot->'clientInputColumns',p_payload->'globalClientInputs'),'exerciseName',v_slot->'exercise'->>'name','replacements',v_slot->'replacements','manualOverrides',v_slot->'manualOverrides','activityType',v_slot->>'activityType','duration',v_slot->'duration','distance',v_slot->'distance','targetHrZone',v_slot->'targetHrZone','pace',v_slot->'pace','rounds',v_slot->'rounds','workSeconds',v_slot->'workSeconds','restSeconds',v_slot->'restSeconds','difficulty',v_slot->'difficulty','activityNotes',v_slot->'activityNotes')),
        v_rule_id, CASE WHEN jsonb_typeof(v_slot->'manualOverrides')='array' THEN jsonb_array_length(v_slot->'manualOverrides')>0 ELSE false END,
        COALESCE(v_slot->'exercise'->>'instructions', v_slot->>'activityNotes'), NULLIF(v_slot->>'groupId','')::uuid, NULLIF(v_slot->>'groupType',''), (v_slot->>'groupRounds')::int, v_slot_bid::uuid)
      ON CONFLICT (plan_id, builder_slot_id) WHERE builder_slot_id IS NOT NULL DO UPDATE SET plan_session_id=EXCLUDED.plan_session_id, exercise_id=EXCLUDED.exercise_id, activity_id=EXCLUDED.activity_id, activity_name=EXCLUDED.activity_name, section=EXCLUDED.section, sort_order=EXCLUDED.sort_order, prescription_json=EXCLUDED.prescription_json, progression_rule_id=EXCLUDED.progression_rule_id, manual_override=EXCLUDED.manual_override, instructions=EXCLUDED.instructions, group_id=EXCLUDED.group_id, group_type=EXCLUDED.group_type, rounds=EXCLUDED.rounds, updated_at=now()
      RETURNING id INTO v_slot_id;
      v_seen_slot := v_seen_slot || v_slot_id; v_slots_count := v_slots_count+1;
    END LOOP;
  END LOOP;

  DELETE FROM public.plan_slots WHERE plan_id=v_plan_id AND NOT (id=ANY(v_seen_slot));
  DELETE FROM public.plan_sessions WHERE plan_id=v_plan_id AND NOT (id=ANY(v_seen_session));
  DELETE FROM public.plan_weeks WHERE plan_id=v_plan_id AND NOT (week_index=ANY(v_seen_week_idx));
  IF v_old_rule_ids IS NOT NULL THEN DELETE FROM public.progression_rules WHERE id=ANY(v_old_rule_ids); END IF;

  RETURN jsonb_build_object('plan_id',v_plan_id,'weeks',v_weeks_count,'sessions',v_sessions_count,'slots',v_slots_count,'rules',v_rules_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.save_template_plan(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_template_plan(uuid,jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_template_plan(uuid,jsonb) TO authenticated, service_role;
