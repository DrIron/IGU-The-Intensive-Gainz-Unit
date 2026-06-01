-- Companion to 20260601120000. Body-guard fixes for two mutating RPCs that
-- lacked a proper auth.uid gate. Kept in a separate file because the Supabase
-- CLI statement splitter mishandles dollar-quoted function bodies when they
-- are mixed with long runs of REVOKE/GRANT in the same migration. Grants are
-- preserved across CREATE OR REPLACE, so the scoping done in 20260601120000
-- still holds. Rest of each body is verbatim from prod.

CREATE OR REPLACE FUNCTION public.assign_macrocycle_to_client(p_coach_id uuid, p_client_id uuid, p_subscription_id uuid, p_macrocycle_id uuid, p_start_date date, p_team_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_meso RECORD;
  v_weeks INT;
  v_cumulative_weeks INT := 0;
  v_this_start DATE;
  v_child_result JSONB;
  v_client_program_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_admin(auth.uid())
     AND (auth.uid() <> p_coach_id
          OR NOT public.is_primary_coach_for_user(p_coach_id, p_client_id)) THEN
    RAISE EXCEPTION 'Not authorised: caller is not the primary coach for this client'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM macrocycles WHERE id = p_macrocycle_id) THEN
    RAISE EXCEPTION 'Macrocycle not found: %', p_macrocycle_id;
  END IF;

  FOR v_meso IN
    SELECT mm.program_template_id, mm.sequence
    FROM macrocycle_mesocycles mm
    WHERE mm.macrocycle_id = p_macrocycle_id
    ORDER BY mm.sequence
  LOOP
    SELECT COALESCE(CEIL(MAX(day_index)::numeric / 7), 1)::int
    INTO v_weeks
    FROM program_template_days
    WHERE program_template_id = v_meso.program_template_id;

    v_this_start := p_start_date + (v_cumulative_weeks * 7);

    v_child_result := assign_program_to_client(
      p_coach_id, p_client_id, p_subscription_id,
      v_meso.program_template_id, v_this_start,
      p_team_id, p_macrocycle_id
    );

    v_client_program_ids := v_client_program_ids
      || ((v_child_result->>'client_program_id')::UUID);
    v_cumulative_weeks := v_cumulative_weeks + v_weeks;
  END LOOP;

  RETURN jsonb_build_object(
    'client_program_ids', to_jsonb(v_client_program_ids),
    'weeks_total', v_cumulative_weeks
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.reorder_macrocycle_blocks(p_macrocycle_id uuid, p_program_template_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_coach_id UUID;
  v_count INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  SELECT coach_id INTO v_coach_id
  FROM macrocycles
  WHERE id = p_macrocycle_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Macrocycle not found: %', p_macrocycle_id;
  END IF;

  IF v_coach_id <> auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to edit macrocycle %', p_macrocycle_id
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM macrocycle_mesocycles
  WHERE macrocycle_id = p_macrocycle_id;

  v_count := COALESCE(array_length(p_program_template_ids, 1), 0);

  IF v_count > 0 THEN
    INSERT INTO macrocycle_mesocycles (macrocycle_id, program_template_id, sequence)
    SELECT p_macrocycle_id, tid, seq - 1
    FROM unnest(p_program_template_ids) WITH ORDINALITY AS t(tid, seq);
  END IF;

  UPDATE macrocycles SET updated_at = now() WHERE id = p_macrocycle_id;

  RETURN jsonb_build_object('count', v_count);
END;
$function$;
