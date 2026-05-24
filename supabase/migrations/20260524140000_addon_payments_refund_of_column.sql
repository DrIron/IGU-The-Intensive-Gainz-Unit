-- Phase 1 of addon-services Path B rebuild.
-- See docs/ADDON_SERVICES_BUILD_SPEC.md § 2 (refund_addon_purchase RPC).
--
-- Adds the refund_of self-FK on addon_payments. A refund row points back to
-- the original payment it refunds; original rows have refund_of IS NULL.
-- Lets Tap-side reconciliation join refunds to originals without heuristics
-- and unblocks the Phase 2 tap-webhook REFUNDED branch (which needs to find
-- the original purchase from the refund webhook payload).
--
-- Index is partial on refund_of IS NOT NULL because the vast majority of
-- rows are originals (one refund per dozens of purchases in normal flow).

ALTER TABLE public.addon_payments
  ADD COLUMN refund_of UUID
  REFERENCES public.addon_payments(id) ON DELETE RESTRICT;

CREATE INDEX idx_addon_payments_refund_of
  ON public.addon_payments (refund_of)
  WHERE refund_of IS NOT NULL;

COMMENT ON COLUMN public.addon_payments.refund_of IS
  'Self-FK pointing to the original payment this row refunds. NULL for '
  'original payments; populated by refund_addon_purchase RPC when creating '
  'a refund row. Lets Tap reconciliation join refunds to originals.';
