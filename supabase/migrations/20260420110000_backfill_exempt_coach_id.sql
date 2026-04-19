-- =========================================================================
-- Backfill subscriptions.coach_id for payment-exempt clients.
--
-- Root cause (audit B7):
--   AdminBillingManager.handleTogglePaymentExempt activated a sub and set
--   profiles_public.payment_exempt=true, but never assigned coach_id. The
--   parallel create-manual-client edge function DOES assign to the IGU
--   admin coach (driron.admin@theigu.com). Result: exempt clients toggled
--   via the admin UI ended up with coach_id=NULL, flagging as orphans on
--   /admin/health.
--
-- Fix: this migration applies the same assignment the admin UI should have
-- made. The code fix for future toggles ships alongside in AdminBillingManager.
--
-- Idempotent: only touches rows that are still NULL. Safe to re-run.
-- =========================================================================

UPDATE public.subscriptions s
SET coach_id = c.user_id,
    updated_at = now()
FROM public.coaches c, public.profiles_public p
WHERE s.coach_id IS NULL
  AND s.user_id = p.id
  AND p.payment_exempt = true
  AND c.email = 'driron.admin@theigu.com'
  AND c.status = 'approved';

-- Sanity check: surface any remaining orphans (payment-exempt, no coach).
-- This SELECT is a no-op -- just documents how to audit after apply.
--   SELECT s.id, p.id AS user_id, p.payment_exempt
--   FROM public.subscriptions s
--   JOIN public.profiles_public p ON p.id = s.user_id
--   WHERE s.coach_id IS NULL AND p.payment_exempt = true;
