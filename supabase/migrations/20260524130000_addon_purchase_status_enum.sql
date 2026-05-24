-- Phase 0/F1 of addon-services Path B rebuild (B6-N4).
-- See docs/ADDON_SERVICES_BUILD_SPEC.md § 1 (F1).
--
-- Adds the explicit addon_purchase_status enum. Today, "is this pack still
-- usable" is computed at every read site from (sessions_remaining > 0 AND
-- expires_at > now()), and two read sites disagree about expired packs that
-- still have sessions_remaining > 0. The enum gives us a single truth source
-- driven by tap-webhook (capture / refund / void), log_addon_session_atomic
-- (active -> consumed), and a daily cron sweep (active -> expired).
--
-- No table changes here -- column lands in 20260524130200. Splitting type
-- creation off because a column DEFAULT references the type and we want the
-- type to exist in its own migration (rollback granularity).

CREATE TYPE public.addon_purchase_status AS ENUM (
  'pending_payment',
  'active',
  'consumed',
  'expired',
  'refunded',
  'voided'
);
