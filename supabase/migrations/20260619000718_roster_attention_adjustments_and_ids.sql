-- CO1: extend get_coach_roster_attention() so the coach dashboard headline,
-- the sidebar badge, and the roster all read ONE source.
--
-- Adds vs the prior definition:
--   * tiles.adjustments_pending — roster clients with a pending nutrition_adjustment
--     on a coach-owned phase (parity with the old NeedsAttentionAlerts banner), and
--     it's folded into the deduped `total`.
--   * most_overdue_days — worst check-in gap (days) among check-in-overdue clients;
--     drives the banner's "most overdue Xd" and the Check-ins Due card's interpretCheckIns.
--   * client_ids — per-bucket arrays of flagged user_ids, so the banner keeps its
--     single-client deep-link (jump straight to the one flagged client) without a
--     second query.
--
-- CREATE OR REPLACE preserves the existing ACL (anon already REVOKEd) — no re-grant.
CREATE OR REPLACE FUNCTION public.get_coach_roster_attention()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach              UUID := auth.uid();
  v_team_ids           UUID[];
  v_payment_failed     INT := 0;
  v_inactive           INT := 0;
  v_check_in_overdue   INT := 0;
  v_pending_approval   INT := 0;
  v_adjustments_pending INT := 0;
  v_total              INT := 0;
  v_most_overdue_days  INT := 0;
  v_payment_ids        UUID[];
  v_inactive_ids       UUID[];
  v_checkin_ids        UUID[];
  v_pending_ids        UUID[];
  v_adjust_ids         UUID[];
BEGIN
  IF v_coach IS NULL THEN
    RETURN jsonb_build_object(
      'total', 0,
      'most_overdue_days', 0,
      'tiles', jsonb_build_object(
        'payment_failed', 0, 'inactive', 0, 'check_in_overdue', 0,
        'pending_approval', 0, 'adjustments_pending', 0
      ),
      'client_ids', jsonb_build_object(
        'payment_failed', '[]'::jsonb, 'inactive', '[]'::jsonb, 'check_in_overdue', '[]'::jsonb,
        'pending_approval', '[]'::jsonb, 'adjustments_pending', '[]'::jsonb
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
    SELECT wl.user_id, MAX(wl.log_date) AS last_log
    FROM public.weight_logs wl
    WHERE wl.user_id IN (SELECT user_id FROM roster)
    GROUP BY wl.user_id
  ),
  adjustments AS (
    -- Roster clients with >= 1 pending nutrition_adjustment on a phase this coach owns.
    SELECT DISTINCT np.user_id
    FROM public.nutrition_adjustments na
    JOIN public.nutrition_phases np ON np.id = na.phase_id
    WHERE np.coach_id = v_coach
      AND na.status = 'pending'
      AND np.user_id IN (SELECT user_id FROM roster)
  ),
  flagged AS (
    SELECT
      r.user_id,
      (r.payment_failed_at IS NOT NULL)                                   AS f_payment,
      (r.sub_status = 'inactive' OR r.profile_status = 'inactive')        AS f_inactive,
      (r.profile_status = 'pending_coach_approval')                       AS f_pending,
      (c.last_log IS NOT NULL AND c.last_log < CURRENT_DATE - INTERVAL '7 days') AS f_checkin,
      (a.user_id IS NOT NULL)                                             AS f_adjust,
      CASE
        WHEN c.last_log IS NOT NULL AND c.last_log < CURRENT_DATE - INTERVAL '7 days'
        THEN (CURRENT_DATE - c.last_log)
        ELSE 0
      END AS overdue_days
    FROM roster r
    LEFT JOIN checkins c    ON c.user_id = r.user_id
    LEFT JOIN adjustments a ON a.user_id = r.user_id
  )
  SELECT
    COUNT(*) FILTER (WHERE f_payment),
    COUNT(*) FILTER (WHERE f_inactive),
    COUNT(*) FILTER (WHERE f_checkin),
    COUNT(*) FILTER (WHERE f_pending),
    COUNT(*) FILTER (WHERE f_adjust),
    COUNT(*) FILTER (WHERE f_payment OR f_inactive OR f_checkin OR f_pending OR f_adjust),
    COALESCE(MAX(overdue_days), 0),
    array_agg(user_id) FILTER (WHERE f_payment),
    array_agg(user_id) FILTER (WHERE f_inactive),
    array_agg(user_id) FILTER (WHERE f_checkin),
    array_agg(user_id) FILTER (WHERE f_pending),
    array_agg(user_id) FILTER (WHERE f_adjust)
  INTO
    v_payment_failed, v_inactive, v_check_in_overdue, v_pending_approval,
    v_adjustments_pending, v_total, v_most_overdue_days,
    v_payment_ids, v_inactive_ids, v_checkin_ids, v_pending_ids, v_adjust_ids
  FROM flagged;

  RETURN jsonb_build_object(
    'total', COALESCE(v_total, 0),
    'most_overdue_days', COALESCE(v_most_overdue_days, 0),
    'tiles', jsonb_build_object(
      'payment_failed',      COALESCE(v_payment_failed, 0),
      'inactive',            COALESCE(v_inactive, 0),
      'check_in_overdue',    COALESCE(v_check_in_overdue, 0),
      'pending_approval',    COALESCE(v_pending_approval, 0),
      'adjustments_pending', COALESCE(v_adjustments_pending, 0)
    ),
    'client_ids', jsonb_build_object(
      'payment_failed',      to_jsonb(COALESCE(v_payment_ids, ARRAY[]::UUID[])),
      'inactive',            to_jsonb(COALESCE(v_inactive_ids, ARRAY[]::UUID[])),
      'check_in_overdue',    to_jsonb(COALESCE(v_checkin_ids, ARRAY[]::UUID[])),
      'pending_approval',    to_jsonb(COALESCE(v_pending_ids, ARRAY[]::UUID[])),
      'adjustments_pending', to_jsonb(COALESCE(v_adjust_ids, ARRAY[]::UUID[]))
    )
  );
END;
$$;
