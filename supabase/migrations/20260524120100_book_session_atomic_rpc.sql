-- B6-N1 + B6-N2 + B6-N12 (part 2 of 2): book_session_atomic RPC
--
-- Replaces the 302-line book-session edge function's read-then-write logic
-- with a single atomic SECURITY DEFINER RPC. Closes:
--   B6-N1: SELECT-recheck-then-INSERT-then-UPDATE race on session_bookings
--          (two concurrent invocations can pass the recheck and double-book)
--   B6-N2: silent "Non-critical" slot status UPDATE failure (slot stuck
--          booked in DB while booking was created, no error surfaced)
--   B6-N12: dead services!inner join (selected but never read)
--
-- B6-N8 (get_current_week_bounds RPC) is in part 1 of this ship:
-- 20260524120000_get_current_week_bounds_rpc.sql. Apply order matters —
-- this file references that function. Filename version ordering ensures it.
--
-- Pattern mirrors assign_coach_atomic (migration 20260523084526, Block 8
-- P0-2): lock the contested row FOR UPDATE inside SECURITY DEFINER, then
-- validate + insert + update inside the same transaction. Concurrent
-- attempts serialize on the row lock; the second one sees the first's
-- UPDATE and fails the status check.

CREATE OR REPLACE FUNCTION public.book_session_atomic(
  p_slot_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_status     text;
  v_payment_exempt     boolean;
  v_subscription_id    uuid;
  v_weekly_limit       integer;
  v_slot               record;
  v_week_bounds        jsonb;
  v_week_start         timestamptz;
  v_week_end           timestamptz;
  v_current_count      integer;
  v_booking_id         uuid;
BEGIN
  ----------------------------------------------------------------
  -- 1. Validate profile (account active OR payment-exempt)
  ----------------------------------------------------------------
  SELECT status, payment_exempt
    INTO v_profile_status, v_payment_exempt
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'NTFND';
  END IF;

  IF NOT (v_profile_status = 'active' OR v_payment_exempt = true) THEN
    RAISE EXCEPTION 'Your account must be active to book sessions'
      USING ERRCODE = '42501';
  END IF;

  ----------------------------------------------------------------
  -- 2. Find active subscription with session booking enabled
  ----------------------------------------------------------------
  SELECT id, weekly_session_limit
    INTO v_subscription_id, v_weekly_limit
  FROM public.subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
    AND session_booking_enabled = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active subscription with session booking enabled'
      USING ERRCODE = '42501';
  END IF;

  IF v_weekly_limit IS NULL THEN
    RAISE EXCEPTION 'Session booking limit not configured for your subscription'
      USING ERRCODE = '22023';
  END IF;

  ----------------------------------------------------------------
  -- 3. Lock the slot row FOR UPDATE — serializes concurrent bookers (B6-N1)
  ----------------------------------------------------------------
  SELECT id, coach_id, slot_start, slot_end, slot_type, status
    INTO v_slot
  FROM public.coach_time_slots
  WHERE id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Slot not found' USING ERRCODE = 'NTFND';
  END IF;

  IF v_slot.status <> 'available' THEN
    RAISE EXCEPTION 'Slot is no longer available'
      USING ERRCODE = '40001';
  END IF;

  IF v_slot.slot_start <= now() THEN
    RAISE EXCEPTION 'Cannot book a slot in the past'
      USING ERRCODE = '22023';
  END IF;

  ----------------------------------------------------------------
  -- 4. Weekly limit check (Kuwait-anchored, inside the same tx)
  ----------------------------------------------------------------
  v_week_bounds := public.get_current_week_bounds();
  v_week_start  := (v_week_bounds->>'week_start')::timestamptz;
  v_week_end    := (v_week_bounds->>'week_end')::timestamptz;

  SELECT COUNT(*)::int INTO v_current_count
  FROM public.session_bookings
  WHERE subscription_id = v_subscription_id
    AND status IN ('booked', 'completed')
    AND session_start >= v_week_start
    AND session_start <  v_week_end;

  IF v_current_count >= v_weekly_limit THEN
    RAISE EXCEPTION 'Weekly session limit reached (% of %)',
      v_current_count, v_weekly_limit
      USING ERRCODE = '22023';
  END IF;

  ----------------------------------------------------------------
  -- 5. Insert booking + update slot — atomic (B6-N2)
  ----------------------------------------------------------------
  INSERT INTO public.session_bookings (
    slot_id, subscription_id, client_id, coach_id,
    session_type, session_start, session_end,
    status, created_by
  ) VALUES (
    v_slot.id, v_subscription_id, p_user_id, v_slot.coach_id,
    v_slot.slot_type, v_slot.slot_start, v_slot.slot_end,
    'booked', p_user_id
  )
  RETURNING id INTO v_booking_id;

  UPDATE public.coach_time_slots
  SET status = 'booked'
  WHERE id = v_slot.id;

  IF NOT FOUND THEN
    -- Should be impossible given the FOR UPDATE lock, but be defensive.
    RAISE EXCEPTION 'Slot update failed unexpectedly' USING ERRCODE = 'XX000';
  END IF;

  RETURN jsonb_build_object(
    'booking_id',    v_booking_id,
    'slot_id',       v_slot.id,
    'session_start', v_slot.slot_start,
    'session_end',   v_slot.slot_end,
    'success',       true
  );
END;
$$;
