-- Teams T3 — get_team_pulse aggregate RPC. See docs/TEAMS_T3_BUILD.md §2/§4.
--
-- Computes the whole team Pulse in ONE round-trip, auth-gated to the team's head
-- coach OR admin. SECURITY DEFINER so it aggregates every member's training +
-- nutrition data regardless of per-table RLS (the team coach generally isn't the
-- member's primary coach) — avoids the N×M client fan-out that would silently
-- return 0 rows. Includes payment-exempt members (engagement surface, not
-- revenue) by reading subscriptions, not paying_subscriptions.
--
-- Member set = active team members (subscriptions.team_id = p_team_id AND status
-- IN ('pending','active')). Returns the JSONB payload shape in the build doc §2.
-- needs_attention reason keys are STABLE (UI maps them): 'no_recent_workout'
-- (no completed workout in 7+ days, or never), 'no_active_phase', 'pending_adjustment'.
CREATE OR REPLACE FUNCTION public.get_team_pulse(p_team_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_coach  uuid;
  v_active boolean;
  v_bounds jsonb;
  v_ws     date;
  v_we     date;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  SELECT coach_id, is_active INTO v_coach, v_active
  FROM public.coach_teams WHERE id = p_team_id;
  IF v_coach IS NULL THEN
    RAISE EXCEPTION 'Team % not found', p_team_id USING ERRCODE = 'P0001';
  END IF;
  IF NOT (v_coach = v_uid OR public.is_admin(v_uid)) THEN
    RAISE EXCEPTION 'Not authorised: caller is not the team head coach' USING ERRCODE = '42501';
  END IF;

  -- Current training week (Kuwait wall-clock), as dates, for workouts-this-week.
  v_bounds := public.get_current_week_bounds();
  v_ws := ((v_bounds->>'week_start')::timestamptz AT TIME ZONE 'Asia/Kuwait')::date;
  v_we := ((v_bounds->>'week_end')::timestamptz AT TIME ZONE 'Asia/Kuwait')::date;

  WITH members AS (
    SELECT DISTINCT s.user_id
    FROM public.subscriptions s
    WHERE s.team_id = p_team_id
      AND s.status IN ('pending', 'active')
  ),
  -- Most-recent active nutrition phase per member.
  phase AS (
    SELECT DISTINCT ON (np.user_id)
      np.user_id, np.id AS phase_id, np.goal_type, np.starting_weight_kg
    FROM public.nutrition_phases np
    JOIN members m ON m.user_id = np.user_id
    WHERE np.is_active = true
    ORDER BY np.user_id, np.start_date DESC NULLS LAST, np.created_at DESC
  ),
  -- Last completed workout per member (any program, via day -> program -> user).
  last_workout AS (
    SELECT cp.user_id, max(cdm.completed_at) AS last_completed_at
    FROM public.client_day_modules cdm
    JOIN public.client_program_days cpd ON cpd.id = cdm.client_program_day_id
    JOIN public.client_programs cp ON cp.id = cpd.client_program_id
    JOIN members m ON m.user_id = cp.user_id
    WHERE cdm.completed_at IS NOT NULL
    GROUP BY cp.user_id
  ),
  -- This-week scheduled vs completed modules per member.
  week_workouts AS (
    SELECT cp.user_id,
      count(*) AS scheduled,
      count(*) FILTER (WHERE cdm.completed_at IS NOT NULL) AS completed
    FROM public.client_day_modules cdm
    JOIN public.client_program_days cpd ON cpd.id = cdm.client_program_day_id
    JOIN public.client_programs cp ON cp.id = cpd.client_program_id
    JOIN members m ON m.user_id = cp.user_id
    WHERE cpd.date >= v_ws AND cpd.date < v_we
    GROUP BY cp.user_id
  ),
  -- Latest logged weight within the active phase.
  latest_weight AS (
    SELECT DISTINCT ON (wl.user_id) wl.user_id, wl.weight_kg
    FROM public.weight_logs wl
    JOIN phase ph ON ph.phase_id = wl.phase_id
    ORDER BY wl.user_id, wl.log_date DESC, wl.created_at DESC
  ),
  -- Members with a pending nutrition adjustment on their active phase.
  pending_adj AS (
    SELECT DISTINCT ph.user_id
    FROM public.nutrition_adjustments na
    JOIN phase ph ON ph.phase_id = na.phase_id
    WHERE na.status = 'pending'
  ),
  per_member AS (
    SELECT
      m.user_id,
      ph.goal_type,
      (ph.user_id IS NOT NULL) AS has_phase,
      lw.last_completed_at,
      CASE WHEN lw.last_completed_at IS NOT NULL
           THEN (now() - lw.last_completed_at) < interval '7 days'
           ELSE false END AS workout_recent,
      ph.starting_weight_kg,
      lwt.weight_kg AS latest_weight,
      (pa.user_id IS NOT NULL) AS has_pending_adj
    FROM members m
    LEFT JOIN phase ph ON ph.user_id = m.user_id
    LEFT JOIN last_workout lw ON lw.user_id = m.user_id
    LEFT JOIN latest_weight lwt ON lwt.user_id = m.user_id
    LEFT JOIN pending_adj pa ON pa.user_id = m.user_id
  ),
  flagged AS (
    SELECT
      pm.user_id,
      array_remove(ARRAY[
        CASE WHEN pm.last_completed_at IS NULL OR (now() - pm.last_completed_at) >= interval '7 days'
             THEN 'no_recent_workout' END,
        CASE WHEN NOT pm.has_phase THEN 'no_active_phase' END,
        CASE WHEN pm.has_pending_adj THEN 'pending_adjustment' END
      ], NULL) AS reasons,
      CASE WHEN pm.last_completed_at IS NOT NULL
           THEN floor(extract(epoch FROM (now() - pm.last_completed_at)) / 86400)::int
           ELSE NULL END AS most_overdue_days
    FROM per_member pm
  ),
  counts AS (
    SELECT
      (SELECT count(*) FROM members)::int AS member_count,
      (SELECT count(*) FROM per_member WHERE has_phase AND workout_recent)::int AS on_track_n,
      (SELECT count(*) FROM per_member WHERE goal_type = 'fat_loss')::int AS deficit,
      (SELECT count(*) FROM per_member WHERE goal_type = 'maintenance')::int AS maintenance,
      (SELECT count(*) FROM per_member WHERE goal_type = 'muscle_gain')::int AS surplus,
      COALESCE((SELECT sum(scheduled) FROM week_workouts), 0)::int AS wk_scheduled,
      COALESCE((SELECT sum(completed) FROM week_workouts), 0)::int AS wk_completed,
      (SELECT round(avg(latest_weight - starting_weight_kg)::numeric, 1)
         FROM per_member
        WHERE latest_weight IS NOT NULL AND starting_weight_kg IS NOT NULL) AS weight_trend_avg_kg
  )
  SELECT jsonb_build_object(
    'member_count', c.member_count,
    'on_track', jsonb_build_object('n', c.on_track_n, 'total', c.member_count),
    'workouts_this_week', jsonb_build_object(
      'completed', c.wk_completed,
      'scheduled', c.wk_scheduled,
      'pct', CASE WHEN c.wk_scheduled = 0 THEN 0
                  ELSE round(100.0 * c.wk_completed / c.wk_scheduled)::int END
    ),
    'weight_trend_avg_kg', c.weight_trend_avg_kg,
    'nutrition_split', jsonb_build_object(
      'deficit', c.deficit,
      'maintenance', c.maintenance,
      'surplus', c.surplus,
      -- none = everyone not counted above, so the split always sums to member_count.
      'none', c.member_count - c.deficit - c.maintenance - c.surplus
    ),
    'needs_attention', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'user_id', f.user_id,
          'first_name', COALESCE(pp.first_name, pp.display_name, 'Member'),
          'reasons', to_jsonb(f.reasons),
          'most_overdue_days', f.most_overdue_days
        )
        ORDER BY (f.most_overdue_days IS NULL) DESC, f.most_overdue_days DESC NULLS LAST
      )
      FROM flagged f
      LEFT JOIN public.profiles_public pp ON pp.id = f.user_id
      WHERE array_length(f.reasons, 1) > 0
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM counts c;

  RETURN v_result;
END;
$function$;
