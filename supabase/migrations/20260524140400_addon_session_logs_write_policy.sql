-- Phase 1/F7 of addon-services Path B rebuild.
-- See docs/ADDON_SERVICES_BUILD_SPEC.md § 1 (F7).
--
-- Belt-and-braces RLS write policy for addon_session_logs. The DEFINER RPC
-- log_addon_session_atomic is the intended write path (it owns the FOR
-- UPDATE lock + payout snapshot + status flip), but this policy gives the
-- table a parallel RLS guard:
--
--   - INSERTs must declare professional_id = auth.uid() (no spoofing)
--   - The caller must be eligible for the purchase per the shared helper
--
-- The admin_full_addon_session_logs policy from 20260211073308 still
-- applies (admins can insert any row).
--
-- IMPORTANT: do NOT bypass log_addon_session_atomic from frontend code.
-- A direct INSERT that passes this policy still skips:
--   * the FOR UPDATE lock on addon_purchases (race condition)
--   * the status flip to 'consumed' on the final session
--   * the payout snapshot from the catalog
-- All writes must route through the RPC. This policy exists to harden
-- against RPC-bypass bugs, not to enable a direct-INSERT path.

DROP POLICY IF EXISTS addon_session_logs_professional_write
  ON public.addon_session_logs;

CREATE POLICY addon_session_logs_professional_write
  ON public.addon_session_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    professional_id = (SELECT auth.uid())
    AND public.is_addon_eligible_professional(
          (SELECT auth.uid()),
          addon_purchase_id
        )
  );

COMMENT ON POLICY addon_session_logs_professional_write
  ON public.addon_session_logs IS
  'Defense-in-depth guard for direct INSERTs. Production code MUST use the '
  'log_addon_session_atomic RPC, which owns the FOR UPDATE lock + status '
  'flip + payout snapshot.';
