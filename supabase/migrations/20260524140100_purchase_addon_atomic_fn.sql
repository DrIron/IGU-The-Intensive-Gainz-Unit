-- Phase 1/F3+F5+F8 of addon-services Path B rebuild.
-- See docs/ADDON_SERVICES_BUILD_SPEC.md § 2 (purchase_addon_atomic).
--
-- Atomic purchase materialisation. Called from tap-webhook after a CAPTURED
-- payment_id has been written to addon_payments.status='paid'. Idempotent
-- via the UNIQUE constraint on addon_purchases.payment_id -- replayed
-- webhooks return the existing purchase row rather than creating a duplicate.
--
-- Validates:
--   - service is_active
--   - tier_restrictions vs caller's active subscription service slug (F5)
--   - addon_payments row exists, belongs to client, status='paid', amount matches
--   - quantity >= 1, discount in [0, 30]
--
-- Computes:
--   - unit price = pack_price_kwd if pack else base_price_kwd
--   - total_paid_kwd = ROUND(unit * quantity * (1 - discount/100), 2)
--     (KWD subunits are 3 decimals but Tap rounds to 2 -- match Tap to
--      avoid reconciliation drift; same convention as subscription_payments)
--   - sessions_total = quantity * COALESCE(pack_size, 1)
--   - expires_at = now() + pack_expiry_months months
--
-- One CREATE FUNCTION per file (splitter-bug guard). GRANT in 140110.

CREATE OR REPLACE FUNCTION public.purchase_addon_atomic(
  p_client_id         uuid,
  p_addon_service_id  uuid,
  p_payment_id        uuid,
  p_quantity          integer DEFAULT 1,
  p_discount_percent  numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service             record;
  v_payment             record;
  v_existing            record;
  v_subscription_svc    text;
  v_unit_price          numeric;
  v_total_kwd           numeric;
  v_sessions_total      integer;
  v_expires_at          timestamptz;
  v_purchase_id         uuid;
BEGIN
  -- 1. Validate inputs
  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'Quantity must be at least 1' USING ERRCODE = '22023';
  END IF;
  IF p_discount_percent IS NULL OR p_discount_percent < 0 OR p_discount_percent > 30 THEN
    RAISE EXCEPTION 'Discount must be between 0 and 30 percent'
      USING ERRCODE = '22023';
  END IF;

  -- 2. Idempotency: if a purchase already exists for this payment, return it.
  --    The UNIQUE constraint on payment_id would otherwise raise 23505 on
  --    the INSERT below; pre-checking gives a clean idempotent response.
  SELECT ap.id, ap.status, ap.expires_at, ap.quantity,
         (ap.quantity * COALESCE(svc.pack_size, 1)) AS sessions_total
    INTO v_existing
  FROM public.addon_purchases ap
  JOIN public.addon_services svc ON svc.id = ap.addon_service_id
  WHERE ap.payment_id = p_payment_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'purchase_id',    v_existing.id,
      'sessions_total', v_existing.sessions_total,
      'expires_at',     v_existing.expires_at,
      'status',         v_existing.status,
      'idempotent',     true
    );
  END IF;

  -- 3. Lock catalog row (FOR SHARE -- catalog is reference, not contested)
  SELECT id, name, type, base_price_kwd, pack_size, pack_price_kwd,
         pack_expiry_months, tier_restrictions, required_subrole, is_active
    INTO v_service
  FROM public.addon_services
  WHERE id = p_addon_service_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Addon service not found' USING ERRCODE = 'NTFND';
  END IF;
  IF v_service.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Addon service is not available for purchase'
      USING ERRCODE = '42501';
  END IF;

  -- 4. tier_restrictions: caller must have an active subscription on one
  --    of the allowed service slugs (F5)
  IF v_service.tier_restrictions IS NOT NULL
     AND array_length(v_service.tier_restrictions, 1) > 0 THEN
    SELECT srv.slug
      INTO v_subscription_svc
    FROM public.subscriptions sub
    JOIN public.services srv ON srv.id = sub.service_id
    WHERE sub.user_id = p_client_id
      AND sub.status = 'active'
    LIMIT 1;

    IF v_subscription_svc IS NULL
       OR NOT (v_subscription_svc = ANY (v_service.tier_restrictions)) THEN
      RAISE EXCEPTION 'Addon % requires active subscription on tier %',
        v_service.name, v_service.tier_restrictions
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 5. Validate payment row
  SELECT id, client_id, amount_kwd, status, refund_of
    INTO v_payment
  FROM public.addon_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment record not found' USING ERRCODE = 'NTFND';
  END IF;
  IF v_payment.client_id <> p_client_id THEN
    RAISE EXCEPTION 'Payment does not belong to client' USING ERRCODE = '42501';
  END IF;
  IF v_payment.refund_of IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot use a refund row to fund a purchase'
      USING ERRCODE = '42501';
  END IF;
  IF v_payment.status <> 'paid' THEN
    RAISE EXCEPTION 'Payment is not in paid state (current: %)', v_payment.status
      USING ERRCODE = '42501';
  END IF;

  -- 6. Compute price (Tap-compatible 2-decimal rounding)
  v_unit_price := CASE
    WHEN v_service.pack_size IS NOT NULL AND v_service.pack_price_kwd IS NOT NULL
      THEN v_service.pack_price_kwd
    ELSE v_service.base_price_kwd
  END;
  v_total_kwd := ROUND(
    v_unit_price * p_quantity * (1 - p_discount_percent / 100.0),
    2
  );

  -- 7. Payment amount must match computed price
  IF v_payment.amount_kwd <> v_total_kwd THEN
    RAISE EXCEPTION 'Payment amount % does not match computed price %',
      v_payment.amount_kwd, v_total_kwd
      USING ERRCODE = '42501';
  END IF;

  -- 8. Compute fulfilment fields
  v_sessions_total := p_quantity * COALESCE(v_service.pack_size, 1);
  v_expires_at := now() + (COALESCE(v_service.pack_expiry_months, 3) || ' months')::interval;

  -- 9. INSERT (will trip UNIQUE on payment_id if a concurrent webhook beat us)
  INSERT INTO public.addon_purchases (
    client_id,
    addon_service_id,
    payment_id,
    quantity,
    total_paid_kwd,
    discount_percentage,
    expires_at,
    status
  ) VALUES (
    p_client_id,
    p_addon_service_id,
    p_payment_id,
    p_quantity,
    v_total_kwd,
    p_discount_percent,
    v_expires_at,
    'active'::public.addon_purchase_status
  )
  RETURNING id INTO v_purchase_id;

  RETURN jsonb_build_object(
    'purchase_id',    v_purchase_id,
    'sessions_total', v_sessions_total,
    'expires_at',     v_expires_at,
    'status',         'active',
    'idempotent',     false
  );
END;
$$;
