-- Phase 5B / F6 of addon-services Path B rebuild.
-- See docs/ADDON_SERVICES_BUILD_SPEC.md § 1 (F6) + § 5 (Phase 5).
--
-- Financial-rows-never-cascade rule per CLAUDE.md: deleting a user must
-- not silently wipe their addon purchase history. Switch the FK to
-- ON DELETE RESTRICT; deletion now requires explicit soft-delete via
-- the deleted_at column (added in Phase 0). The delete-account edge
-- function is patched in the same PR to do exactly that.

ALTER TABLE public.addon_purchases
  DROP CONSTRAINT addon_purchases_client_id_fkey;

ALTER TABLE public.addon_purchases
  ADD CONSTRAINT addon_purchases_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES auth.users(id)
  ON DELETE RESTRICT;
