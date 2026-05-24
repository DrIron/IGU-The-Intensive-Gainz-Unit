-- Phase 1 grant for refund_addon_purchase (split per splitter-bug pattern).
--
-- authenticated -- the RPC body gates on is_admin(auth.uid()); granting to
-- authenticated rather than service_role lets the admin UI call it directly
-- from the frontend with the user's JWT (matches PaymentOverride and other
-- admin RPCs).
--
-- DO-block wrapper: see 20260524140110 for splitter-bug rationale.

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.refund_addon_purchase(uuid, text, text) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.refund_addon_purchase(uuid, text, text) TO authenticated';
END
$$;
