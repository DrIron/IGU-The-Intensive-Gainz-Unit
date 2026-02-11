-- Migration 5: Payout Calculation Functions
-- SECURITY DEFINER functions for dynamic payout computation

-- ============================================================
-- 1. SUBSCRIPTION PAYOUT CALCULATOR
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_subscription_payout(
  p_subscription_id UUID,
  p_discount_percentage NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_id UUID;
  v_service_slug TEXT;
  v_service_type TEXT;
  v_client_price NUMERIC;
  v_coach_id UUID;
  v_coach_level professional_level;
  v_dietitian_id UUID;
  v_dietitian_level professional_level;
  v_coach_online_rate NUMERIC;
  v_coach_inperson_rate NUMERIC;
  v_diet_online_rate NUMERIC;
  v_coach_online_hrs NUMERIC;
  v_coach_inperson_hrs NUMERIC;
  v_diet_online_hrs NUMERIC;
  v_igu_ops NUMERIC;
  v_coach_payout NUMERIC;
  v_diet_payout NUMERIC;
  v_igu_profit NUMERIC;
  v_discount_multiplier NUMERIC;
  v_remaining NUMERIC;
  v_coach_bonus NUMERIC;
  v_diet_bonus NUMERIC;
  v_igu_bonus NUMERIC;
  v_blocked BOOLEAN := false;
  v_block_reason TEXT;
BEGIN
  -- 1. Look up subscription → service, coach_id, price
  SELECT s.service_id, s.coach_id, srv.price_kwd, srv.slug, srv.type
  INTO v_service_id, v_coach_id, v_client_price, v_service_slug, v_service_type
  FROM subscriptions s
  JOIN services srv ON srv.id = s.service_id
  WHERE s.id = p_subscription_id;

  IF v_service_id IS NULL THEN
    RETURN jsonb_build_object(
      'blocked', true,
      'block_reason', 'Subscription not found'
    );
  END IF;

  -- Calculate discount multiplier
  v_discount_multiplier := 1.0 - (COALESCE(p_discount_percentage, 0) / 100.0);

  -- Get IGU ops (fixed, never discounted)
  SELECT COALESCE(payment_processing_kwd + platform_cost_kwd + admin_overhead_kwd, 0)
  INTO v_igu_ops
  FROM igu_operations_costs WHERE service_id = v_service_id;
  v_igu_ops := COALESCE(v_igu_ops, 0);

  -- ============================================================
  -- TEAM PLANS: Fixed 5 KWD head coach payout
  -- ============================================================
  IF v_service_type = 'team' THEN
    v_coach_payout := 5.0;
    v_diet_payout := 0;
    v_igu_profit := v_client_price - v_coach_payout - v_igu_ops;

    -- Apply discount to coach payout and IGU profit (not ops)
    IF v_discount_multiplier < 1.0 THEN
      v_coach_payout := ROUND(v_coach_payout * v_discount_multiplier, 2);
      v_igu_profit := v_client_price * v_discount_multiplier - v_coach_payout - v_igu_ops;
    END IF;

    RETURN jsonb_build_object(
      'coach_payout', ROUND(v_coach_payout, 2),
      'dietitian_payout', 0,
      'igu_ops', ROUND(v_igu_ops, 2),
      'igu_profit', ROUND(v_igu_profit, 2),
      'total', ROUND(v_client_price * v_discount_multiplier, 2),
      'blocked', false,
      'block_reason', NULL
    );
  END IF;

  -- ============================================================
  -- 1:1 TIERS: Hourly-based calculation
  -- ============================================================

  -- 2. Get coach level
  SELECT cp.coach_level INTO v_coach_level
  FROM coaches_public cp WHERE cp.user_id = v_coach_id;
  v_coach_level := COALESCE(v_coach_level, 'junior');

  -- 3. Get dietitian level (via care_team_assignments where specialty = 'dietitian')
  SELECT cta.staff_user_id INTO v_dietitian_id
  FROM care_team_assignments cta
  JOIN subscriptions sub ON sub.id = cta.subscription_id
  WHERE sub.id = p_subscription_id
    AND cta.specialty = 'dietitian'
    AND cta.lifecycle_status = 'active'
  LIMIT 1;

  IF v_dietitian_id IS NOT NULL THEN
    SELECT spi.level INTO v_dietitian_level
    FROM staff_professional_info spi
    WHERE spi.user_id = v_dietitian_id AND spi.role = 'dietitian';
  END IF;
  v_dietitian_level := COALESCE(v_dietitian_level, 'junior');

  -- 4. Get hourly rates
  SELECT hourly_rate_kwd INTO v_coach_online_rate
  FROM professional_levels WHERE role = 'coach' AND level = v_coach_level AND work_type = 'online';

  SELECT hourly_rate_kwd INTO v_coach_inperson_rate
  FROM professional_levels WHERE role = 'coach' AND level = v_coach_level AND work_type = 'in_person';

  SELECT hourly_rate_kwd INTO v_diet_online_rate
  FROM professional_levels WHERE role = 'dietitian' AND level = v_dietitian_level AND work_type = 'online';

  v_coach_online_rate := COALESCE(v_coach_online_rate, 0);
  v_coach_inperson_rate := COALESCE(v_coach_inperson_rate, 0);
  v_diet_online_rate := COALESCE(v_diet_online_rate, 0);

  -- 5. Get hour estimates
  SELECT COALESCE(estimated_hours, 0) INTO v_coach_online_hrs
  FROM service_hour_estimates WHERE service_id = v_service_id AND role = 'coach' AND work_type = 'online';

  SELECT COALESCE(estimated_hours, 0) INTO v_coach_inperson_hrs
  FROM service_hour_estimates WHERE service_id = v_service_id AND role = 'coach' AND work_type = 'in_person';

  SELECT COALESCE(estimated_hours, 0) INTO v_diet_online_hrs
  FROM service_hour_estimates WHERE service_id = v_service_id AND role = 'dietitian' AND work_type = 'online';

  v_coach_online_hrs := COALESCE(v_coach_online_hrs, 0);
  v_coach_inperson_hrs := COALESCE(v_coach_inperson_hrs, 0);
  v_diet_online_hrs := COALESCE(v_diet_online_hrs, 0);

  -- 6. Calculate base payouts
  v_coach_payout := (v_coach_online_rate * v_coach_online_hrs) + (v_coach_inperson_rate * v_coach_inperson_hrs);
  v_diet_payout := v_diet_online_rate * v_diet_online_hrs;

  -- ============================================================
  -- IN-PERSON TIER: Base hourly + profit split
  -- ============================================================
  IF v_service_slug = 'in_person' THEN
    v_remaining := v_client_price - v_coach_payout - v_diet_payout - v_igu_ops;

    -- Split remaining: Coach +15, Dietitian +10, IGU +15 = 40 KWD target
    IF v_remaining >= 40 THEN
      v_coach_bonus := 15;
      v_diet_bonus := 10;
      v_igu_bonus := v_remaining - 25; -- IGU gets 15 + any excess
    ELSIF v_remaining > 0 THEN
      -- Proportional reduction: 15/40, 10/40, 15/40
      v_coach_bonus := ROUND(v_remaining * (15.0 / 40.0), 2);
      v_diet_bonus := ROUND(v_remaining * (10.0 / 40.0), 2);
      v_igu_bonus := v_remaining - v_coach_bonus - v_diet_bonus;
    ELSE
      v_coach_bonus := 0;
      v_diet_bonus := 0;
      v_igu_bonus := 0;
    END IF;

    v_coach_payout := v_coach_payout + v_coach_bonus;
    v_diet_payout := v_diet_payout + v_diet_bonus;
    v_igu_profit := v_igu_bonus;

    -- Apply discount
    IF v_discount_multiplier < 1.0 THEN
      v_coach_payout := ROUND(v_coach_payout * v_discount_multiplier, 2);
      v_diet_payout := ROUND(v_diet_payout * v_discount_multiplier, 2);
      v_igu_profit := ROUND(v_client_price * v_discount_multiplier, 2) - v_coach_payout - v_diet_payout - v_igu_ops;
    END IF;

    -- Guardrail: 5 KWD minimum IGU profit
    IF v_igu_profit < 5 THEN
      v_blocked := true;
      v_block_reason := format(
        'IGU profit %.2f KWD below 5 KWD minimum (coach %s + dietitian %s on In-Person)',
        v_igu_profit, v_coach_level, v_dietitian_level
      );
    END IF;

    RETURN jsonb_build_object(
      'coach_payout', ROUND(v_coach_payout, 2),
      'dietitian_payout', ROUND(v_diet_payout, 2),
      'igu_ops', ROUND(v_igu_ops, 2),
      'igu_profit', ROUND(v_igu_profit, 2),
      'total', ROUND(v_client_price * v_discount_multiplier, 2),
      'blocked', v_blocked,
      'block_reason', v_block_reason
    );
  END IF;

  -- ============================================================
  -- STANDARD 1:1 TIERS (Online, Complete, Hybrid)
  -- ============================================================

  -- Apply discount to payouts (not ops)
  IF v_discount_multiplier < 1.0 THEN
    v_coach_payout := ROUND(v_coach_payout * v_discount_multiplier, 2);
    v_diet_payout := ROUND(v_diet_payout * v_discount_multiplier, 2);
  END IF;

  v_igu_profit := ROUND(v_client_price * v_discount_multiplier, 2) - v_coach_payout - v_diet_payout - v_igu_ops;

  -- Guardrail: 5 KWD minimum IGU profit
  IF v_igu_profit < 5 THEN
    v_blocked := true;
    v_block_reason := format(
      'IGU profit %.2f KWD below 5 KWD minimum (coach %s + dietitian %s on %s)',
      v_igu_profit, v_coach_level, v_dietitian_level, v_service_slug
    );
  END IF;

  RETURN jsonb_build_object(
    'coach_payout', ROUND(v_coach_payout, 2),
    'dietitian_payout', ROUND(v_diet_payout, 2),
    'igu_ops', ROUND(v_igu_ops, 2),
    'igu_profit', ROUND(v_igu_profit, 2),
    'total', ROUND(v_client_price * v_discount_multiplier, 2),
    'blocked', v_blocked,
    'block_reason', v_block_reason
  );
END;
$$;

-- ============================================================
-- 2. ADD-ON SESSION PAYOUT CALCULATOR
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_addon_session_payout(
  p_addon_service_id UUID,
  p_professional_level professional_level DEFAULT 'junior'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_addon addon_services%ROWTYPE;
  v_per_session_price NUMERIC;
  v_professional_payout NUMERIC;
  v_igu_take NUMERIC;
  v_hourly_rate NUMERIC;
BEGIN
  SELECT * INTO v_addon FROM addon_services WHERE id = p_addon_service_id;

  IF v_addon.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Add-on service not found');
  END IF;

  -- Session packs use hourly rate (in-person rate for coach)
  IF v_addon.type = 'session_pack' THEN
    SELECT hourly_rate_kwd INTO v_hourly_rate
    FROM professional_levels
    WHERE role = 'coach' AND level = p_professional_level AND work_type = 'in_person';

    v_hourly_rate := COALESCE(v_hourly_rate, 0);
    v_per_session_price := v_addon.base_price_kwd;

    -- Coach gets hourly rate or full session price (whichever is less)
    v_professional_payout := LEAST(v_hourly_rate, v_per_session_price);
    v_igu_take := v_per_session_price - v_professional_payout;

    RETURN jsonb_build_object(
      'per_session_price', v_per_session_price,
      'professional_payout', ROUND(v_professional_payout, 2),
      'igu_take', ROUND(v_igu_take, 2),
      'note', CASE
        WHEN v_hourly_rate >= v_per_session_price
        THEN 'Coach receives full session price; IGU absorbs shortfall as retention cost'
        ELSE NULL
      END
    );
  END IF;

  -- Specialist and one-time services use fixed payouts from catalog
  v_professional_payout := v_addon.professional_payout_kwd;
  v_igu_take := v_addon.igu_take_kwd;

  RETURN jsonb_build_object(
    'per_session_price', v_addon.base_price_kwd,
    'professional_payout', ROUND(v_professional_payout, 2),
    'igu_take', ROUND(v_igu_take, 2)
  );
END;
$$;
