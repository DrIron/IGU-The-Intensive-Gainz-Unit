-- Fix ordering: idx_ccr_one_active_primary allows only one active primary coach
-- rel per client, so the OLD sub must be ended (its rel closed by the trigger)
-- BEFORE assign_coach_atomic inserts the new sub + its new primary rel. Otherwise
-- the trigger's insert collides with the still-open old rel.
CREATE OR REPLACE FUNCTION public.apply_subscription_change(
  p_request_id uuid,
  p_reason     text DEFAULT 'scheduled_plan_change'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req          record;
  v_old_sub      record;
  v_target       record;
  v_is_team      boolean;
  v_assign       jsonb;
  v_new_sub_id   uuid;
  v_coach_id     uuid;
  v_coach_level  professional_level;
  v_price        numeric;
  v_flat         numeric;
  v_exempt       boolean;
  v_system_admin uuid;
  v_effective    timestamptz;
  v_next_billing timestamptz;
  v_migrate      jsonb;
  v_payout       jsonb;
BEGIN
  SELECT * INTO v_req FROM subscription_change_requests
   WHERE id = p_request_id AND status = 'scheduled'
   FOR UPDATE;
  IF v_req.id IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'not_scheduled');
  END IF;

  SELECT * INTO v_old_sub FROM subscriptions WHERE id = v_req.current_subscription_id;
  IF v_old_sub.id IS NULL OR v_old_sub.status <> 'active' THEN
    UPDATE subscription_change_requests
       SET status = 'needs_admin', block_reason = 'current subscription no longer active'
     WHERE id = p_request_id;
    RETURN jsonb_build_object('applied', false, 'reason', 'old_sub_not_active');
  END IF;

  SELECT * INTO v_target FROM services WHERE id = v_req.target_service_id;
  v_is_team := v_target.type = 'team';
  SELECT COALESCE(payment_exempt, false) INTO v_exempt FROM profiles_public WHERE id = v_req.user_id;
  v_effective    := GREATEST(v_req.effective_at, now());
  v_next_billing := v_effective + interval '1 month';
  SELECT user_id INTO v_system_admin FROM user_roles WHERE role = 'admin' ORDER BY user_id LIMIT 1;

  -- 1) End the OLD sub FIRST: manage_coach_client_relationships ends its primary
  --    rel, freeing idx_ccr_one_active_primary before the new rel is created.
  UPDATE subscriptions SET
    status               = 'cancelled',
    cancel_at_period_end = false,
    cancelled_at         = now(),
    end_date             = v_effective
  WHERE id = v_old_sub.id;

  -- 2) Create the new (pending) sub + coach; the INSERT trigger creates the new
  --    primary rel (now conflict-free). 'keep' passed the current coach; assign
  --    falls back to auto if they can't take the new tier / are full.
  v_assign := assign_coach_atomic(
    v_req.user_id,
    v_req.target_service_id,
    v_req.focus_areas,
    v_req.requested_coach_id,
    v_is_team,
    v_req.target_team_id,
    COALESCE(v_target.enable_session_booking, false),
    v_target.default_weekly_session_limit,
    v_target.default_session_duration_minutes
  );
  v_new_sub_id := (v_assign->>'subscription_id')::uuid;
  v_coach_id   := NULLIF(v_assign->>'coach_user_id', '')::uuid;

  -- 3) Price at the ASSIGNED coach's level (recompute; never carry old).
  SELECT coach_level INTO v_coach_level FROM coaches_public WHERE user_id = v_coach_id;
  v_coach_level := COALESCE(v_coach_level, v_old_sub.coach_level_at_purchase, 'junior');
  SELECT price_kwd INTO v_flat  FROM service_pricing        WHERE service_id = v_req.target_service_id;
  SELECT price_kwd INTO v_price FROM service_level_pricing  WHERE service_id = v_req.target_service_id AND coach_level = v_coach_level;
  v_price := COALESCE(v_price, v_flat);

  -- 4) Activate the new sub via admin override (no fresh charge -- decision #1).
  UPDATE subscriptions SET
    status                     = 'active',
    client_price_kwd           = CASE WHEN v_exempt THEN NULL ELSE v_price END,
    base_price_kwd             = CASE WHEN v_exempt THEN NULL ELSE v_price END,
    billing_amount_kwd         = CASE WHEN v_exempt THEN NULL ELSE v_price END,
    coach_level_at_purchase    = v_coach_level,
    start_date                 = v_effective,
    next_billing_date          = v_next_billing,
    activation_override_by     = v_system_admin,
    activation_override_reason = p_reason
  WHERE id = v_new_sub_id;

  -- 5) Move the canonical program assignment old->new (coach rels via triggers).
  v_migrate := migrate_subscription_links(v_old_sub.id, v_new_sub_id);

  -- 6) Authoritative payout recompute for the NEW tier.
  v_payout := calculate_subscription_payout(v_new_sub_id, 0);

  -- 7) Mark applied.
  UPDATE subscription_change_requests SET
    status = 'applied', applied_subscription_id = v_new_sub_id, applied_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'applied', true,
    'new_subscription_id', v_new_sub_id,
    'old_subscription_id', v_old_sub.id,
    'coach_user_id', v_coach_id,
    'coach_level', v_coach_level,
    'price_kwd', CASE WHEN v_exempt THEN 0 ELSE v_price END,
    'payment_exempt', v_exempt,
    'migrate', v_migrate,
    'payout_blocked', v_payout->'blocked'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_subscription_change(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_subscription_change(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.apply_subscription_change(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_subscription_change(uuid, text) TO service_role;
