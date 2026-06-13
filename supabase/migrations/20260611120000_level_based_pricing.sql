-- Migration: Level-based client pricing (Junior / Senior / Lead) + new per-level payouts
-- Date: 2026-06-11
--
-- See business-planning/PRICING_UPDATE_HANDOFF.md.
--
-- WHAT THIS DOES
--   1. New canonical table service_level_pricing(service_id, coach_level) -> price_kwd.
--      The amount a client is charged now depends on the assigned coach's level.
--   2. Keeps services.price_kwd + service_pricing.price_kwd as the public "from"
--      (junior) display price -- a derived mirror, NOT the charge source of truth.
--   3. New per-level coach payouts in coach_payout_rates (funded by the level prices).
--   4. Provisional per-service ops costs (admin-editable; validate vs Tap's real fee).
--   5. Retires one_to_one_complete (soft: is_active=false; existing subs grandfathered).
--   6. subscriptions.client_price_kwd + coach_level_at_purchase -- records what was charged.
--   7. Rewrites calculate_subscription_payout + coach_assignment_would_block to resolve
--      price by level, and lowers the Team min-IGU-profit floor 3 -> 2 (Team keep is 2).
--   8. New get_subscription_price_quote RPC for the confirm-at-checkout step (Build B).
--
-- Service UUIDs (from 20260211073338 / 20260327):
--   team_plan          ff9cbde9-7db7-45e9-b13e-de6348c07042
--   one_to_one_online  5edcae66-284c-482f-becd-f7bf28c3ff1e
--   one_to_one_complete a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d  (RETIRED here)
--   hybrid             82a7d8b3-d592-45c7-9268-89f947d475a8
--   in_person          0583d990-3c96-48b7-86f2-8bc87344791d

-- ============================================================
-- 1. service_level_pricing -- canonical per-(service, level) charge price
-- ============================================================

CREATE TABLE IF NOT EXISTS public.service_level_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  coach_level professional_level NOT NULL DEFAULT 'junior',
  price_kwd NUMERIC NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE (service_id, coach_level)
);

ALTER TABLE public.service_level_pricing ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access on service_level_pricing' AND tablename = 'service_level_pricing') THEN
    CREATE POLICY "Admin full access on service_level_pricing"
      ON public.service_level_pricing FOR ALL
      TO authenticated
      USING (public.is_admin(auth.uid()))
      WITH CHECK (public.is_admin(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated read service_level_pricing' AND tablename = 'service_level_pricing') THEN
    CREATE POLICY "Authenticated read service_level_pricing"
      ON public.service_level_pricing FOR SELECT
      TO authenticated USING (true);
  END IF;
END $$;

-- 1a. Seed level prices. Team Plan is level-invariant (10 KWD for all levels).
INSERT INTO public.service_level_pricing (service_id, coach_level, price_kwd) VALUES
  ('ff9cbde9-7db7-45e9-b13e-de6348c07042', 'junior', 10),
  ('ff9cbde9-7db7-45e9-b13e-de6348c07042', 'senior', 10),
  ('ff9cbde9-7db7-45e9-b13e-de6348c07042', 'lead',   10),
  ('5edcae66-284c-482f-becd-f7bf28c3ff1e', 'junior', 30),
  ('5edcae66-284c-482f-becd-f7bf28c3ff1e', 'senior', 35),
  ('5edcae66-284c-482f-becd-f7bf28c3ff1e', 'lead',   40),
  ('82a7d8b3-d592-45c7-9268-89f947d475a8', 'junior', 95),
  ('82a7d8b3-d592-45c7-9268-89f947d475a8', 'senior', 110),
  ('82a7d8b3-d592-45c7-9268-89f947d475a8', 'lead',   125),
  ('0583d990-3c96-48b7-86f2-8bc87344791d', 'junior', 145),
  ('0583d990-3c96-48b7-86f2-8bc87344791d', 'senior', 175),
  ('0583d990-3c96-48b7-86f2-8bc87344791d', 'lead',   215)
ON CONFLICT (service_id, coach_level) DO UPDATE SET price_kwd = EXCLUDED.price_kwd, updated_at = now();

-- ============================================================
-- 2. "From" / display price mirror (junior price) on services + service_pricing
--    Read by the public Services page + ServiceCard. Charge source of truth is
--    service_level_pricing above.
-- ============================================================

-- Team Plan 12 -> 10
UPDATE public.services       SET price_kwd = 10, updated_at = now() WHERE id = 'ff9cbde9-7db7-45e9-b13e-de6348c07042';
UPDATE public.service_pricing SET price_kwd = 10, updated_at = now() WHERE service_id = 'ff9cbde9-7db7-45e9-b13e-de6348c07042';

-- 1:1 Online from 30
UPDATE public.services       SET price_kwd = 30, updated_at = now() WHERE id = '5edcae66-284c-482f-becd-f7bf28c3ff1e';
UPDATE public.service_pricing SET price_kwd = 30, updated_at = now() WHERE service_id = '5edcae66-284c-482f-becd-f7bf28c3ff1e';

-- Hybrid from 95
UPDATE public.services       SET price_kwd = 95, updated_at = now() WHERE id = '82a7d8b3-d592-45c7-9268-89f947d475a8';
UPDATE public.service_pricing SET price_kwd = 95, updated_at = now() WHERE service_id = '82a7d8b3-d592-45c7-9268-89f947d475a8';

-- In-Person from 145
UPDATE public.services       SET price_kwd = 145, updated_at = now() WHERE id = '0583d990-3c96-48b7-86f2-8bc87344791d';
UPDATE public.service_pricing SET price_kwd = 145, updated_at = now() WHERE service_id = '0583d990-3c96-48b7-86f2-8bc87344791d';

-- ============================================================
-- 3. New per-level coach payouts (coach role). Dietitian rows left untouched --
--    dietitian/physio add-on pricing is OUT of scope (blocked on MOH legal).
-- ============================================================

INSERT INTO public.coach_payout_rates (service_id, role, level, payout_kwd) VALUES
  ('ff9cbde9-7db7-45e9-b13e-de6348c07042', 'coach', 'junior', 6),
  ('ff9cbde9-7db7-45e9-b13e-de6348c07042', 'coach', 'senior', 6),
  ('ff9cbde9-7db7-45e9-b13e-de6348c07042', 'coach', 'lead',   6),
  ('5edcae66-284c-482f-becd-f7bf28c3ff1e', 'coach', 'junior', 17),
  ('5edcae66-284c-482f-becd-f7bf28c3ff1e', 'coach', 'senior', 24),
  ('5edcae66-284c-482f-becd-f7bf28c3ff1e', 'coach', 'lead',   30),
  ('82a7d8b3-d592-45c7-9268-89f947d475a8', 'coach', 'junior', 70),
  ('82a7d8b3-d592-45c7-9268-89f947d475a8', 'coach', 'senior', 88),
  ('82a7d8b3-d592-45c7-9268-89f947d475a8', 'coach', 'lead',   105),
  ('0583d990-3c96-48b7-86f2-8bc87344791d', 'coach', 'junior', 107),
  ('0583d990-3c96-48b7-86f2-8bc87344791d', 'coach', 'senior', 141),
  ('0583d990-3c96-48b7-86f2-8bc87344791d', 'coach', 'lead',   183)
ON CONFLICT (service_id, role, level) DO UPDATE SET payout_kwd = EXCLUDED.payout_kwd, updated_at = now();

-- ============================================================
-- 4. Provisional per-service ops costs (admin-editable). PROVISIONAL --
--    validate payment_processing_kwd against Tap's real fee before treating as final.
--    Totals: Team 2, Online 3, Hybrid 5, In-Person 8.
-- ============================================================

UPDATE public.igu_operations_costs SET payment_processing_kwd = 0.40, platform_cost_kwd = 1.60, admin_overhead_kwd = 0, updated_at = now()
  WHERE service_id = 'ff9cbde9-7db7-45e9-b13e-de6348c07042';
UPDATE public.igu_operations_costs SET payment_processing_kwd = 1.00, platform_cost_kwd = 2.00, admin_overhead_kwd = 0, updated_at = now()
  WHERE service_id = '5edcae66-284c-482f-becd-f7bf28c3ff1e';
UPDATE public.igu_operations_costs SET payment_processing_kwd = 3.00, platform_cost_kwd = 2.00, admin_overhead_kwd = 0, updated_at = now()
  WHERE service_id = '82a7d8b3-d592-45c7-9268-89f947d475a8';
UPDATE public.igu_operations_costs SET payment_processing_kwd = 5.00, platform_cost_kwd = 3.00, admin_overhead_kwd = 0, updated_at = now()
  WHERE service_id = '0583d990-3c96-48b7-86f2-8bc87344791d';

-- ============================================================
-- 5. Retire 1:1 Complete (soft). Existing subscriptions are grandfathered:
--    its service_pricing (75) + coach_payout_rates rows are intentionally LEFT so
--    calculate_subscription_payout still resolves a price for active Complete subs.
-- ============================================================

UPDATE public.services SET is_active = false, updated_at = now()
  WHERE id = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' AND is_active = true;

-- ============================================================
-- 6. subscriptions: record what was actually charged
-- ============================================================

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS client_price_kwd NUMERIC;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS coach_level_at_purchase professional_level;

COMMENT ON COLUMN public.subscriptions.client_price_kwd IS
  'List price (pre-discount) charged for this subscription, resolved by coach level at charge time. Written by create-tap-payment.';
COMMENT ON COLUMN public.subscriptions.coach_level_at_purchase IS
  'Assigned coach professional_level at charge time -- frozen so later level changes do not re-price the audit trail.';

-- ============================================================
-- 7. Rewrite calculate_subscription_payout -- level-aware price + Team floor 2
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculate_subscription_payout(
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
  v_stored_price NUMERIC;
  v_level_price NUMERIC;
  v_flat_price NUMERIC;
  v_client_price NUMERIC;
  v_coach_id UUID;
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
  -- 1. Subscription + service + flat ("from") price + what-was-charged audit fields
  SELECT s.service_id, s.coach_id, s.client_price_kwd, s.coach_level_at_purchase,
         sp.price_kwd, srv.slug, srv.type
  INTO v_service_id, v_coach_id, v_stored_price, v_stored_level,
       v_flat_price, v_service_slug, v_service_type
  FROM subscriptions s
  JOIN services srv ON srv.id = s.service_id
  JOIN service_pricing sp ON sp.service_id = srv.id
  WHERE s.id = p_subscription_id;

  IF v_service_id IS NULL THEN
    RETURN jsonb_build_object('blocked', true, 'block_reason', 'Subscription not found');
  END IF;

  -- 2. Resolve coach level: prefer the level frozen at purchase, else current level.
  SELECT cp.coach_level INTO v_coach_level
  FROM coaches_public cp WHERE cp.user_id = v_coach_id;
  v_coach_level := COALESCE(v_stored_level, v_coach_level, 'junior');

  -- 3. Client price: what was charged > level price > flat ("from") fallback.
  --    Flat fallback grandfathers retired services (e.g. one_to_one_complete) that
  --    have no service_level_pricing rows.
  SELECT slp.price_kwd INTO v_level_price
  FROM service_level_pricing slp
  WHERE slp.service_id = v_service_id AND slp.coach_level = v_coach_level;
  v_client_price := COALESCE(v_stored_price, v_level_price, v_flat_price);

  v_discount_multiplier := 1.0 - (COALESCE(p_discount_percentage, 0) / 100.0);
  v_total := ROUND(v_client_price * v_discount_multiplier, 2);

  -- 4. IGU ops (fixed, never discounted)
  SELECT COALESCE(payment_processing_kwd + platform_cost_kwd + admin_overhead_kwd, 0)
  INTO v_igu_ops
  FROM igu_operations_costs WHERE service_id = v_service_id;
  v_igu_ops := COALESCE(v_igu_ops, 0);

  -- 5. Flat coach payout from lookup
  SELECT payout_kwd INTO v_coach_payout
  FROM coach_payout_rates
  WHERE service_id = v_service_id AND role = 'coach' AND level = v_coach_level;
  v_coach_payout := COALESCE(v_coach_payout, 0);

  -- 6. Dietitian payout (if assigned via care team)
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

  -- 7. Apply discount proportionally (ops never discounted)
  IF v_discount_multiplier < 1.0 THEN
    v_coach_payout := ROUND(v_coach_payout * v_discount_multiplier, 2);
    v_diet_payout := ROUND(v_diet_payout * v_discount_multiplier, 2);
  END IF;

  -- 8. IGU profit
  v_igu_profit := v_total - v_coach_payout - v_diet_payout - v_igu_ops;

  -- 9. Guardrail: min IGU profit -- Team 2, 1:1 Online 3, premium tiers 5.
  --    (Team floor lowered 3 -> 2 because the new Team economics intentionally keep 2.)
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
    'block_reason', v_block_reason
  );
END;
$$;

-- ============================================================
-- 8. Rewrite coach_assignment_would_block -- price by candidate level + Team floor 2
-- ============================================================

CREATE OR REPLACE FUNCTION public.coach_assignment_would_block(
  p_coach_user_id uuid,
  p_service_id    uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_slug   text;
  v_service_type   text;
  v_client_price   numeric;
  v_level_price    numeric;
  v_flat_price     numeric;
  v_coach_level    professional_level;
  v_coach_payout   numeric;
  v_igu_ops        numeric;
  v_igu_profit     numeric;
  v_threshold      numeric;
BEGIN
  SELECT srv.slug, srv.type, sp.price_kwd
    INTO v_service_slug, v_service_type, v_flat_price
  FROM public.services srv
  JOIN public.service_pricing sp ON sp.service_id = srv.id
  WHERE srv.id = p_service_id;

  SELECT COALESCE(cp.coach_level, 'junior') INTO v_coach_level
  FROM public.coaches_public cp
  WHERE cp.user_id = p_coach_user_id;
  v_coach_level := COALESCE(v_coach_level, 'junior');

  -- Resolve the price for THIS coach's level (not the flat "from" price).
  SELECT slp.price_kwd INTO v_level_price
  FROM public.service_level_pricing slp
  WHERE slp.service_id = p_service_id AND slp.coach_level = v_coach_level;
  v_client_price := COALESCE(v_level_price, v_flat_price);

  IF v_client_price IS NULL THEN
    -- No price set -- treat as non-blocking, let downstream calc surface it.
    RETURN false;
  END IF;

  SELECT COALESCE(payout_kwd, 0) INTO v_coach_payout
  FROM public.coach_payout_rates
  WHERE service_id = p_service_id
    AND role = 'coach'
    AND level = v_coach_level;
  v_coach_payout := COALESCE(v_coach_payout, 0);

  SELECT COALESCE(payment_processing_kwd + platform_cost_kwd + admin_overhead_kwd, 0)
    INTO v_igu_ops
  FROM public.igu_operations_costs
  WHERE service_id = p_service_id;
  v_igu_ops := COALESCE(v_igu_ops, 0);

  -- No dietitian at signup -- compute IGU profit as if coach-only.
  v_igu_profit := v_client_price - v_coach_payout - v_igu_ops;

  -- Match the threshold logic in calculate_subscription_payout.
  IF v_service_type = 'team' THEN
    v_threshold := 2;
  ELSIF v_service_slug = 'one_to_one_online' THEN
    v_threshold := 3;
  ELSE
    v_threshold := 5;
  END IF;

  RETURN v_igu_profit < v_threshold;
END;
$$;

-- ============================================================
-- 9. get_subscription_price_quote -- confirm-at-checkout (Build B)
--    Resolves the price the caller's OWN subscription will be charged, plus the
--    assigned coach + level, so the payment screen can show + confirm it pre-charge.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_subscription_price_quote(
  p_subscription_id uuid
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid;
  v_service_id   uuid;
  v_service_name text;
  v_service_slug text;
  v_coach_id     uuid;
  v_coach_level  professional_level;
  v_coach_name   text;
  v_level_price  numeric;
  v_flat_price   numeric;
  v_price        numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT s.user_id, s.service_id, s.coach_id, srv.name, srv.slug, sp.price_kwd
    INTO v_user_id, v_service_id, v_coach_id, v_service_name, v_service_slug, v_flat_price
  FROM subscriptions s
  JOIN services srv ON srv.id = s.service_id
  JOIN service_pricing sp ON sp.service_id = srv.id
  WHERE s.id = p_subscription_id;

  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'subscription not found' USING ERRCODE = 'P0002';
  END IF;

  -- Caller must own the subscription (or be admin).
  IF v_user_id <> auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized for this subscription' USING ERRCODE = '42501';
  END IF;

  SELECT cp.coach_level,
         COALESCE(NULLIF(TRIM(cp.nickname), ''), TRIM(cp.first_name || ' ' || COALESCE(cp.last_name, '')))
    INTO v_coach_level, v_coach_name
  FROM coaches_public cp
  WHERE cp.user_id = v_coach_id;
  v_coach_level := COALESCE(v_coach_level, 'junior');

  SELECT slp.price_kwd INTO v_level_price
  FROM service_level_pricing slp
  WHERE slp.service_id = v_service_id AND slp.coach_level = v_coach_level;
  v_price := COALESCE(v_level_price, v_flat_price);

  RETURN jsonb_build_object(
    'price_kwd', ROUND(v_price, 2),
    'coach_level', v_coach_level,
    'coach_display_name', v_coach_name,
    'coach_assigned', v_coach_id IS NOT NULL,
    'service_name', v_service_name,
    'service_slug', v_service_slug
  );
END;
$$;

-- ============================================================
-- 10. Grants (REVOKE-from-anon pattern). Wrapped in DO/EXECUTE per the documented
--     `db push` 42601 dollar-quote-splitter gotcha for REVOKE/GRANT runs.
-- ============================================================

DO $grants$ BEGIN
  -- calculate_subscription_payout: authenticated (CoachCompensationCard) + service_role
  EXECUTE 'REVOKE ALL ON FUNCTION public.calculate_subscription_payout(p_subscription_id uuid, p_discount_percentage numeric) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.calculate_subscription_payout(p_subscription_id uuid, p_discount_percentage numeric) FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.calculate_subscription_payout(p_subscription_id uuid, p_discount_percentage numeric) TO authenticated, service_role';

  -- coach_assignment_would_block: service_role only (called inside assign_coach_atomic)
  EXECUTE 'REVOKE ALL ON FUNCTION public.coach_assignment_would_block(p_coach_user_id uuid, p_service_id uuid) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.coach_assignment_would_block(p_coach_user_id uuid, p_service_id uuid) FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.coach_assignment_would_block(p_coach_user_id uuid, p_service_id uuid) TO service_role';

  -- get_subscription_price_quote: authenticated (client confirms own quote) + service_role
  EXECUTE 'REVOKE ALL ON FUNCTION public.get_subscription_price_quote(p_subscription_id uuid) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.get_subscription_price_quote(p_subscription_id uuid) FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_subscription_price_quote(p_subscription_id uuid) TO authenticated, service_role';
END $grants$;
