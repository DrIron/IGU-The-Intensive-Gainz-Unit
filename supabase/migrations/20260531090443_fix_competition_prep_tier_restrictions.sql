-- Seed-bug fix surfaced by Phase 3 client catalog (docs/ADDON_SERVICES_BUILD_SPEC.md).
--
-- The original seed in 20260211073308_add_addon_services_system.sql wrote
--   tier_restrictions = ARRAY['complete', 'hybrid', 'in_person']
-- for the Competition Prep Add-On row.
--
-- The actual services.slug values (from 20260211073338_update_service_tiers.sql)
-- are 'one_to_one_complete', 'hybrid', 'in_person'. The 'complete' shorthand
-- never existed as a slug, so both purchase_addon_atomic (F5 check in
-- 20260524140100) and the new create-tap-addon-payment edge function reject
-- every Competition Prep purchase for users on the Complete tier with
-- "requires complete, hybrid, in_person" -- nonsense from the user's POV.
--
-- Fix: replace 'complete' with the canonical 'one_to_one_complete' slug.
-- Other two slugs already match.

UPDATE addon_services
SET tier_restrictions = ARRAY['one_to_one_complete', 'hybrid', 'in_person']
WHERE name = 'Competition Prep Add-On'
  AND tier_restrictions = ARRAY['complete', 'hybrid', 'in_person'];
