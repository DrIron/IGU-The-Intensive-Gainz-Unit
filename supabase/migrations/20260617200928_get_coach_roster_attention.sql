-- get_coach_roster_attention()  (RO1/CO5 / CO1 consolidation)
--
-- ONE batched "who needs me" source for the calling coach, so the dashboard,
-- the sidebar badge, and the roster all agree on a single headline number.
--
-- Coach is derived from auth.uid() (never passed in — matches
-- get_coach_deload_request_counts; an id param would let one coach read
-- another's roster). Covers BOTH assignment paths:
--   * direct:    subscriptions.coach_id = auth.uid()
--   * team-plan: subscriptions.team_id  -> coach_teams.coach_id = auth.uid()
-- (a coach-only query silently undercounts team-plan clients — see RLS
-- migrations 20260212170000 / 20260212180000).
--
-- Returns JSONB:
--   { "total": <deduped clients needing attention>,
--     "tiles": { payment_failed, inactive, check_in_overdue, pending_approval } }
-- `total` counts each client ONCE even if they trip several buckets (a client
-- behind on both check-in and payment is one number, not two). The tiles keep
-- the granular per-bucket counts the dashboard already shows.
--
-- payment_failed_at is safe to key on directly: every recovery path
-- (verify-payment, tap-webhook CAPTURED, admin PaymentOverride) nulls it in the
-- same atomic update that sets status='active', so it is never stale-while-active.
--
-- check_in_overdue mirrors the dashboard's checkInsDue: an ACTIVE nutrition
-- phase whose most recent weigh-in is >= 7 days old (or has none yet).
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
    -- Latest subscription per client across both assignment paths.
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
    -- Most recent weigh-in per client among the coach's ACTIVE phases.
    SELECT np.user_id, MAX(wl.log_date) AS last_log
    FROM public.nutrition_phases np
    LEFT JOIN public.weight_logs wl ON wl.phase_id = np.id
    WHERE np.coach_id = v_coach AND np.is_active = true
    GROUP BY np.user_id
  ),
  flagged AS (
    SELECT
      r.user_id,
      (r.payment_failed_at IS NOT NULL)                                   AS f_payment,
      (r.sub_status = 'inactive' OR r.profile_status = 'inactive')        AS f_inactive,
      (r.profile_status = 'pending_coach_approval')                       AS f_pending,
      (c.user_id IS NOT NULL
        AND (c.last_log IS NULL OR c.last_log < CURRENT_DATE - INTERVAL '7 days')) AS f_checkin
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
