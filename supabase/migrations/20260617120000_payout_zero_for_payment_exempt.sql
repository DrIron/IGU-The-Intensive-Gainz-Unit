-- Payment-exempt clients generate NO revenue, so they must generate NO payout.
-- calculate_subscription_payout computed payout purely from service/level pricing
-- and ignored profiles_public.payment_exempt, so head-coach/admin comp clients
-- inflated coach compensation -- e.g. CoachCompensationCard showed 126 KWD for a
-- coach whose every active client was payment-exempt (5x senior 1:1 Online @24 +
-- 1x Team Plan head-coach @6). This short-circuits exempt subscriptions to a
-- zero payout with a `payment_exempt` flag, fixing every consumer of the RPC at
-- once (coach compensation card, admin payout views, monthly payment generation).
--
-- Body is otherwise identical to the prior definition. CREATE OR REPLACE retains
-- privileges; the REVOKE/GRANT block is restated per CLAUDE.md's RPC convention.

CREATE OR REPLACE FUNCTION public.calculate_subscription_payout(p_subscription_id uuid, p_discount_percentage numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_service_id UUID;
  v_service_slug TEXT;
  v_service_type TEXT;
  v_stored_price NUMERIC;
  v_level_price NUMERIC;
  v_flat_price NUMERIC;
  v_client_price NUMERIC;
  v_coach_id UUID;
  v_payment_exempt BOOLEAN;
  v_stored_level professional_level;
  v_coach_level professional_level;
  v_dietitian_id UUID;
  v_dietitian_level professional_level;
  v_coach_payout NUMERIC;
  v_diet_payout NUMERIC;
  v_igu_ops NUMERIC;
  v_igu_profit NUMERIC;
  v_discount_multiplier NUMERIC;
  v_total NUMERIC;
  v_threshold NUMERIC;
  v_blocked BOOLEAN := false;
  v_block_reason TEXT;
BEGIN
  SELECT s.service_id, s.coach_id, s.client_price_kwd, s.coach_level_at_purchase,
         sp.price_kwd, srv.slug, srv.type, COALESCE(pp.payment_exempt, false)
  INTO v_service_id, v_coach_id, v_stored_price, v_stored_level,
       v_flat_price, v_service_slug, v_service_type, v_payment_exempt
  FROM subscriptions s
  JOIN services srv ON srv.id = s.service_id
  JOIN service_pricing sp ON sp.service_id = srv.id
  LEFT JOIN profiles_public pp ON pp.id = s.user_id
  WHERE s.id = p_subscription_id;

  IF v_service_id IS NULL THEN
    RETURN jsonb_build_object('blocked', true, 'block_reason', 'Subscription not found');
  END IF;

  SELECT cp.coach_level INTO v_coach_level
  FROM coaches_public cp WHERE cp.user_id = v_coach_id;
  v_coach_level := COALESCE(v_stored_level, v_coach_level, 'junior');

  -- Payment-exempt client -> pays nothing -> no payout to anyone, no profit floor.
  IF v_payment_exempt THEN
    RETURN jsonb_build_object(
      'coach_payout', 0,
      'dietitian_payout', 0,
      'igu_ops', 0,
      'igu_profit', 0,
      'total', 0,
      'client_price', 0,
      'coach_level', v_coach_level,
      'blocked', false,
      'block_reason', NULL,
      'payment_exempt', true
    );
  END IF;

  SELECT slp.price_kwd INTO v_level_price
  FROM service_level_pricing slp
  WHERE slp.service_id = v_service_id AND slp.coach_level = v_coach_level;
  v_client_price := COALESCE(v_stored_price, v_level_price, v_flat_price);

  v_discount_multiplier := 1.0 - (COALESCE(p_discount_percentage, 0) / 100.0);
  v_total := ROUND(v_client_price * v_discount_multiplier, 2);

  SELECT COALESCE(payment_processing_kwd + platform_cost_kwd + admin_overhead_kwd, 0)
  INTO v_igu_ops
  FROM igu_operations_costs WHERE service_id = v_service_id;
  v_igu_ops := COALESCE(v_igu_ops, 0);

  SELECT payout_kwd INTO v_coach_payout
  FROM coach_payout_rates
  WHERE service_id = v_service_id AND role = 'coach' AND level = v_coach_level;
  v_coach_payout := COALESCE(v_coach_payout, 0);

  v_diet_payout := 0;
  SELECT cta.staff_user_id INTO v_dietitian_id
  FROM care_team_assignments cta
  WHERE cta.subscription_id = p_subscription_id
    AND cta.specialty = 'dietitian'
    AND cta.lifecycle_status = 'active'
  LIMIT 1;

  IF v_dietitian_id IS NOT NULL THEN
    SELECT COALESCE(spi.level, 'junior') INTO v_dietitian_level
    FROM staff_professional_info spi
    WHERE spi.user_id = v_dietitian_id AND spi.role = 'dietitian';
    v_dietitian_level := COALESCE(v_dietitian_level, 'junior');

    SELECT payout_kwd INTO v_diet_payout
    FROM coach_payout_rates
    WHERE service_id = v_service_id AND role = 'dietitian' AND level = v_dietitian_level;
    v_diet_payout := COALESCE(v_diet_payout, 0);
  END IF;

  IF v_discount_multiplier < 1.0 THEN
    v_coach_payout := ROUND(v_coach_payout * v_discount_multiplier, 2);
    v_diet_payout := ROUND(v_diet_payout * v_discount_multiplier, 2);
  END IF;

  v_igu_profit := v_total - v_coach_payout - v_diet_payout - v_igu_ops;

  IF v_service_type = 'team' THEN
    v_threshold := 2;
  ELSIF v_service_slug = 'one_to_one_online' THEN
    v_threshold := 3;
  ELSE
    v_threshold := 5;
  END IF;

  IF v_igu_profit < v_threshold THEN
    v_blocked := true;
    v_block_reason := format('IGU profit %.2f KWD below %.0f KWD minimum on %s', v_igu_profit, v_threshold, v_service_slug);
  END IF;

  RETURN jsonb_build_object(
    'coach_payout', ROUND(v_coach_payout, 2),
    'dietitian_payout', ROUND(v_diet_payout, 2),
    'igu_ops', ROUND(v_igu_ops, 2),
    'igu_profit', ROUND(v_igu_profit, 2),
    'total', v_total,
    'client_price', ROUND(v_client_price, 2),
    'coach_level', v_coach_level,
    'blocked', v_blocked,
    'block_reason', v_block_reason,
    'payment_exempt', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.calculate_subscription_payout(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calculate_subscription_payout(uuid, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.calculate_subscription_payout(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_subscription_payout(uuid, numeric) TO service_role;
