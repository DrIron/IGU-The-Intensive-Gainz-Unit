-- Phase 0/F3 of addon-services Path B rebuild.
-- See docs/ADDON_SERVICES_BUILD_SPEC.md § 1 (F3) and § 4.
--
-- Adds the addon_payments table. Same shape and lifecycle as
-- subscription_payments -- one row per Tap charge, idempotency anchored on
-- tap_charge_id, status enum mirrors the subscription path.
--
-- Foreign keys land here (client_id ON DELETE RESTRICT -- financial rows
-- never CASCADE per CLAUDE.md). The addon_purchases.payment_id FK lands in
-- 20260524130200 as a nullable column; Phase 5 backfills and SET NOT NULL.
--
-- RLS: client reads own, admin full. Service role bypasses RLS for the
-- webhook write path.

CREATE TABLE public.addon_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount_kwd      NUMERIC(8,2) NOT NULL CHECK (amount_kwd >= 0),
  status          TEXT NOT NULL DEFAULT 'initiated'
                  CHECK (status IN ('initiated','paid','failed','refunded','voided')),
  tap_charge_id   TEXT,
  paid_at         TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  failure_reason  TEXT,
  refunded_at     TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT addon_payments_tap_charge_unique UNIQUE (tap_charge_id)
);

CREATE INDEX idx_addon_payments_client_status
  ON public.addon_payments (client_id, status);

CREATE INDEX idx_addon_payments_tap_charge
  ON public.addon_payments (tap_charge_id)
  WHERE tap_charge_id IS NOT NULL;

ALTER TABLE public.addon_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY addon_payments_client_read_own
  ON public.addon_payments
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = client_id);

CREATE POLICY addon_payments_admin_full
  ON public.addon_payments
  FOR ALL
  TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));
