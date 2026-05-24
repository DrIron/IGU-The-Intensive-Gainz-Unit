-- Phase 1 of addon-services Path B rebuild.
-- See docs/ADDON_SERVICES_BUILD_SPEC.md § 2 (refund_addon_purchase).
--
-- Admin-only refund RPC. Two modes:
--
--   'full' -- requires zero consumed sessions. Refund = total_paid_kwd.
--   'partial_unused' -- pre-expiry only. Refund = ROUND(total * (remaining/total), 2).
--
-- Per spec § 6, admin override via a third mode is intentionally NOT
-- supported. If admin needs a non-proportional refund, they issue
-- mode='full' (only allowed pre-consumption) or create a manual credit
-- row outside this RPC.
--
-- Inserts a refund row into addon_payments with:
--   - amount_kwd: positive, matches subscription_payments convention
--   - status: 'refunded'
--   - refund_of: original payment_id (self-FK, lets Tap reconciliation join)
--   - metadata.reason / mode / consumed_at_refund / sessions_total
--
-- Tap-side refund must be issued separately via the Tap dashboard. This RPC
-- only records the local-side state flip. The existing tap-webhook REFUNDED
-- branch (with the Phase 2 addon-detection update) will catch the Tap
-- webhook and confirm by matching on refund_of.
--
-- One CREATE FUNCTION per file. GRANT in 140310.

CREATE OR REPLACE FUNCTION public.refund_addon_purchase(
  p_purchase_id  uuid,
  p_reason       text,
  p_mode         text DEFAULT 'partial_unused'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller            uuid;
  v_purchase          record;
  v_service_pack      integer;
  v_original_payment  record;
  v_consumed          integer;
  v_sessions_total    integer;
  v_refund_amount     numeric;
  v_addon_payment_id  uuid;
BEGIN
  -- Admin gate (matches the pattern from refund flows in subscription land)
  v_caller := (SELECT auth.uid());
  IF NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'Admin role required' USING ERRCODE = '42501';
  END IF;

  IF p_mode NOT IN ('full', 'partial_unused') THEN
    RAISE EXCEPTION 'Mode must be full or partial_unused (got: %)', p_mode
      USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required (>= 3 chars)' USING ERRCODE = '22023';
  END IF;

  -- Lock purchase FOR UPDATE
  SELECT id, client_id, addon_service_id, quantity, status,
         total_paid_kwd, payment_id, expires_at, deleted_at
    INTO v_purchase
  FROM public.addon_purchases
  WHERE id = p_purchase_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase not found' USING ERRCODE = 'NTFND';
  END IF;
  IF v_purchase.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Purchase has been deleted' USING ERRCODE = '42501';
  END IF;
  IF v_purchase.status NOT IN ('active', 'pending_payment') THEN
    RAISE EXCEPTION 'Purchase status % cannot be refunded', v_purchase.status
      USING ERRCODE = '42501';
  END IF;
  IF v_purchase.payment_id IS NULL THEN
    RAISE EXCEPTION 'Purchase has no payment_id (legacy Phase-0 row, refund manually)'
      USING ERRCODE = '42501';
  END IF;

  -- Service pack_size (for sessions_total)
  SELECT pack_size INTO v_service_pack
  FROM public.addon_services
  WHERE id = v_purchase.addon_service_id;
  v_sessions_total := v_purchase.quantity * COALESCE(v_service_pack, 1);

  -- Consumed count under the lock
  SELECT COUNT(*)::int INTO v_consumed
  FROM public.addon_session_logs
  WHERE addon_purchase_id = p_purchase_id;

  -- Compute refund amount per mode
  IF p_mode = 'full' THEN
    IF v_consumed > 0 THEN
      RAISE EXCEPTION 'Full refund requires zero consumed sessions (consumed: %)',
        v_consumed
        USING ERRCODE = '42501';
    END IF;
    v_refund_amount := v_purchase.total_paid_kwd;
  ELSE
    -- partial_unused
    IF v_purchase.expires_at <= now() THEN
      RAISE EXCEPTION 'Cannot partial-refund an expired purchase'
        USING ERRCODE = '42501';
    END IF;
    IF v_consumed >= v_sessions_total THEN
      RAISE EXCEPTION 'Nothing to refund -- all sessions consumed'
        USING ERRCODE = '42501';
    END IF;
    v_refund_amount := ROUND(
      v_purchase.total_paid_kwd
        * (v_sessions_total - v_consumed)::numeric
        / v_sessions_total::numeric,
      2
    );
    IF v_refund_amount <= 0 THEN
      RAISE EXCEPTION 'Computed refund is zero or negative' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Look up original payment to copy client_id
  SELECT id, client_id INTO v_original_payment
  FROM public.addon_payments
  WHERE id = v_purchase.payment_id;

  -- Insert refund row (positive amount, status='refunded', refund_of -> original)
  INSERT INTO public.addon_payments (
    client_id,
    amount_kwd,
    status,
    refunded_at,
    refund_of,
    metadata
  ) VALUES (
    v_original_payment.client_id,
    v_refund_amount,
    'refunded',
    now(),
    v_purchase.payment_id,
    jsonb_build_object(
      'reason',             p_reason,
      'mode',               p_mode,
      'consumed_at_refund', v_consumed,
      'sessions_total',     v_sessions_total,
      'refunded_by',        v_caller,
      'purchase_id',        p_purchase_id
    )
  )
  RETURNING id INTO v_addon_payment_id;

  -- Flip purchase status
  UPDATE public.addon_purchases
     SET status = 'refunded'::public.addon_purchase_status
   WHERE id = p_purchase_id;

  RETURN jsonb_build_object(
    'refund_amount_kwd',  v_refund_amount,
    'addon_payment_id',   v_addon_payment_id,
    'refund_of',          v_purchase.payment_id,
    'mode',               p_mode,
    'consumed',           v_consumed,
    'sessions_total',     v_sessions_total
  );
END;
$$;
