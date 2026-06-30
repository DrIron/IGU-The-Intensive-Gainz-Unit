-- Own-your-copy model — S4 selective sync-push. See docs/PROGRAM_SYNC_S4_BUILD.md.
--
-- push_template_to_assignees overwrites each selected assignee's CLONE plan with
-- the latest TEMPLATE version, EXCEPT sessions the assignee has already completed
-- (any slot with >=1 exercise_set_logs row) — those keep their exact prescription
-- + the slot rows the logs point at, so training history renders as performed.
--
-- Targets are CLONE plan ids (unifies 1:1 + team): a 1:1 client's clone is
-- client_plan_assignment.plan_id; a team's clone is coach_teams.current_program_plan_id.
-- Both have source_template_plan_id = the template. The RPC validates that.
--
-- Per-session granularity, aligned by builder_session_id (template<->clone share
-- it, copied verbatim by clone_plan). ONE transaction for ALL targets (a failure
-- rolls everything back). The template is read-only; never mutated here.
--
-- SECURITY DEFINER + owner/admin gate. REVOKE PUBLIC/anon; GRANT authenticated
-- (companion grants migration).
CREATE OR REPLACE FUNCTION public.push_template_to_assignees(
  p_template_plan_id uuid,
  p_target_plan_ids uuid[]
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid                  uuid := auth.uid();
  v_owner                uuid;
  v_clone                uuid;
  v_clone_owner          uuid;
  v_completed_session_ids uuid[];
  v_completed_builder    uuid[];
  v_old_rules            uuid[];
  v_week_map             jsonb;
  v_tw                   record;
  v_ts                   record;
  v_tsl                  record;
  v_clone_week_id        uuid;
  v_new_session_id       uuid;
  v_rule                 uuid;
  v_replaced             int;
  v_preserved            int;
  v_weeks_total          int;
  v_results              jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  -- Caller must own the template (or be admin).
  SELECT owner_coach_id INTO v_owner FROM public.plan WHERE id = p_template_plan_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Template plan % not found', p_template_plan_id USING ERRCODE = 'P0001';
  END IF;
  IF NOT (v_owner = v_uid OR public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'Not authorised: caller does not own the template' USING ERRCODE = '42501';
  END IF;

  -- Every target must be a client_frozen clone of THIS template (reject foreign ids).
  IF EXISTS (
    SELECT 1
    FROM unnest(p_target_plan_ids) AS t(id)
    LEFT JOIN public.plan p ON p.id = t.id
    WHERE p.id IS NULL
       OR p.kind <> 'client_frozen'
       OR p.source_template_plan_id IS DISTINCT FROM p_template_plan_id
  ) THEN
    RAISE EXCEPTION 'A target is not a client_frozen clone of this template' USING ERRCODE = '42501';
  END IF;

  FOREACH v_clone IN ARRAY COALESCE(p_target_plan_ids, '{}'::uuid[]) LOOP
    SELECT owner_coach_id INTO v_clone_owner FROM public.plan WHERE id = v_clone;

    -- 1. Completed sessions on this clone = sessions with >=1 logged set (any
    --    assignment using the clone). Keep both canonical ids (for deletion guard)
    --    and builder ids (to skip re-inserting the template's version).
    SELECT COALESCE(array_agg(DISTINCT ps.id), '{}'::uuid[]),
           COALESCE(array_agg(DISTINCT ps.builder_session_id)
                    FILTER (WHERE ps.builder_session_id IS NOT NULL), '{}'::uuid[])
      INTO v_completed_session_ids, v_completed_builder
    FROM public.plan_sessions ps
    JOIN public.plan_slots psl ON psl.plan_session_id = ps.id
    JOIN public.exercise_set_logs esl ON esl.plan_slot_id = psl.id
    WHERE ps.plan_id = v_clone
      AND esl.assignment_id IN (SELECT id FROM public.client_plan_assignment WHERE plan_id = v_clone);

    v_preserved := COALESCE(array_length(v_completed_session_ids, 1), 0);

    -- progression_rules referenced only by the about-to-be-deleted (non-completed)
    -- slots — clean them up after re-insert so they don't leak (1:1 with slots,
    -- like clone_plan / save_plan_from_builder).
    SELECT COALESCE(array_agg(psl.progression_rule_id), '{}'::uuid[])
      INTO v_old_rules
    FROM public.plan_slots psl
    JOIN public.plan_sessions ps ON ps.id = psl.plan_session_id
    WHERE ps.plan_id = v_clone
      AND NOT (ps.id = ANY(v_completed_session_ids))
      AND psl.progression_rule_id IS NOT NULL;

    -- 2. Delete every non-completed clone session (CASCADE removes their slots,
    --    which by definition have no logs). Completed sessions stay untouched.
    DELETE FROM public.plan_sessions ps
    WHERE ps.plan_id = v_clone
      AND NOT (ps.id = ANY(v_completed_session_ids));

    -- 3. Upsert the template's weeks into the clone (by week_index); map index -> clone week id.
    v_week_map := '{}'::jsonb;
    FOR v_tw IN
      SELECT week_index, label, is_deload, deload_preset_id, deload_placement
      FROM public.plan_weeks WHERE plan_id = p_template_plan_id ORDER BY week_index
    LOOP
      INSERT INTO public.plan_weeks (plan_id, week_index, label, is_deload, deload_preset_id, deload_placement)
      VALUES (v_clone, v_tw.week_index, v_tw.label, v_tw.is_deload, v_tw.deload_preset_id, v_tw.deload_placement)
      ON CONFLICT (plan_id, week_index) DO UPDATE
        SET label = EXCLUDED.label, is_deload = EXCLUDED.is_deload,
            deload_preset_id = EXCLUDED.deload_preset_id,
            deload_placement = EXCLUDED.deload_placement, updated_at = now()
      RETURNING id INTO v_clone_week_id;
      v_week_map := v_week_map || jsonb_build_object(v_tw.week_index::text, v_clone_week_id::text);
    END LOOP;

    -- 4. Insert the template's sessions (+ slots) for every builder_session_id NOT
    --    preserved (completed) in the clone. Carry builder ids verbatim so the NEXT
    --    push still aligns; clone progression rules per slot.
    v_replaced := 0;
    FOR v_ts IN
      SELECT ps.id, ps.day_index, ps.name, ps.activity_type, ps.sort_order, ps.builder_session_id,
             pw.week_index
      FROM public.plan_sessions ps
      JOIN public.plan_weeks pw ON pw.id = ps.plan_week_id
      WHERE ps.plan_id = p_template_plan_id
    LOOP
      IF v_ts.builder_session_id IS NOT NULL AND v_ts.builder_session_id = ANY(v_completed_builder) THEN
        CONTINUE;  -- preserved: the clone already has the completed version
      END IF;
      v_clone_week_id := NULLIF(v_week_map->>v_ts.week_index::text, '')::uuid;
      IF v_clone_week_id IS NULL THEN CONTINUE; END IF;  -- defensive; week was upserted above

      v_new_session_id := gen_random_uuid();
      INSERT INTO public.plan_sessions
        (id, plan_id, plan_week_id, day_index, name, activity_type, sort_order, builder_session_id)
      VALUES
        (v_new_session_id, v_clone, v_clone_week_id, v_ts.day_index, v_ts.name, v_ts.activity_type,
         v_ts.sort_order, v_ts.builder_session_id);
      v_replaced := v_replaced + 1;

      FOR v_tsl IN
        SELECT exercise_id, activity_id, activity_name, section, sort_order, prescription_json,
               progression_rule_id, manual_override, instructions, group_id, group_type, rounds, builder_slot_id
        FROM public.plan_slots WHERE plan_session_id = v_ts.id
      LOOP
        v_rule := NULL;
        IF v_tsl.progression_rule_id IS NOT NULL THEN
          INSERT INTO public.progression_rules (owner_coach_id, name, scope, rule_json)
          SELECT v_clone_owner, name, scope, rule_json
          FROM public.progression_rules WHERE id = v_tsl.progression_rule_id
          RETURNING id INTO v_rule;
        END IF;
        INSERT INTO public.plan_slots (
          id, plan_id, plan_session_id, exercise_id, activity_id, activity_name, section, sort_order,
          prescription_json, progression_rule_id, manual_override, instructions,
          group_id, group_type, rounds, builder_slot_id
        ) VALUES (
          gen_random_uuid(), v_clone, v_new_session_id, v_tsl.exercise_id, v_tsl.activity_id,
          v_tsl.activity_name, v_tsl.section, v_tsl.sort_order, v_tsl.prescription_json, v_rule,
          v_tsl.manual_override, v_tsl.instructions, v_tsl.group_id, v_tsl.group_type, v_tsl.rounds,
          v_tsl.builder_slot_id
        );
      END LOOP;
    END LOOP;

    -- Clean up: orphaned rules from deleted slots + now-empty weeks.
    IF array_length(v_old_rules, 1) > 0 THEN
      DELETE FROM public.progression_rules WHERE id = ANY(v_old_rules);
    END IF;
    DELETE FROM public.plan_weeks pw
    WHERE pw.plan_id = v_clone
      AND NOT EXISTS (SELECT 1 FROM public.plan_sessions s WHERE s.plan_week_id = pw.id);

    UPDATE public.plan SET updated_at = now() WHERE id = v_clone;

    SELECT count(*) INTO v_weeks_total FROM public.plan_weeks WHERE plan_id = v_clone;

    v_results := v_results || jsonb_build_object(
      'plan_id', v_clone,
      'sessions_replaced', v_replaced,
      'sessions_preserved', v_preserved,
      'weeks_total', v_weeks_total,
      'status', 'pushed'
    );
  END LOOP;

  RETURN jsonb_build_object('template_plan_id', p_template_plan_id, 'targets', v_results);
END;
$function$;
