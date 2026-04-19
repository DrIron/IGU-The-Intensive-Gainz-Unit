-- =========================================================================
-- Backfill subscriptions.coach_id for payment-exempt clients.
--
-- Root cause (audit B7):
--   AdminBillingManager.handleTogglePaymentExempt activated a sub and set
--   profiles_public.payment_exempt=true, but never assigned coach_id. The
--   parallel create-manual-client edge function intended to assign to the
--   IGU admin coach (dr.ironofficial@gmail.com) but queried coaches.email,
--   which was dropped by migration 20260117164058 when contact info moved
--   to coaches_private. Net result: exempt clients ended up with
--   coach_id=NULL, flagging as orphans on /admin/health.
--
-- This migration performs the backfill the admin UI should have made.
-- The code fix for future toggles ships alongside in AdminBillingManager.
-- Email lookup joins coaches_private (canonical email source) with
-- coaches_public (status check).
--
-- Idempotent: only touches rows that are still NULL. Safe to re-run.
-- =========================================================================

UPDATE public.subscriptions s
SET coach_id = cpub.user_id,
    updated_at = now()
FROM public.coaches_private cpriv,
     public.coaches_public cpub,
     public.profiles_public p
WHERE s.coach_id IS NULL
  AND s.user_id = p.id
  AND p.payment_exempt = true
  AND cpriv.email = 'dr.ironofficial@gmail.com'
  AND cpriv.user_id = cpub.user_id
  AND cpub.status = 'approved';

-- Sanity check: surface any remaining orphans (payment-exempt, no coach).
--   SELECT s.id, p.id AS user_id, p.payment_exempt
--   FROM public.subscriptions s
--   JOIN public.profiles_public p ON p.id = s.user_id
--   WHERE s.coach_id IS NULL AND p.payment_exempt = true;
