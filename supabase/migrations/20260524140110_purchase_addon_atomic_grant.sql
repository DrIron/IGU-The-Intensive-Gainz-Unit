-- Phase 1 grant for purchase_addon_atomic (split from 20260524140100 per
-- splitter-bug pattern).
--
-- service_role only -- invoked from tap-webhook after CAPTURED verification.
-- Direct authenticated-user access would let a client materialise a purchase
-- without going through Tap (bypassing payment). The webhook is the only
-- caller; FE never calls this RPC directly.
--
-- Wrapped in a DO block so the file contains exactly one top-level statement
-- (one $$ block) — the CLI v2.78 splitter bundles multiple non-$$ statements
-- and PG rejects with 42601.

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.purchase_addon_atomic(uuid, uuid, uuid, integer, numeric) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.purchase_addon_atomic(uuid, uuid, uuid, integer, numeric) FROM authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.purchase_addon_atomic(uuid, uuid, uuid, integer, numeric) TO service_role';
END
$$;
