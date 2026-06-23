-- RO Phase 2: per-active-client roster stats for the coach "My Clients" page.
--
-- The roster row needs adherence %, weigh-ins this week, last weigh-in date, and
-- has-program — but coach RLS hides weight_logs / weekly_progress / adherence_logs
-- from a client-side read (the Phase-1 "last weigh-in" showed "No check-in" for
-- every row for exactly this reason). This SECURITY DEFINER RPC returns the stats
-- for the caller's OWN active clients only (primary via subscriptions.coach_id, or
-- team owner via coach_teams), batched into one JSONB map keyed by client user_id.
--
-- Adherence source per flow (branched on services.type):
--   * TEAM     -> weekly_progress (self-service tracker rows).
--   * 1:1      -> adherence_logs   (coach-phase weekly check-ins).
-- Weigh-ins / last weigh-in per flow:
--   * 1:1      -> weight_logs (dated rows): count since the current IGU week start
--                 (Kuwait Monday) / max(log_date).
--   * TEAM     -> weekly_progress.weight_logs jsonb (per-week entries): length of
--                 the current IGU-week row / week_start_date of the latest week
--                 that has weight data.
-- has_program -> EXISTS an active client_programs row.
--
-- Mirrors get_coach_roster_attention()'s coach-scoping + the get_current_week_bounds()
-- Kuwait-anchored ISO week. Mandatory REVOKE/GRANT (CLAUDE.md SECURITY DEFINER rule).

CREATE OR REPLACE FUNCTION public.get_coach_roster_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach      UUID := auth.uid();
  v_team_ids   UUID[];
  v_week_start DATE;
  v_result     JSONB;
BEGIN
  IF v_coach IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT array_agg(id) INTO v_team_ids FROM public.coach_teams WHERE coach_id = v_coach;

  -- Current IGU week start: Kuwait-anchored ISO Monday (matches get_current_week_bounds).
  v_week_start := (date_trunc('week', (now() AT TIME ZONE 'Asia/Kuwait')))::date;

  WITH roster AS (
    SELECT DISTINCT ON (s.user_id)
      s.user_id,
      svc.type AS service_type
    FROM public.subscriptions s
    JOIN public.profiles_public pp ON pp.id = s.user_id
    LEFT JOIN public.services svc ON svc.id = s.service_id
    WHERE (s.coach_id = v_coach OR (v_team_ids IS NOT NULL AND s.team_id = ANY (v_team_ids)))
      AND s.status = 'active'
      AND pp.status = 'active'
    ORDER BY s.user_id, s.created_at DESC
  ),
  -- TEAM adherence: last <=4 recorded weekly_progress weeks (followed_calories set).
  team_adh AS (
    SELECT user_id,
      ROUND(100.0 * COUNT(*) FILTER (WHERE followed_calories AND tracked_accurately) / COUNT(*))::int AS adherence_pct
    FROM (
      SELECT wp.user_id, wp.followed_calories, wp.tracked_accurately,
        row_number() OVER (PARTITION BY wp.user_id ORDER BY wp.week_number DESC) AS rn
      FROM public.weekly_progress wp
      WHERE wp.user_id IN (SELECT user_id FROM roster WHERE service_type = 'team')
        AND wp.followed_calories IS NOT NULL
    ) t
    WHERE rn <= 4
    GROUP BY user_id
  ),
  -- 1:1 adherence: last <=4 recorded adherence_logs weeks.
  oto_adh AS (
    SELECT user_id,
      ROUND(100.0 * COUNT(*) FILTER (WHERE followed_calories AND tracked_accurately) / COUNT(*))::int AS adherence_pct
    FROM (
      SELECT al.user_id, al.followed_calories, al.tracked_accurately,
        row_number() OVER (PARTITION BY al.user_id ORDER BY al.week_number DESC) AS rn
      FROM public.adherence_logs al
      WHERE al.user_id IN (SELECT user_id FROM roster WHERE service_type <> 'team')
        AND al.followed_calories IS NOT NULL
    ) t
    WHERE rn <= 4
    GROUP BY user_id
  ),
  -- TEAM weigh-ins this week: jsonb entries in the current IGU-week row.
  team_wk AS (
    SELECT wp.user_id,
      COALESCE(SUM(
        CASE WHEN jsonb_typeof(wp.weight_logs) = 'array' THEN jsonb_array_length(wp.weight_logs) ELSE 0 END
      ), 0)::int AS weigh_ins_this_week
    FROM public.weekly_progress wp
    WHERE wp.user_id IN (SELECT user_id FROM roster WHERE service_type = 'team')
      AND wp.week_start_date::date >= v_week_start
      AND wp.week_start_date::date < v_week_start + 7
    GROUP BY wp.user_id
  ),
  -- TEAM last weigh-in: week_start of the latest week that has weight data.
  team_last AS (
    SELECT wp.user_id, MAX(wp.week_start_date)::date AS last_weigh_in_date
    FROM public.weekly_progress wp
    WHERE wp.user_id IN (SELECT user_id FROM roster WHERE service_type = 'team')
      AND (wp.average_weight_kg IS NOT NULL
           OR (jsonb_typeof(wp.weight_logs) = 'array' AND jsonb_array_length(wp.weight_logs) > 0))
    GROUP BY wp.user_id
  ),
  -- 1:1 weigh-ins this week: dated weight_logs since the IGU week start.
  oto_wk AS (
    SELECT wl.user_id, COUNT(*)::int AS weigh_ins_this_week
    FROM public.weight_logs wl
    WHERE wl.user_id IN (SELECT user_id FROM roster WHERE service_type <> 'team')
      AND wl.log_date >= v_week_start
    GROUP BY wl.user_id
  ),
  -- 1:1 last weigh-in: max dated weight_logs entry.
  oto_last AS (
    SELECT wl.user_id, MAX(wl.log_date) AS last_weigh_in_date
    FROM public.weight_logs wl
    WHERE wl.user_id IN (SELECT user_id FROM roster WHERE service_type <> 'team')
    GROUP BY wl.user_id
  ),
  prog AS (
    SELECT DISTINCT cp.user_id
    FROM public.client_programs cp
    WHERE cp.user_id IN (SELECT user_id FROM roster)
      AND cp.status = 'active'
  )
  SELECT jsonb_object_agg(
    r.user_id,
    jsonb_build_object(
      'adherence_pct',
        CASE WHEN r.service_type = 'team' THEN ta.adherence_pct ELSE oa.adherence_pct END,
      'weigh_ins_this_week',
        CASE WHEN r.service_type = 'team' THEN COALESCE(tw.weigh_ins_this_week, 0)
             ELSE COALESCE(ow.weigh_ins_this_week, 0) END,
      'expected_weigh_ins', 3,
      'last_weigh_in_date',
        CASE WHEN r.service_type = 'team' THEN tl.last_weigh_in_date ELSE ol.last_weigh_in_date END,
      'has_program', (p.user_id IS NOT NULL)
    )
  )
  INTO v_result
  FROM roster r
  LEFT JOIN team_adh  ta ON ta.user_id = r.user_id
  LEFT JOIN oto_adh   oa ON oa.user_id = r.user_id
  LEFT JOIN team_wk   tw ON tw.user_id = r.user_id
  LEFT JOIN oto_wk    ow ON ow.user_id = r.user_id
  LEFT JOIN team_last tl ON tl.user_id = r.user_id
  LEFT JOIN oto_last  ol ON ol.user_id = r.user_id
  LEFT JOIN prog      p  ON p.user_id  = r.user_id;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_coach_roster_stats() IS
  'Per-active-client roster stats (adherence_pct, weigh_ins_this_week, expected_weigh_ins, '
  'last_weigh_in_date, has_program) for the calling coach''s own clients only. JSONB map keyed '
  'by client user_id. SECURITY DEFINER to bypass coach RLS on weight_logs/weekly_progress/'
  'adherence_logs; scoped to subscriptions.coach_id OR coach_teams ownership. Powers RO Phase 2.';

REVOKE ALL ON FUNCTION public.get_coach_roster_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_coach_roster_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_coach_roster_stats() TO authenticated;
