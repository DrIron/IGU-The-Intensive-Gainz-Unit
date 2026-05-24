-- Phase 1 of addon-services Path B rebuild.
-- See docs/ADDON_SERVICES_BUILD_SPEC.md § 2 (purchase_addon_atomic idempotency).
--
-- Enforces 1:1 between addon_payments and addon_purchases. A single Tap
-- charge funds one purchase. UNIQUE on a nullable column still allows
-- multiple NULL rows (Postgres treats NULLs as distinct), so this is safe
-- while Phase 0 backfill is in progress -- non-NULL values must be unique
-- from day 1.
--
-- This is the database-level guard for purchase_addon_atomic's idempotency
-- check (replayed webhooks would otherwise create duplicate purchases).

ALTER TABLE public.addon_purchases
  ADD CONSTRAINT addon_purchases_payment_id_unique UNIQUE (payment_id);
