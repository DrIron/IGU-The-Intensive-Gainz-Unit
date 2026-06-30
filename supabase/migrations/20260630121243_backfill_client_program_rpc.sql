-- P5 backfill: promote ONE active legacy client_programs snapshot → canonical
-- (plan kind='client_frozen' + plan_weeks/sessions/slots + client_plan_assignment),
-- re-keying exercise_set_logs to preserve history. Idempotent via
-- plan.source_client_program_id. One transaction (function body). Admin/service_role.
--
-- NOTE: this initial version mapped legacy ids → new ids by re-matching on a
-- (plan_session_id, exercise_id, sort_order) tuple, which is NOT unique when two
-- exercises share (exercise_id, sort_order) in a session → two cmes collapsed to one
-- plan_slot and the log re-key violated exercise_set_logs_canonical_key. Superseded by
-- 20260630121611_backfill_client_program_deterministic_idmap (pre-generated id maps
-- keyed on the legacy row id — exact 1:1). Kept for faithful migration history; this
-- body is never executed against data (definition only).
CREATE OR REPLACE FUNCTION public.backfill_client_program(p_program_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_cp           record;
  v_plan_name    text;
  v_new_plan     uuid;
  v_assignment   uuid;
  v_week_map     jsonb;
  v_session_map  jsonb;
  v_slot_map     jsonb;
  v_weeks        int := 0;
  v_sessions     int := 0;
  v_slots        int := 0;
  v_logs_rekeyed int := 0;
  v_legacy_mods  int;
  v_legacy_exs   int;
  v_legacy_logs  int;
BEGIN
  IF v_uid IS NOT NULL AND NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'Not authorised: backfill_client_program requires admin or service_role'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cp FROM public.client_programs WHERE id = p_program_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'program_not_found',
                              'source_client_program_id', p_program_id);
  END IF;

  IF EXISTS (SELECT 1 FROM public.plan WHERE source_client_program_id = p_program_id) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_backfilled',
                              'source_client_program_id', p_program_id);
  END IF;

  IF v_cp.source_template_id IS NOT NULL THEN
    SELECT title INTO v_plan_name FROM public.program_templates WHERE id = v_cp.source_template_id;
  END IF;
  v_plan_name := COALESCE(NULLIF(btrim(v_plan_name), ''), 'Training program');

  INSERT INTO public.plan (owner_coach_id, name, kind, visibility, source_client_program_id)
  VALUES (v_cp.primary_coach_id, v_plan_name, 'client_frozen', 'private', p_program_id)
  RETURNING id INTO v_new_plan;

  WITH wk AS (
    SELECT DISTINCT
      floor((COALESCE(d.day_index, (d.date - v_cp.start_date) + 1) - 1) / 7)::int + 1 AS week_index
    FROM public.client_program_days d
    WHERE d.client_program_id = p_program_id
  ),
  ins AS (
    INSERT INTO public.plan_weeks (plan_id, week_index, is_deload)
    SELECT v_new_plan, week_index, false FROM wk
    RETURNING id, week_index
  )
  SELECT jsonb_object_agg(week_index::text, id::text), count(*) INTO v_week_map, v_weeks FROM ins;

  WITH src AS (
    SELECT
      m.id AS cdm_id,
      (v_week_map ->> (floor((COALESCE(d.day_index, (d.date - v_cp.start_date) + 1) - 1) / 7)::int + 1)::text)::uuid AS plan_week_id,
      ((COALESCE(d.day_index, (d.date - v_cp.start_date) + 1) - 1) % 7) + 1 AS day_in_week,
      CASE
        WHEN m.module_type IN ('strength','cardio','hiit','yoga_mobility','recovery','sport_specific') THEN m.module_type
        WHEN m.module_type = 'mobility' THEN 'yoga_mobility'
        ELSE 'strength'
      END AS activity_type,
      m.title, m.sort_order
    FROM public.client_day_modules m
    JOIN public.client_program_days d ON d.id = m.client_program_day_id
    WHERE d.client_program_id = p_program_id
  ),
  ins AS (
    INSERT INTO public.plan_sessions (plan_id, plan_week_id, day_index, name, activity_type, sort_order)
    SELECT v_new_plan, plan_week_id, day_in_week, title, activity_type, sort_order FROM src
    RETURNING id, plan_week_id, day_index, sort_order, name
  )
  SELECT jsonb_object_agg(s.cdm_id::text, i.id::text), count(*) INTO v_session_map, v_sessions
  FROM src s
  JOIN ins i ON i.plan_week_id = s.plan_week_id AND i.day_index = s.day_in_week
    AND i.sort_order = s.sort_order AND i.name IS NOT DISTINCT FROM s.title;

  WITH src AS (
    SELECT e.id AS cme_id, e.client_day_module_id, e.exercise_id, e.section, e.sort_order,
           e.instructions, e.prescription_snapshot_json
    FROM public.client_module_exercises e
    JOIN public.client_day_modules m ON m.id = e.client_day_module_id
    JOIN public.client_program_days d ON d.id = m.client_program_day_id
    WHERE d.client_program_id = p_program_id
  ),
  ins AS (
    INSERT INTO public.plan_slots (
      id, plan_id, plan_session_id, exercise_id, section, sort_order, instructions, prescription_json
    )
    SELECT gen_random_uuid(), v_new_plan,
           (v_session_map ->> s.client_day_module_id::text)::uuid,
           s.exercise_id, s.section::text, s.sort_order, s.instructions, s.prescription_snapshot_json
    FROM src s
    RETURNING id, plan_session_id, exercise_id, sort_order
  )
  SELECT jsonb_object_agg(s.cme_id::text, i.id::text), count(*) INTO v_slot_map, v_slots
  FROM src s
  JOIN ins i ON i.plan_session_id = (v_session_map ->> s.client_day_module_id::text)::uuid
    AND i.exercise_id = s.exercise_id AND i.sort_order = s.sort_order;

  INSERT INTO public.client_plan_assignment (
    client_id, subscription_id, plan_id, macrocycle_id, primary_coach_id, team_id,
    start_date, status, timezone
  ) VALUES (
    v_cp.user_id, v_cp.subscription_id, v_new_plan, v_cp.macrocycle_id, v_cp.primary_coach_id,
    v_cp.team_id, v_cp.start_date, v_cp.status, v_cp.timezone
  )
  RETURNING id INTO v_assignment;

  WITH this_cmes AS (
    SELECT e.id AS cme_id
    FROM public.client_module_exercises e
    JOIN public.client_day_modules m ON m.id = e.client_day_module_id
    JOIN public.client_program_days d ON d.id = m.client_program_day_id
    WHERE d.client_program_id = p_program_id
  ),
  upd AS (
    UPDATE public.exercise_set_logs l
    SET assignment_id = v_assignment,
        plan_slot_id  = (v_slot_map ->> l.client_module_exercise_id::text)::uuid
    FROM this_cmes c
    WHERE l.client_module_exercise_id = c.cme_id
    RETURNING 1
  )
  SELECT count(*) INTO v_logs_rekeyed FROM upd;

  SELECT count(*) INTO v_legacy_mods
  FROM public.client_day_modules m
  JOIN public.client_program_days d ON d.id = m.client_program_day_id
  WHERE d.client_program_id = p_program_id;

  SELECT count(*) INTO v_legacy_exs
  FROM public.client_module_exercises e
  JOIN public.client_day_modules m ON m.id = e.client_day_module_id
  JOIN public.client_program_days d ON d.id = m.client_program_day_id
  WHERE d.client_program_id = p_program_id;

  SELECT count(*) INTO v_legacy_logs FROM public.exercise_set_logs l WHERE l.assignment_id = v_assignment;

  IF v_sessions <> v_legacy_mods THEN
    RAISE EXCEPTION 'Parity fail (sessions): % vs % (program %)', v_sessions, v_legacy_mods, p_program_id;
  END IF;
  IF v_slots <> v_legacy_exs THEN
    RAISE EXCEPTION 'Parity fail (slots): % vs % (program %)', v_slots, v_legacy_exs, p_program_id;
  END IF;

  RETURN jsonb_build_object(
    'skipped', false, 'source_client_program_id', p_program_id, 'plan_id', v_new_plan,
    'assignment_id', v_assignment, 'weeks', v_weeks, 'sessions', v_sessions, 'slots', v_slots,
    'logs_rekeyed', v_logs_rekeyed,
    'parity', jsonb_build_object(
      'sessions_match', v_sessions = v_legacy_mods, 'slots_match', v_slots = v_legacy_exs,
      'logs_match', v_legacy_logs = v_logs_rekeyed,
      'legacy_modules', v_legacy_mods, 'legacy_exercises', v_legacy_exs)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.backfill_client_program(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backfill_client_program(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.backfill_client_program(uuid) TO service_role;
