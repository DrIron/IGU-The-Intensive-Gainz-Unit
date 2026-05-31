-- Phase 5B / F4 of addon-services Path B rebuild.
-- See docs/ADDON_SERVICES_BUILD_SPEC.md § 1 (F4) + § 5 (Phase 5).
--
-- purchase_addon_atomic has always computed expires_at unconditionally
-- (purchased_at + svc.pack_expiry_months * interval '1 month'), so every
-- live row has a non-NULL value. Pre-apply drift check confirmed 0 NULLs.
-- Pin the column structurally + add the invariant CHECK so future writers
-- (if any ever bypass the RPC) cannot regress.

ALTER TABLE public.addon_purchases
  ALTER COLUMN expires_at SET NOT NULL,
  ADD CONSTRAINT addon_purchases_expires_after_purchase
    CHECK (expires_at > purchased_at);
