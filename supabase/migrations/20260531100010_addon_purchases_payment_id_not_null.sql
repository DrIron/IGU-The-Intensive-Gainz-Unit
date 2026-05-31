-- Phase 5B / F3 of addon-services Path B rebuild.
-- See docs/ADDON_SERVICES_BUILD_SPEC.md § 1 (F3) + § 5 (Phase 5).
--
-- payment_id has been mandatory in the RPC signature (p_payment_id NOT
-- NULL parameter) since Phase 1. Pre-apply drift check confirmed 0 NULLs.
-- This adds the structural backstop -- no legitimate "free addon" path;
-- admin-comped packs go through a total_paid_kwd=0 row in addon_payments
-- and still get a payment_id FK.

ALTER TABLE public.addon_purchases
  ALTER COLUMN payment_id SET NOT NULL;
