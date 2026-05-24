-- Phase 0/F10 of addon-services Path B rebuild.
-- See docs/ADDON_SERVICES_BUILD_SPEC.md § 1 (F10).
--
-- Partial index for the hottest read path: "what active packs does this
-- client have?" used by SessionsTab and the upcoming purchase flow.
-- WHERE status = 'active' keeps the index narrow since most historical
-- rows will eventually be in terminal states.

CREATE INDEX IF NOT EXISTS idx_addon_purchases_active_by_client
  ON public.addon_purchases (client_id, expires_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_addon_purchases_payment
  ON public.addon_purchases (payment_id)
  WHERE payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_addon_purchases_not_deleted
  ON public.addon_purchases (client_id, status)
  WHERE deleted_at IS NULL;
