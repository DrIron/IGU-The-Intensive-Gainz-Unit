-- CP6: "pay new price to apply". Shared resolver for "is a change due + what's the
-- new price" (re-derived server-side, never a stale snapshot), plus a p_require_paid
-- guard on apply so the cron never free-applies an unpaid non-exempt change.

-- Resolver: the due change for a sub, with the FRESH target price (mirrors CP2
-- schedule pricing). Returns null when no scheduled change is due.
CREATE OR REPLACE FUNCTION public.get_due_change_for_subscription(p_subscription_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_change      subscription_change_requests;
  v_sub         subscriptions;
  v_coach_level professional_level;
  v_exempt      boolean;
  v_preview     jsonb;
  v_target_name text;
BEGIN
  SELECT * INTO v_change FROM subscription_change_requests
   WHERE current_subscription_id = p_subscription_id
     AND status = 'scheduled'
     AND effective_at <= now()
   ORDER BY effective_at ASC
   LIMIT 1;
  IF v_change.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_sub FROM subscriptions WHERE id = p_subscription_id;
  SELECT COALESCE(payment_exempt, false) INTO v_exempt FROM profiles_public WHERE id = v_change.user_id;

  SELECT coach_level INTO v_coach_level FROM coaches_public WHERE user_id = v_sub.coach_id;
  v_coach_level := COALESCE(v_coach_level, v_sub.coach_level_at_purchase, 'junior');

  v_preview := public.preview_subscription_change_payout(v_change.target_service_id, v_coach_level, 0, v_exempt);
  SELECT name INTO v_target_name FROM services WHERE id = v_change.target_service_id;

  RETURN jsonb_build_object(
    'change_id',           v_change.id,
    'target_service_id',   v_change.target_service_id,
    'target_service_name', v_target_name,
    'target_team_id',      v_change.target_team_id,
    'new_price_kwd',       CASE WHEN v_exempt THEN 0 ELSE (v_preview->>'client_price')::numeric END,
    'payment_exempt',      v_exempt,
    'effective_at',        v_change.effective_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_due_change_for_subscription(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_due_change_for_subscription(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_due_change_for_subscription(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_change_for_subscription(uuid) TO service_role;

-- apply_subscription_change: add p_require_paid. When true (cron reconciliation),
-- a NON-exempt change only applies if the current sub has a captured renewal on/after
-- effective_at -- otherwise skip (no free override; the sub follows past-due/dunning).
-- Exempt is the one legit no-charge apply, so it bypasses the gate. verify-payment
-- passes false (it just verified the CAPTURED charge; payment is written right after).
CREATE OR REPLACE FUNCTION public.apply_subscription_change(
  p_request_id   uuid,
  p_reason       text DEFAULT 'scheduled_plan_change',
  p_require_paid boolean DEFAULT false
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

  SELECT COALESCE(payment_exempt, false) INTO v_exempt FROM profiles_public WHERE id = v_req.user_id;

  -- CP6 gate: paid-only reconciliation (cron). Exempt bypasses (no charge is correct).
  IF p_require_paid AND NOT v_exempt THEN
    IF NOT EXISTS (
      SELECT 1 FROM subscription_payments sp
       WHERE sp.subscription_id = v_old_sub.id
         AND sp.status = 'paid'
         AND sp.paid_at >= v_req.effective_at - interval '3 days'
    ) THEN
      RETURN jsonb_build_object('applied', false, 'reason', 'renewal_not_paid');
    END IF;
  END IF;

  SELECT * INTO v_target FROM services WHERE id = v_req.target_service_id;
  v_is_team := v_target.type = 'team';
  v_effective    := GREATEST(v_req.effective_at, now());
  v_next_billing := v_effective + interval '1 month';
  SELECT user_id INTO v_system_admin FROM user_roles WHERE role = 'admin' ORDER BY user_id LIMIT 1;

  UPDATE subscriptions SET
    status='cancelled', cancel_at_period_end=false, cancelled_at=now(), end_date=v_effective
  WHERE id = v_old_sub.id;

  v_assign := assign_coach_atomic(
    v_req.user_id, v_req.target_service_id, v_req.focus_areas, v_req.requested_coach_id,
    v_is_team, v_req.target_team_id,
    COALESCE(v_target.enable_session_booking, false),
    v_target.default_weekly_session_limit, v_target.default_session_duration_minutes
  );
  v_new_sub_id := (v_assign->>'subscription_id')::uuid;
  v_coach_id   := NULLIF(v_assign->>'coach_user_id', '')::uuid;

  SELECT coach_level INTO v_coach_level FROM coaches_public WHERE user_id = v_coach_id;
  v_coach_level := COALESCE(v_coach_level, v_old_sub.coach_level_at_purchase, 'junior');
  SELECT price_kwd INTO v_flat  FROM service_pricing        WHERE service_id = v_req.target_service_id;
  SELECT price_kwd INTO v_price FROM service_level_pricing  WHERE service_id = v_req.target_service_id AND coach_level = v_coach_level;
  v_price := COALESCE(v_price, v_flat);

  UPDATE subscriptions SET
    status='active',
    client_price_kwd = CASE WHEN v_exempt THEN NULL ELSE v_price END,
    base_price_kwd = CASE WHEN v_exempt THEN NULL ELSE v_price END,
    billing_amount_kwd = CASE WHEN v_exempt THEN NULL ELSE v_price END,
    coach_level_at_purchase = v_coach_level,
    start_date = v_effective, next_billing_date = v_next_billing,
    activation_override_by = v_system_admin, activation_override_reason = p_reason
  WHERE id = v_new_sub_id;

  v_migrate := migrate_subscription_links(v_old_sub.id, v_new_sub_id);
  v_payout  := calculate_subscription_payout(v_new_sub_id, 0);

  UPDATE subscription_change_requests SET
    status='applied', applied_subscription_id=v_new_sub_id, applied_at=now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'applied', true, 'new_subscription_id', v_new_sub_id, 'old_subscription_id', v_old_sub.id,
    'coach_user_id', v_coach_id, 'coach_level', v_coach_level,
    'price_kwd', CASE WHEN v_exempt THEN 0 ELSE v_price END,
    'payment_exempt', v_exempt, 'migrate', v_migrate, 'payout_blocked', v_payout->'blocked'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_subscription_change(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_subscription_change(uuid, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.apply_subscription_change(uuid, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_subscription_change(uuid, text, boolean) TO service_role;
