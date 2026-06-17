-- Align get_coach_roster_attention().check_in_overdue to the roster row's drift
-- source (FU3). The original keyed check-in on the coach's ACTIVE nutrition phase
-- weigh-ins and counted never-logged clients as overdue — but the roster rows
-- (CoachMyClientsPage.days_since_check_in) use the client's LATEST weigh-in of any
-- kind and treat "never logged" as neutral. That divergence meant the badge total
-- referenced different clients than the visible at-risk rows.
--
-- Now check_in_overdue = roster members whose most recent weigh-in (any phase /
-- any source) is >= 7 days old; never-logged is NOT counted (matches the rows'
-- null handling). Badge total == count of at-risk rows the coach actually sees.
--
-- CREATE OR REPLACE preserves the existing ACL (anon already REVOKEd) — no
-- re-grant needed. Other buckets + the dedup are unchanged.
CREATE OR REPLACE FUNCTION public.get_coach_roster_attention()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach            UUID := auth.uid();
  v_team_ids         UUID[];
  v_payment_failed   INT := 0;
  v_inactive         INT := 0;
  v_check_in_overdue INT := 0;
  v_pending_approval INT := 0;
  v_total            INT := 0;
BEGIN
  IF v_coach IS NULL THEN
    RETURN jsonb_build_object(
      'total', 0,
      'tiles', jsonb_build_object(
        'payment_failed', 0, 'inactive', 0, 'check_in_overdue', 0, 'pending_approval', 0
      )
    );
  END IF;

  SELECT array_agg(id) INTO v_team_ids
  FROM public.coach_teams
  WHERE coach_id = v_coach;

  WITH roster AS (
    SELECT DISTINCT ON (s.user_id)
      s.user_id,
      s.status            AS sub_status,
      s.payment_failed_at,
      pp.status           AS profile_status
    FROM public.subscriptions s
    JOIN public.profiles_public pp ON pp.id = s.user_id
    WHERE s.coach_id = v_coach
       OR (v_team_ids IS NOT NULL AND s.team_id = ANY (v_team_ids))
    ORDER BY s.user_id, s.created_at DESC
  ),
  checkins AS (
    -- User-scoped latest weigh-in (any phase/source), matching the roster row's
    -- days_since_check_in. Never-logged roster members simply don't appear here.
    SELECT wl.user_id, MAX(wl.log_date) AS last_log
    FROM public.weight_logs wl
    WHERE wl.user_id IN (SELECT user_id FROM roster)
    GROUP BY wl.user_id
  ),
  flagged AS (
    SELECT
      r.user_id,
      (r.payment_failed_at IS NOT NULL)                                   AS f_payment,
      (r.sub_status = 'inactive' OR r.profile_status = 'inactive')        AS f_inactive,
      (r.profile_status = 'pending_coach_approval')                       AS f_pending,
      -- Overdue only when there's a weigh-in on record that's >= 7 days stale;
      -- never-logged (no row in checkins) is neutral, exactly like the roster row.
      (c.last_log IS NOT NULL AND c.last_log < CURRENT_DATE - INTERVAL '7 days') AS f_checkin
    FROM roster r
    LEFT JOIN checkins c ON c.user_id = r.user_id
  )
  SELECT
    COUNT(*) FILTER (WHERE f_payment),
    COUNT(*) FILTER (WHERE f_inactive),
    COUNT(*) FILTER (WHERE f_checkin),
    COUNT(*) FILTER (WHERE f_pending),
    COUNT(*) FILTER (WHERE f_payment OR f_inactive OR f_checkin OR f_pending)
  INTO v_payment_failed, v_inactive, v_check_in_overdue, v_pending_approval, v_total
  FROM flagged;

  RETURN jsonb_build_object(
    'total', COALESCE(v_total, 0),
    'tiles', jsonb_build_object(
      'payment_failed',   COALESCE(v_payment_failed, 0),
      'inactive',         COALESCE(v_inactive, 0),
      'check_in_overdue', COALESCE(v_check_in_overdue, 0),
      'pending_approval', COALESCE(v_pending_approval, 0)
    )
  );
END;
$$;
