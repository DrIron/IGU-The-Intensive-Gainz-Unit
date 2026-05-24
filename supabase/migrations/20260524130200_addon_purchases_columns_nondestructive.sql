-- Phase 0/F1+F3+F6+F8 of addon-services Path B rebuild.
-- See docs/ADDON_SERVICES_BUILD_SPEC.md § 1 (F1, F3, F6, F8).
--
-- Non-destructive column additions on addon_purchases:
--   status (default pending_payment, populated by webhook + RPC)
--   payment_id (nullable in Phase 0 -- existing rows have no link; Phase 5
--     backfills then SET NOT NULL)
--   deleted_at (soft-delete column; replaces ON DELETE CASCADE on client_id
--     in Phase 5 -- delete-account updates this instead of DELETE)
--
-- CHECK constraints catch the financial bugs that current schema permits:
--   total_paid_kwd could go negative through partial-refund mismatch
--   quantity could be 0 (no row guard today)
--   discount_percentage could exceed the 30% cap enforced in
--     calculate_subscription_payout
--
-- Backfill: status = 'active' for any existing row with sessions_remaining > 0
-- and expires_at > now() (or NULL); 'expired' otherwise. Live row count is
-- expected to be 0 (catalog seeded, no purchases yet) -- the backfill is
-- defensive.

ALTER TABLE public.addon_purchases
  ADD COLUMN status     public.addon_purchase_status NOT NULL DEFAULT 'pending_payment',
  ADD COLUMN payment_id UUID REFERENCES public.addon_payments(id) ON DELETE RESTRICT,
  ADD COLUMN deleted_at TIMESTAMPTZ;

ALTER TABLE public.addon_purchases
  ADD CONSTRAINT addon_purchases_total_paid_nonneg
    CHECK (total_paid_kwd >= 0),
  ADD CONSTRAINT addon_purchases_quantity_positive
    CHECK (quantity >= 1),
  ADD CONSTRAINT addon_purchases_discount_range
    CHECK (discount_percentage >= 0 AND discount_percentage <= 30);

-- Defensive backfill -- production row count is 0 at write time; this
-- handles any future preview-branch state without manual intervention.
UPDATE public.addon_purchases
   SET status = CASE
     WHEN sessions_remaining IS NOT NULL
      AND sessions_remaining > 0
      AND (expires_at IS NULL OR expires_at > now())
     THEN 'active'::public.addon_purchase_status
     WHEN sessions_remaining = 0
     THEN 'consumed'::public.addon_purchase_status
     ELSE 'expired'::public.addon_purchase_status
   END
 WHERE status = 'pending_payment';

COMMENT ON COLUMN public.addon_purchases.status IS
  'Lifecycle state. Driven by tap-webhook (pending_payment -> active/voided), '
  'log_addon_session_atomic (active -> consumed), refund_addon_purchase '
  '(active -> refunded), and process-addon-expiries cron (active -> expired). '
  'Never written by frontend.';

COMMENT ON COLUMN public.addon_purchases.payment_id IS
  'FK to addon_payments. Nullable in Phase 0 only -- Phase 5 backfills + sets '
  'NOT NULL. Mandatory for new rows created via purchase_addon_atomic.';

COMMENT ON COLUMN public.addon_purchases.deleted_at IS
  'Soft-delete tombstone. delete-account sets this instead of DELETE to '
  'preserve financial reconciliation history (Phase 5 flips FK to RESTRICT).';
