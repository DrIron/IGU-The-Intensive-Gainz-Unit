-- Change-plan CP2: preview price + payout + min-profit guardrail for a TARGET tier
-- the client doesn't have a sub for yet. Mirrors calculate_subscription_payout's
-- core (same tables + thresholds) but parameterized by (service, coach_level) so
-- change-service:schedule can preview before any sub exists. The AUTHORITATIVE
-- recompute still happens at apply (CP3) via calculate_subscription_payout on the
-- real new sub -- keep the two in sync if payout rules change.
-- Coach-only preview: a dietitian (Complete/Hybrid/In-Person) is assigned at apply,
-- so it's excluded here (apply's recompute includes it). No Lead-coach restriction:
-- retired in the flat-payout model (LEVEL_ELIGIBILITY = all levels all tiers).
CREATE OR REPLACE FUNCTION public.preview_subscription_change_payout(
  p_target_service_id   uuid,
  p_coach_level         professional_level DEFAULT 'junior',
  p_discount_percentage numeric DEFAULT 0,
  p_payment_exempt      boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_service_slug        text;
  v_service_type        text;
  v_service_name        text;
  v_level_price         numeric;
  v_flat_price          numeric;
  v_client_price        numeric;
  v_coach_payout        numeric;
  v_igu_ops             numeric;
  v_igu_profit          numeric;
  v_discount_multiplier numeric;
  v_total               numeric;
  v_threshold           numeric;
  v_blocked             boolean := false;
  v_block_reason        text;
BEGIN
  SELECT srv.slug, srv.type, srv.name, sp.price_kwd
    INTO v_service_slug, v_service_type, v_service_name, v_flat_price
  FROM services srv
  JOIN service_pricing sp ON sp.service_id = srv.id
  WHERE srv.id = p_target_service_id;

  IF v_service_slug IS NULL THEN
    RETURN jsonb_build_object('blocked', true, 'block_reason', 'Target service not found');
  END IF;

  -- Payment-exempt client -> pays nothing, no payout, no profit floor.
  IF p_payment_exempt THEN
    RETURN jsonb_build_object(
      'client_price', 0, 'coach_payout', 0, 'dietitian_payout', 0,
      'igu_ops', 0, 'igu_profit', 0, 'total', 0,
      'coach_level', p_coach_level, 'service_name', v_service_name,
      'service_slug', v_service_slug, 'blocked', false,
      'block_reason', NULL, 'payment_exempt', true
    );
  END IF;

  SELECT slp.price_kwd INTO v_level_price
  FROM service_level_pricing slp
  WHERE slp.service_id = p_target_service_id AND slp.coach_level = p_coach_level;
  v_client_price := COALESCE(v_level_price, v_flat_price);

  v_discount_multiplier := 1.0 - (COALESCE(p_discount_percentage, 0) / 100.0);
  v_total := ROUND(v_client_price * v_discount_multiplier, 2);

  SELECT COALESCE(payment_processing_kwd + platform_cost_kwd + admin_overhead_kwd, 0)
    INTO v_igu_ops
  FROM igu_operations_costs WHERE service_id = p_target_service_id;
  v_igu_ops := COALESCE(v_igu_ops, 0);

  SELECT payout_kwd INTO v_coach_payout
  FROM coach_payout_rates
  WHERE service_id = p_target_service_id AND role = 'coach' AND level = p_coach_level;
  v_coach_payout := COALESCE(v_coach_payout, 0);
  IF v_discount_multiplier < 1.0 THEN
    v_coach_payout := ROUND(v_coach_payout * v_discount_multiplier, 2);
  END IF;

  v_igu_profit := v_total - v_coach_payout - v_igu_ops;

  IF v_service_type = 'team' THEN
    v_threshold := 2;
  ELSIF v_service_slug = 'one_to_one_online' THEN
    v_threshold := 3;
  ELSE
    v_threshold := 5;
  END IF;

  IF v_igu_profit < v_threshold THEN
    v_blocked := true;
    v_block_reason := format('IGU profit %.2f KWD below %.0f KWD minimum on %s',
                             v_igu_profit, v_threshold, v_service_slug);
  END IF;

  RETURN jsonb_build_object(
    'client_price', ROUND(v_client_price, 2),
    'coach_payout', ROUND(v_coach_payout, 2),
    'dietitian_payout', 0,
    'igu_ops', ROUND(v_igu_ops, 2),
    'igu_profit', ROUND(v_igu_profit, 2),
    'total', v_total,
    'coach_level', p_coach_level,
    'service_name', v_service_name,
    'service_slug', v_service_slug,
    'blocked', v_blocked,
    'block_reason', v_block_reason,
    'payment_exempt', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_subscription_change_payout(uuid, professional_level, numeric, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_subscription_change_payout(uuid, professional_level, numeric, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.preview_subscription_change_payout(uuid, professional_level, numeric, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.preview_subscription_change_payout(uuid, professional_level, numeric, boolean) TO service_role;
