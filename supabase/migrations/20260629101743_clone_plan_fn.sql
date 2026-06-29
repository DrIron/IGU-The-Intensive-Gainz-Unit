-- Own-your-copy assignment model — S1 clone_plan RPC (ADDITIVE).
-- See docs/PROGRAM_ASSIGNMENT_SYNC.md.
--
-- Deep-copies a plan + its plan_weeks / plan_sessions / plan_slots (and the
-- progression_rules its slots reference) into a brand-new caller-owned plan, and
-- links the copy back to its template via source_template_plan_id. Fresh ids
-- throughout; prescription_json, deload (is_deload/preset/placement), grouping
-- (group_id/group_type/rounds) and builder ids (builder_session_id/
-- builder_slot_id) are copied VERBATIM within the clone. Returns the new plan id.
--
-- Reuses the materializer SHAPE of save_plan_from_builder (week -> session ->
-- slot hierarchy) but copies table-to-table (no JSONB round-trip). Id remaps are
-- built as jsonb {old_id -> new_id} maps so child FKs repoint to the clone's rows.
-- progression_rules are cloned too (not shared) so editing/replacing the clone's
-- rules never affects the template — and a later template re-save (which deletes
-- its own rule rows) can't null out the clone's progression_rule_id.
--
-- The clone is kind='client_frozen', visibility='private', owner = caller, and
-- carries NO source_muscle_template_id (that key belongs to the template's
-- save_plan_from_builder mirror; a clone is linked via source_template_plan_id).
--
-- Auth: caller must be a coach or admin, AND able to read the source plan
-- (owner, admin, or a global template). REVOKE-from-anon/GRANT authenticated in
-- the companion grants migration.
CREATE OR REPLACE FUNCTION public.clone_plan(p_source_plan_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_src         record;
  v_new_plan    uuid;
  v_week_map    jsonb;
  v_session_map jsonb;
  v_rule_map    jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_admin(v_uid) OR public.is_coach(v_uid)) THEN
    RAISE EXCEPTION 'Not authorised: clone_plan requires coach or admin'
      USING ERRCODE = '42501';
  END IF;

  SELECT id, owner_coach_id, name, description, kind, level, visibility, tags
    INTO v_src
  FROM public.plan
  WHERE id = p_source_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source plan % not found', p_source_plan_id USING ERRCODE = '42704';
  END IF;

  -- Read access to the source: owner, admin, or a globally-visible template.
  IF NOT (public.is_admin(v_uid)
          OR v_src.owner_coach_id = v_uid
          OR v_src.visibility = 'global') THEN
    RAISE EXCEPTION 'Not authorised to clone plan %', p_source_plan_id USING ERRCODE = '42501';
  END IF;

  -- New owned plan, linked to its template.
  INSERT INTO public.plan (
    owner_coach_id, name, description, kind, level, visibility, tags,
    source_template_plan_id
  ) VALUES (
    v_uid, v_src.name, v_src.description, 'client_frozen', v_src.level, 'private', v_src.tags,
    p_source_plan_id
  )
  RETURNING id INTO v_new_plan;

  -- old week id -> fresh id
  SELECT jsonb_object_agg(id::text, gen_random_uuid()::text)
    INTO v_week_map
  FROM public.plan_weeks WHERE plan_id = p_source_plan_id;

  -- old session id -> fresh id
  SELECT jsonb_object_agg(id::text, gen_random_uuid()::text)
    INTO v_session_map
  FROM public.plan_sessions WHERE plan_id = p_source_plan_id;

  -- old progression_rule id -> fresh id (only rules the source's slots reference)
  SELECT jsonb_object_agg(id::text, gen_random_uuid()::text)
    INTO v_rule_map
  FROM public.progression_rules
  WHERE id IN (
    SELECT DISTINCT progression_rule_id
    FROM public.plan_slots
    WHERE plan_id = p_source_plan_id AND progression_rule_id IS NOT NULL
  );

  -- Clone weeks.
  INSERT INTO public.plan_weeks (
    id, plan_id, week_index, label, is_deload, deload_preset_id, deload_placement
  )
  SELECT (v_week_map->>id::text)::uuid, v_new_plan, week_index, label,
         is_deload, deload_preset_id, deload_placement
  FROM public.plan_weeks
  WHERE plan_id = p_source_plan_id;

  -- Clone sessions (remap plan_week_id).
  INSERT INTO public.plan_sessions (
    id, plan_id, plan_week_id, day_index, name, activity_type, sort_order, builder_session_id
  )
  SELECT (v_session_map->>id::text)::uuid, v_new_plan,
         (v_week_map->>plan_week_id::text)::uuid, day_index, name, activity_type,
         sort_order, builder_session_id
  FROM public.plan_sessions
  WHERE plan_id = p_source_plan_id;

  -- Clone referenced progression_rules (owned by caller).
  IF v_rule_map IS NOT NULL THEN
    INSERT INTO public.progression_rules (id, owner_coach_id, name, scope, rule_json)
    SELECT (v_rule_map->>id::text)::uuid, v_uid, name, scope, rule_json
    FROM public.progression_rules
    WHERE id IN (
      SELECT DISTINCT progression_rule_id
      FROM public.plan_slots
      WHERE plan_id = p_source_plan_id AND progression_rule_id IS NOT NULL
    );
  END IF;

  -- Clone slots (remap plan_session_id + progression_rule_id; fresh slot ids).
  INSERT INTO public.plan_slots (
    id, plan_id, plan_session_id, exercise_id, activity_id, activity_name,
    section, sort_order, prescription_json, progression_rule_id, manual_override,
    instructions, group_id, group_type, rounds, builder_slot_id
  )
  SELECT gen_random_uuid(), v_new_plan,
         (v_session_map->>plan_session_id::text)::uuid, exercise_id, activity_id,
         activity_name, section, sort_order, prescription_json,
         CASE WHEN progression_rule_id IS NULL THEN NULL
              ELSE (v_rule_map->>progression_rule_id::text)::uuid END,
         manual_override, instructions, group_id, group_type, rounds, builder_slot_id
  FROM public.plan_slots
  WHERE plan_id = p_source_plan_id;

  RETURN v_new_plan;
END;
$function$;
