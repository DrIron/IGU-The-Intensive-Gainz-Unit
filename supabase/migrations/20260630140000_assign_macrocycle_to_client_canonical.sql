-- P5 macrocycle write-cutover: assign a macrocycle canonical-primary (no legacy
-- client_programs fan-out). Sibling of assign_template_to_client_canonical
-- (20260630133057) — same plan resolution + clone, looped over the macrocycle's
-- mesocycles with staggered start_dates. The last legacy client_programs writer;
-- clearing it unblocks the legacy DROP. board_v2-gated by the caller.
--
-- All-or-nothing: pre-resolve every mesocycle's canonical plan first; if ANY is
-- missing, return skipped/no_mirror_plan WITHOUT creating anything (caller falls
-- back to the legacy fan-out — a partial canonical macrocycle is worse than a
-- clean legacy one). ONE transaction (function body).
CREATE OR REPLACE FUNCTION public.assign_macrocycle_to_client_canonical(
  p_coach_id uuid,
  p_client_id uuid,
  p_subscription_id uuid,
  p_macrocycle_id uuid,
  p_start_date date,
  p_team_id uuid DEFAULT NULL,
  p_timezone text DEFAULT 'UTC'
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid              uuid := auth.uid();
  v_meso             RECORD;
  v_plan_id          uuid;
  v_clone            uuid;
  v_weeks            int;
  v_cumulative_weeks int := 0;
  v_this_start       date;
  v_assignment_id    uuid;
  v_assignment_ids   jsonb := '[]'::jsonb;
  v_missing          int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  -- admin, OR the assigning coach themselves, OR the client's primary coach
  -- (identical gate to assign_template_to_client_canonical).
  IF NOT public.is_admin(v_uid)
     AND v_uid <> p_coach_id
     AND NOT public.is_primary_coach_for_user(v_uid, p_client_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.macrocycles WHERE id = p_macrocycle_id) THEN
    RAISE EXCEPTION 'Macrocycle not found: %', p_macrocycle_id USING ERRCODE = '42704';
  END IF;

  -- Pre-resolve EVERY mesocycle's canonical plan first (all-or-nothing). Same join
  -- as assign_template_to_client_canonical. If any mesocycle has no canonical plan,
  -- bail before creating anything.
  SELECT count(*) INTO v_missing
  FROM public.macrocycle_mesocycles mm
  WHERE mm.macrocycle_id = p_macrocycle_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.plan p
      JOIN public.muscle_program_templates m ON m.id = p.source_muscle_template_id
      WHERE m.converted_program_id = mm.program_template_id
    );

  IF v_missing > 0 THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_mirror_plan',
                              'assignment_ids', '[]'::jsonb);
  END IF;

  -- Clone + assign each mesocycle in sequence, staggering start_date by the
  -- cumulative week count of the clones.
  FOR v_meso IN
    SELECT mm.program_template_id, mm.sequence
    FROM public.macrocycle_mesocycles mm
    WHERE mm.macrocycle_id = p_macrocycle_id
    ORDER BY mm.sequence
  LOOP
    SELECT p.id INTO v_plan_id
    FROM public.plan p
    JOIN public.muscle_program_templates m ON m.id = p.source_muscle_template_id
    WHERE m.converted_program_id = v_meso.program_template_id
    ORDER BY p.created_at DESC
    LIMIT 1;

    -- Own-your-copy: clone the resolved template plan for this assignee.
    v_clone := public.clone_plan(v_plan_id);

    v_this_start := p_start_date + (v_cumulative_weeks * 7);

    INSERT INTO public.client_plan_assignment (
      client_id, subscription_id, plan_id, macrocycle_id,
      primary_coach_id, team_id, start_date, status, timezone
    ) VALUES (
      p_client_id, p_subscription_id, v_clone, p_macrocycle_id,
      p_coach_id, p_team_id, v_this_start, 'active',
      COALESCE(NULLIF(p_timezone, ''), 'UTC')
    )
    RETURNING id INTO v_assignment_id;

    v_assignment_ids := v_assignment_ids || to_jsonb(v_assignment_id);

    -- Stagger by the clone's own plan_weeks count (source of truth; min 1 to avoid
    -- same-day stacking, matching legacy behaviour).
    SELECT GREATEST(COUNT(*), 1) INTO v_weeks
    FROM public.plan_weeks WHERE plan_id = v_clone;

    v_cumulative_weeks := v_cumulative_weeks + v_weeks;
  END LOOP;

  RETURN jsonb_build_object(
    'skipped', false,
    'assignment_ids', v_assignment_ids,
    'weeks_total', v_cumulative_weeks
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_macrocycle_to_client_canonical(uuid,uuid,uuid,uuid,date,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_macrocycle_to_client_canonical(uuid,uuid,uuid,uuid,date,uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_macrocycle_to_client_canonical(uuid,uuid,uuid,uuid,date,uuid,text) TO authenticated;
