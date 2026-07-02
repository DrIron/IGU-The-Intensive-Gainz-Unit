-- Day-move slice (B5 calendar): move a canonical plan_session to another day, with
-- an optional cascade to matching sessions in following weeks. Changes ONLY
-- plan_sessions.day_index / sort_order — plan_slots are untouched, so
-- exercise_set_logs.plan_slot_id identity (and log history) is safe by construction.
-- Zero legacy writes (P5 soak). Precedent: the deload insert/remove RPCs (calendar
-- surface must not load board state).
CREATE OR REPLACE FUNCTION public.move_plan_session(
  p_session_id uuid,
  p_new_day_index int,
  p_apply_following_weeks boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_plan_id    uuid;
  v_owner      uuid;
  v_week_id    uuid;
  v_week_index int;
  v_old_day    int;
  v_type       text;
  v_name       text;
  v_moved      int := 0;
  v_weeks      jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_new_day_index < 1 OR p_new_day_index > 7 THEN
    RAISE EXCEPTION 'day_index out of range (1-7)' USING ERRCODE = '22003';
  END IF;

  SELECT s.plan_id, s.plan_week_id, w.week_index, s.day_index, s.activity_type, s.name, p.owner_coach_id
    INTO v_plan_id, v_week_id, v_week_index, v_old_day, v_type, v_name, v_owner
  FROM public.plan_sessions s
  JOIN public.plan_weeks w ON w.id = s.plan_week_id
  JOIN public.plan p ON p.id = s.plan_id
  WHERE s.id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found' USING ERRCODE = '42704';
  END IF;

  -- Team-shared plans are edited from the team board, not the client calendar.
  -- Distinct errcode so the UI can map it to the team-board hint.
  IF EXISTS (
    SELECT 1 FROM public.client_plan_assignment a
    WHERE a.plan_id = v_plan_id AND a.status = 'active' AND a.team_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'team_shared_plan' USING ERRCODE = 'P0001';
  END IF;

  -- Gate: admin OR plan owner OR primary coach of an active assignee.
  IF NOT (
    public.is_admin(v_uid)
    OR v_owner = v_uid
    OR EXISTS (
      SELECT 1 FROM public.client_plan_assignment a
      WHERE a.plan_id = v_plan_id AND a.status = 'active'
        AND (a.primary_coach_id = v_uid OR public.is_primary_coach_for_user(v_uid, a.client_id))
    )
  ) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  IF v_old_day = p_new_day_index THEN
    RETURN jsonb_build_object('moved', 0, 'weeks', '[]'::jsonb); -- no-op
  END IF;

  -- Move the session itself, appended to the target day's tail.
  UPDATE public.plan_sessions
    SET day_index = p_new_day_index,
        sort_order = COALESCE(
          (SELECT max(x.sort_order) FROM public.plan_sessions x
           WHERE x.plan_week_id = v_week_id AND x.day_index = p_new_day_index), -1) + 1,
        updated_at = now()
    WHERE id = p_session_id;
  v_moved := 1;
  v_weeks := v_weeks || to_jsonb(v_week_index);

  -- Cascade: matching sessions in LATER weeks — same (old day, activity_type,
  -- name-when-set). Clones have builder_session_id NULL, so match on those fields.
  IF p_apply_following_weeks THEN
    WITH moved AS (
      UPDATE public.plan_sessions s
        SET day_index = p_new_day_index,
            sort_order = COALESCE(
              (SELECT max(x.sort_order) FROM public.plan_sessions x
               WHERE x.plan_week_id = s.plan_week_id AND x.day_index = p_new_day_index), -1) + 1,
            updated_at = now()
      FROM public.plan_weeks w
      WHERE s.plan_week_id = w.id
        AND s.plan_id = v_plan_id
        AND w.week_index > v_week_index
        AND s.day_index = v_old_day
        AND s.activity_type = v_type
        AND (v_name IS NULL OR s.name IS NOT DISTINCT FROM v_name)
      RETURNING w.week_index
    )
    SELECT v_moved + count(*), v_weeks || COALESCE(jsonb_agg(DISTINCT week_index), '[]'::jsonb)
      INTO v_moved, v_weeks
    FROM moved;
  END IF;

  RETURN jsonb_build_object('moved', v_moved, 'weeks', v_weeks);
END;
$function$;

REVOKE ALL ON FUNCTION public.move_plan_session(uuid, int, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.move_plan_session(uuid, int, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.move_plan_session(uuid, int, boolean) TO authenticated;
