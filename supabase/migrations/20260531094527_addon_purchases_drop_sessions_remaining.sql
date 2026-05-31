-- Phase 5B / F2 of addon-services Path B rebuild.
-- See docs/ADDON_SERVICES_BUILD_SPEC.md § 1 (F2) + § 5 (Phase 5).
--
-- The writable sessions_remaining column was the root cause of B6-N4:
-- nothing decremented it, every read site re-derived "is this pack
-- usable" with slightly different rules, and drift was structurally
-- guaranteed. Replaced in Phase 0 by addon_purchases_with_remaining
-- view (sessions_total - count(logs)). All FE callers migrated to the
-- view in Phase 3 (catalog) + Phase 4 (SessionsTab) + Phase 5A (admin
-- purchases table). RPCs never touched it. Safe to drop.

ALTER TABLE public.addon_purchases
  DROP COLUMN sessions_remaining;
