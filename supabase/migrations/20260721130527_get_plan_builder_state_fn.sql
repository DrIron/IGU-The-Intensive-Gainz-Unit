CREATE OR REPLACE FUNCTION public.get_plan_builder_state(p_plan_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH pl AS (SELECT p.* FROM public.plan p WHERE p.id=p_plan_id AND (p.owner_coach_id=auth.uid() OR public.is_admin(auth.uid())))
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM pl) THEN NULL ELSE jsonb_build_object(
    'plan_id',(SELECT id FROM pl),'name',(SELECT name FROM pl),'description',(SELECT description FROM pl),
    'kind',(SELECT kind FROM pl),'level',(SELECT level FROM pl),'tags',(SELECT tags FROM pl),
    'weeks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',w.id,'weekIndex',w.week_index,'label',w.label,'isDeload',w.is_deload,'deloadPresetId',w.deload_preset_id,'deloadPlacement',w.deload_placement,
        'sessions', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',COALESCE(s.builder_session_id,s.id),'name',s.name,'type',s.activity_type,'dayIndex',s.day_index,'sortOrder',s.sort_order) ORDER BY s.sort_order, s.day_index) FROM public.plan_sessions s WHERE s.plan_week_id=w.id),'[]'::jsonb),
        'slots', COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id',COALESCE(sl.builder_slot_id,sl.id),'sessionId',COALESCE(s2.builder_session_id,s2.id),'sortOrder',sl.sort_order,
            'muscleId',sl.prescription_json->>'muscleId','sets',sl.prescription_json->'sets','repMin',sl.prescription_json->'repMin','repMax',sl.prescription_json->'repMax',
            'tempo',sl.prescription_json->'tempo','rir',sl.prescription_json->'rir','rpe',sl.prescription_json->'rpe','setsDetail',sl.prescription_json->'setsDetail',
            'prescriptionColumns',sl.prescription_json->'columns','clientInputColumns',sl.prescription_json->'clientInputs',
            'exercise',CASE WHEN sl.exercise_id IS NOT NULL OR (sl.prescription_json->>'exerciseName') IS NOT NULL THEN jsonb_strip_nulls(jsonb_build_object('exerciseId',sl.exercise_id,'name',sl.prescription_json->>'exerciseName','instructions',sl.instructions)) ELSE NULL END,
            'replacements',sl.prescription_json->'replacements','manualOverrides',sl.prescription_json->'manualOverrides',
            'activityType',sl.prescription_json->>'activityType','activityId',sl.activity_id,'activityName',sl.activity_name,
            'duration',sl.prescription_json->'duration','distance',sl.prescription_json->'distance','targetHrZone',sl.prescription_json->'targetHrZone','pace',sl.prescription_json->'pace',
            'rounds',sl.prescription_json->'rounds','workSeconds',sl.prescription_json->'workSeconds','restSeconds',sl.prescription_json->'restSeconds','difficulty',sl.prescription_json->'difficulty','activityNotes',sl.prescription_json->'activityNotes',
            'groupId',sl.group_id,'groupType',sl.group_type,'groupRounds',sl.rounds,
            'deltaRules',CASE WHEN w.week_index=1 AND pr.rule_json IS NOT NULL THEN pr.rule_json ELSE NULL END
          ) ORDER BY sl.sort_order)
          FROM public.plan_slots sl JOIN public.plan_sessions s2 ON s2.id=sl.plan_session_id LEFT JOIN public.progression_rules pr ON pr.id=sl.progression_rule_id
          WHERE s2.plan_week_id=w.id),'[]'::jsonb)
      ) ORDER BY w.week_index)
      FROM public.plan_weeks w WHERE w.plan_id=(SELECT id FROM pl)),'[]'::jsonb)
  ) END;
$function$;

REVOKE ALL ON FUNCTION public.get_plan_builder_state(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_plan_builder_state(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_plan_builder_state(uuid) TO authenticated, service_role;
