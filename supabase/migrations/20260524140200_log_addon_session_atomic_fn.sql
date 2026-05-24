-- Phase 1/F7+F9 of addon-services Path B rebuild.
-- See docs/ADDON_SERVICES_BUILD_SPEC.md § 2 (log_addon_session_atomic).
--
-- Atomic session log. Mirrors book_session_atomic (20260524120100):
--   - Lock the purchase row FOR UPDATE (closes the 2-tab race where two
--     professionals each see "1 remaining" and both INSERT)
--   - Eligibility check via is_addon_eligible_professional (F7 helper,
--     admin bypass + subrole match + active care-team membership)
--   - Validate status='active', not deleted, not expired
--   - Recompute consumed from addon_session_logs UNDER the lock
--   - Validate session_date <= today (Kuwait-anchored per B6-N8 lesson --
--     a 10pm KW log on a UTC-boundary night was getting "future date"
--     rejects before the fix)
--   - Snapshot professional_payout_kwd + igu_take_kwd from the catalog
--     at log time (catalog price changes don't retroactively repay
--     historical sessions)
--   - Insert the log
--   - Flip status to 'consumed' if this was the final session
--
-- auth.uid() is the implicit professional_id -- no spoofing possible.
-- One CREATE FUNCTION per file. GRANT in 140210.

CREATE OR REPLACE FUNCTION public.log_addon_session_atomic(
  p_purchase_id   uuid,
  p_session_date  date DEFAULT NULL,
  p_notes         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller          uuid;
  v_purchase        record;
  v_service         record;
  v_consumed        integer;
  v_sessions_total  integer;
  v_log_id          uuid;
  v_today_kw        date;
  v_session_date    date;
  v_new_status      public.addon_purchase_status;
BEGIN
  v_caller := (SELECT auth.uid());
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- Lock purchase FOR UPDATE -- serialises concurrent loggers (B6-N1 pattern)
  SELECT id, client_id, addon_service_id, quantity, status,
         expires_at, deleted_at
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

  -- Eligibility (admin OR (subrole match AND active care-team member))
  IF NOT public.is_addon_eligible_professional(v_caller, p_purchase_id) THEN
    RAISE EXCEPTION 'Not eligible to log sessions on this purchase'
      USING ERRCODE = '42501';
  END IF;

  -- Status + expiry checks
  IF v_purchase.status <> 'active' THEN
    RAISE EXCEPTION 'Purchase is not active (status: %)', v_purchase.status
      USING ERRCODE = '42501';
  END IF;
  IF v_purchase.expires_at <= now() THEN
    RAISE EXCEPTION 'Purchase has expired' USING ERRCODE = '42501';
  END IF;

  -- Resolve service for payout snapshot + sessions_total
  SELECT pack_size, professional_payout_kwd, igu_take_kwd
    INTO v_service
  FROM public.addon_services
  WHERE id = v_purchase.addon_service_id;

  v_sessions_total := v_purchase.quantity * COALESCE(v_service.pack_size, 1);

  -- Recompute consumed under the lock -- safe from concurrent loggers
  SELECT COUNT(*)::int
    INTO v_consumed
  FROM public.addon_session_logs
  WHERE addon_purchase_id = p_purchase_id;

  IF v_consumed >= v_sessions_total THEN
    RAISE EXCEPTION 'No remaining sessions on this purchase (% of %)',
      v_consumed, v_sessions_total
      USING ERRCODE = '22023';
  END IF;

  -- Session date validation (Kuwait-anchored, per B6-N8)
  v_today_kw := (now() AT TIME ZONE 'Asia/Kuwait')::date;
  v_session_date := COALESCE(p_session_date, v_today_kw);
  IF v_session_date > v_today_kw THEN
    RAISE EXCEPTION 'Session date cannot be in the future (Kuwait time)'
      USING ERRCODE = '22023';
  END IF;

  -- Insert log with snapshot payout
  INSERT INTO public.addon_session_logs (
    addon_purchase_id,
    professional_id,
    session_date,
    notes,
    professional_payout_kwd,
    igu_take_kwd
  ) VALUES (
    p_purchase_id,
    v_caller,
    v_session_date,
    p_notes,
    COALESCE(v_service.professional_payout_kwd, 0),
    COALESCE(v_service.igu_take_kwd, 0)
  )
  RETURNING id INTO v_log_id;

  -- Flip status if this was the final session
  IF (v_consumed + 1) >= v_sessions_total THEN
    v_new_status := 'consumed'::public.addon_purchase_status;
    UPDATE public.addon_purchases
       SET status = v_new_status
     WHERE id = p_purchase_id;
  ELSE
    v_new_status := v_purchase.status;
  END IF;

  RETURN jsonb_build_object(
    'log_id',                   v_log_id,
    'sessions_remaining_after', v_sessions_total - (v_consumed + 1),
    'sessions_total',           v_sessions_total,
    'status_after',             v_new_status,
    'session_date',             v_session_date,
    'professional_id',          v_caller
  );
END;
$$;
