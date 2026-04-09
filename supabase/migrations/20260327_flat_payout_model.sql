-- Migration: Flat per-client payout model (replaces hourly rate × hours system)
-- Date: 2026-03-27
--
-- Simplifies compensation from hourly_rate × estimated_hours × work_type
-- to a single flat KWD amount per client per month per service per level.
--
-- Coach take-home targets:
--   Junior: ~50% | Senior: ~65% | Lead: ~85% (of client price)
-- Head Coach Team Plan: flat 7 KWD/member/month
-- IGU minimum profit: 3 KWD (team/online), 5 KWD (premium tiers)

-- 1. Create flat payout lookup table
CREATE TABLE IF NOT EXISTS coach_payout_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES services(id),
  role TEXT NOT NULL CHECK (role IN ('coach', 'dietitian')),
  level professional_level NOT NULL DEFAULT 'junior',
  payout_kwd NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(service_id, role, level)
);

ALTER TABLE coach_payout_rates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access on coach_payout_rates' AND tablename = 'coach_payout_rates') THEN
    CREATE POLICY "Admin full access on coach_payout_rates" ON coach_payout_rates FOR ALL USING (public.is_admin(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated read coach_payout_rates' AND tablename = 'coach_payout_rates') THEN
    CREATE POLICY "Authenticated read coach_payout_rates" ON coach_payout_rates FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- 2. Seed payout rates
-- Team Plan (head coach flat, same for all levels)
INSERT INTO coach_payout_rates (service_id, role, level, payout_kwd) VALUES
  ('ff9cbde9-7db7-45e9-b13e-de6348c07042', 'coach', 'junior', 7),
  ('ff9cbde9-7db7-45e9-b13e-de6348c07042', 'coach', 'senior', 7),
  ('ff9cbde9-7db7-45e9-b13e-de6348c07042', 'coach', 'lead', 7)
ON CONFLICT (service_id, role, level) DO UPDATE SET payout_kwd = EXCLUDED.payout_kwd;

-- 1:1 Online (coach only, no dietitian)
INSERT INTO coach_payout_rates (service_id, role, level, payout_kwd) VALUES
  ('5edcae66-284c-482f-becd-f7bf28c3ff1e', 'coach', 'junior', 20),
  ('5edcae66-284c-482f-becd-f7bf28c3ff1e', 'coach', 'senior', 26),
  ('5edcae66-284c-482f-becd-f7bf28c3ff1e', 'coach', 'lead', 34)
ON CONFLICT (service_id, role, level) DO UPDATE SET payout_kwd = EXCLUDED.payout_kwd;

-- 1:1 Complete (coach + dietitian)
INSERT INTO coach_payout_rates (service_id, role, level, payout_kwd) VALUES
  ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'coach', 'junior', 20),
  ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'coach', 'senior', 26),
  ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'coach', 'lead', 34),
  ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'dietitian', 'junior', 15),
  ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'dietitian', 'senior', 20),
  ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'dietitian', 'lead', 20)
ON CONFLICT (service_id, role, level) DO UPDATE SET payout_kwd = EXCLUDED.payout_kwd;

-- Hybrid (coach + dietitian)
INSERT INTO coach_payout_rates (service_id, role, level, payout_kwd) VALUES
  ('82a7d8b3-d592-45c7-9268-89f947d475a8', 'coach', 'junior', 60),
  ('82a7d8b3-d592-45c7-9268-89f947d475a8', 'coach', 'senior', 80),
  ('82a7d8b3-d592-45c7-9268-89f947d475a8', 'coach', 'lead', 105),
  ('82a7d8b3-d592-45c7-9268-89f947d475a8', 'dietitian', 'junior', 15),
  ('82a7d8b3-d592-45c7-9268-89f947d475a8', 'dietitian', 'senior', 20),
  ('82a7d8b3-d592-45c7-9268-89f947d475a8', 'dietitian', 'lead', 20)
ON CONFLICT (service_id, role, level) DO UPDATE SET payout_kwd = EXCLUDED.payout_kwd;

-- In-Person (coach + dietitian)
INSERT INTO coach_payout_rates (service_id, role, level, payout_kwd) VALUES
  ('0583d990-3c96-48b7-86f2-8bc87344791d', 'coach', 'junior', 105),
  ('0583d990-3c96-48b7-86f2-8bc87344791d', 'coach', 'senior', 140),
  ('0583d990-3c96-48b7-86f2-8bc87344791d', 'coach', 'lead', 185),
  ('0583d990-3c96-48b7-86f2-8bc87344791d', 'dietitian', 'junior', 15),
  ('0583d990-3c96-48b7-86f2-8bc87344791d', 'dietitian', 'senior', 20),
  ('0583d990-3c96-48b7-86f2-8bc87344791d', 'dietitian', 'lead', 20)
ON CONFLICT (service_id, role, level) DO UPDATE SET payout_kwd = EXCLUDED.payout_kwd;

-- 3. Add missing Team Plan service_pricing (12 KWD)
INSERT INTO service_pricing (service_id, price_kwd, billing_mode, is_active)
VALUES ('ff9cbde9-7db7-45e9-b13e-de6348c07042', 12.00, 'recurring', true)
ON CONFLICT DO NOTHING;

-- 4. Add missing Team Plan ops cost
INSERT INTO igu_operations_costs (service_id, payment_processing_kwd, platform_cost_kwd, admin_overhead_kwd)
VALUES ('ff9cbde9-7db7-45e9-b13e-de6348c07042', 0.40, 1.60, 0.00)
ON CONFLICT DO NOTHING;

-- 5. Rewrite payout RPC to use flat lookup (no hourly calculations)
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
  v_client_price NUMERIC;
  v_coach_id UUID;
  v_coach_level professional_level;
  v_dietitian_id UUID;
  v_dietitian_level professional_level;
  v_coach_payout NUMERIC;
  v_diet_payout NUMERIC;
  v_igu_ops NUMERIC;
  v_igu_profit NUMERIC;
  v_discount_multiplier NUMERIC;
  v_total NUMERIC;
  v_blocked BOOLEAN := false;
  v_block_reason TEXT;
BEGIN
  -- 1. Look up subscription details
  SELECT s.service_id, s.coach_id, sp.price_kwd, srv.slug, srv.type
  INTO v_service_id, v_coach_id, v_client_price, v_service_slug, v_service_type
  FROM subscriptions s
  JOIN services srv ON srv.id = s.service_id
  JOIN service_pricing sp ON sp.service_id = srv.id
  WHERE s.id = p_subscription_id;

  IF v_service_id IS NULL THEN
    RETURN jsonb_build_object('blocked', true, 'block_reason', 'Subscription not found');
  END IF;

  v_discount_multiplier := 1.0 - (COALESCE(p_discount_percentage, 0) / 100.0);
  v_total := ROUND(v_client_price * v_discount_multiplier, 2);

  -- 2. Get IGU ops (fixed, never discounted)
  SELECT COALESCE(payment_processing_kwd + platform_cost_kwd + admin_overhead_kwd, 0)
  INTO v_igu_ops
  FROM igu_operations_costs WHERE service_id = v_service_id;
  v_igu_ops := COALESCE(v_igu_ops, 0);

  -- 3. Get coach level
  SELECT cp.coach_level INTO v_coach_level
  FROM coaches_public cp WHERE cp.user_id = v_coach_id;
  v_coach_level := COALESCE(v_coach_level, 'junior');

  -- 4. Flat coach payout from lookup
  SELECT payout_kwd INTO v_coach_payout
  FROM coach_payout_rates
  WHERE service_id = v_service_id AND role = 'coach' AND level = v_coach_level;
  v_coach_payout := COALESCE(v_coach_payout, 0);

  -- 5. Dietitian payout (if assigned)
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

  -- 6. Apply discount proportionally (ops never discounted)
  IF v_discount_multiplier < 1.0 THEN
    v_coach_payout := ROUND(v_coach_payout * v_discount_multiplier, 2);
    v_diet_payout := ROUND(v_diet_payout * v_discount_multiplier, 2);
  END IF;

  -- 7. IGU profit
  v_igu_profit := v_total - v_coach_payout - v_diet_payout - v_igu_ops;

  -- 8. Guardrail: 3 KWD min for team/online, 5 KWD for premium
  IF v_service_type = 'team' OR v_service_slug = 'one_to_one_online' THEN
    IF v_igu_profit < 3 THEN
      v_blocked := true;
      v_block_reason := format('IGU profit %.2f KWD below 3 KWD minimum on %s', v_igu_profit, v_service_slug);
    END IF;
  ELSE
    IF v_igu_profit < 5 THEN
      v_blocked := true;
      v_block_reason := format('IGU profit %.2f KWD below 5 KWD minimum on %s', v_igu_profit, v_service_slug);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'coach_payout', ROUND(v_coach_payout, 2),
    'dietitian_payout', ROUND(v_diet_payout, 2),
    'igu_ops', ROUND(v_igu_ops, 2),
    'igu_profit', ROUND(v_igu_profit, 2),
    'total', v_total,
    'blocked', v_blocked,
    'block_reason', v_block_reason
  );
END;
$$;
