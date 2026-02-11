-- Migration 4: Update Service Tiers
-- Adds slug column, creates 1:1 Complete tier, updates pricing

-- ============================================================
-- 1. ADD SLUG COLUMN TO SERVICES
-- ============================================================

ALTER TABLE services ADD COLUMN slug TEXT UNIQUE;

UPDATE services SET slug = 'team_fe_squad'      WHERE id = '4e842175-4e03-4170-8896-d90bf8cf6ca3';
UPDATE services SET slug = 'team_bunz'          WHERE id = '2f2a81a8-f9fa-40f6-a2df-aa383796e3b9';
UPDATE services SET slug = 'one_to_one_online'  WHERE id = '5edcae66-284c-482f-becd-f7bf28c3ff1e';
UPDATE services SET slug = 'hybrid'             WHERE id = '82a7d8b3-d592-45c7-9268-89f947d475a8';
UPDATE services SET slug = 'in_person'          WHERE id = '0583d990-3c96-48b7-86f2-8bc87344791d';

-- ============================================================
-- 2. CREATE 1:1 COMPLETE SERVICE (75 KWD)
-- ============================================================

INSERT INTO services (
  id, name, type, price_kwd, slug, description, features,
  is_active, includes_primary_coaching, includes_nutrition_support,
  includes_specialty_support, includes_physio_support
) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  '1:1 Complete',
  'one_to_one',
  75.00,
  'one_to_one_complete',
  'Personalized coaching with dedicated dietitian support',
  ARRAY['Custom workout plans', 'Nutrition guidance with dedicated dietitian', 'Weekly check-ins', '24/7 messaging support', 'Macro planning & adjustments'],
  true,
  true,
  true,
  false,
  false
);

INSERT INTO service_pricing (service_id, price_kwd, billing_mode, is_active)
VALUES ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 75.00, 'manual', true);

-- ============================================================
-- 3. ADD HOUR ESTIMATES FOR 1:1 COMPLETE
-- ============================================================

INSERT INTO service_hour_estimates (service_id, role, work_type, estimated_hours) VALUES
  ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'coach', 'online', 5),
  ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'dietitian', 'online', 4);

-- ============================================================
-- 4. ADD IGU OPS COSTS FOR 1:1 COMPLETE
-- ============================================================

INSERT INTO igu_operations_costs (service_id, payment_processing_kwd, platform_cost_kwd, admin_overhead_kwd)
VALUES ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 2.3, 2.7, 0);

-- ============================================================
-- 5. UPDATE EXISTING SERVICE PRICES
-- ============================================================

-- 1:1 Online: 50 → 40 KWD
UPDATE services SET price_kwd = 40.00, updated_at = now()
WHERE id = '5edcae66-284c-482f-becd-f7bf28c3ff1e';

UPDATE service_pricing SET price_kwd = 40.00, updated_at = now()
WHERE service_id = '5edcae66-284c-482f-becd-f7bf28c3ff1e';

-- 1:1 Hybrid: 175 → 150 KWD
UPDATE services SET price_kwd = 150.00, updated_at = now()
WHERE id = '82a7d8b3-d592-45c7-9268-89f947d475a8';

UPDATE service_pricing SET price_kwd = 150.00, updated_at = now()
WHERE service_id = '82a7d8b3-d592-45c7-9268-89f947d475a8';

-- Update IGU ops costs for repriced tiers (payment processing ~3%)
UPDATE igu_operations_costs
SET payment_processing_kwd = 1.2, updated_at = now()
WHERE service_id = '5edcae66-284c-482f-becd-f7bf28c3ff1e';

UPDATE igu_operations_costs
SET payment_processing_kwd = 4.5, updated_at = now()
WHERE service_id = '82a7d8b3-d592-45c7-9268-89f947d475a8';
