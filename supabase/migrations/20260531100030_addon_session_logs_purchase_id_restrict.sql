-- Phase 5B / F6 of addon-services Path B rebuild.
-- See docs/ADDON_SERVICES_BUILD_SPEC.md § 1 (F6) + § 5 (Phase 5).
--
-- Companion to the addon_purchases.client_id FK switch. Logs must not
-- vanish when their parent purchase is hard-deleted -- and since
-- addon_purchases is now itself RESTRICT, the only practical effect
-- here is to make accidental admin DELETE of a purchase row impossible
-- when logs exist (admin must refund / soft-delete via the dialog).

ALTER TABLE public.addon_session_logs
  DROP CONSTRAINT addon_session_logs_addon_purchase_id_fkey;

ALTER TABLE public.addon_session_logs
  ADD CONSTRAINT addon_session_logs_addon_purchase_id_fkey
  FOREIGN KEY (addon_purchase_id) REFERENCES public.addon_purchases(id)
  ON DELETE RESTRICT;
