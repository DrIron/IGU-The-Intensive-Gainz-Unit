-- B7-N4: lock down client self-writes to the subscriptions table.
--
-- Background. The "Block unauthorized subscription access" RLS policy is
-- FOR ALL with USING (auth.uid() = user_id OR admin OR coach-on-own-client)
-- and NO explicit WITH CHECK, so the WITH CHECK defaults to the USING
-- expression. For a client UPDATE the only constraint is that the new row's
-- user_id still equals auth.uid() -- every other column is freely writable.
-- Live-verified billing-bypass: a real client UPDATEd service_id from a
-- 75 KWD 1:1 Complete plan to the 12 KWD Team Plan, and separately flipped
-- status='cancelled' and wiped coach_id to NULL. (Probes in the PR body.)
--
-- Fix mirrors the B5-N5 message-column whitelist (migration 20260524100000):
-- a BEFORE UPDATE trigger that runs ONLY for a non-admin client editing their
-- OWN subscription row and rejects the write.
--
-- DECISION -- deny-by-default, not an enumerated reject-list.
-- The task spec sketched an enumerated `NEW.col IS DISTINCT FROM OLD.col`
-- reject-list and asked to decide column-by-column whether a client should
-- ever directly write each column. That column-by-column pass (full inventory
-- below) concluded that a client should NEVER directly write ANY column on
-- subscriptions: every mutation has an authorized server path --
--   * team join/change  -> join_team() RPC (sets app.in_join_team, bypasses)
--   * cancellation       -> cancel-subscription edge fn (service_role, auth.uid() NULL)
--   * payment/billing    -> verify-payment / tap-webhook edge fns (service_role)
--   * coach/role/admin    -> admin UI (is_admin) or coach-on-client (caller <> OLD.user_id)
-- A codebase grep confirmed the ONLY client-as-self direct subscriptions
-- UPDATE callsites were ChooseTeamPrompt + ChangeTeamDialog, both removed in
-- this PR. Deny-by-default is therefore strictly safer than an enumerated
-- list: a column added to subscriptions in the future is automatically
-- protected instead of silently client-writable.
--
-- Full column inventory considered (all LOCKED for client self-writes):
--   id, user_id, service_id, tap_subscription_id, tap_customer_id, status,
--   start_date, next_billing_date, created_at, updated_at, coach_id,
--   tap_charge_id, tap_subscription_status, cancel_at_period_end, cancelled_at,
--   added_to_truecoach_team, end_date, payment_failed_at,
--   tap_payment_agreement_id, tap_card_id, base_price_kwd, billing_amount_kwd,
--   discount_code_id, discount_cycles_used, session_booking_enabled,
--   weekly_session_limit, session_duration_minutes, coach_assignment_method,
--   needs_coach_assignment, addons_total_kwd, total_price_kwd, tap_amount_kwd,
--   billing_mode, past_due_since, grace_period_days, last_verified_charge_id,
--   last_payment_verified_at, last_payment_status, activation_override_by,
--   activation_override_reason, team_id, last_team_change_at.
--
-- CRITICAL bypass order. auth.uid() is NULL under the postgres / service_role
-- connection (verified live: is_admin(NULL) = false). Without an explicit NULL
-- bypass FIRST, this trigger would block the migration backfill AND every
-- service_role billing edge function (verify-payment, tap-webhook,
-- cancel-subscription, reactivate-subscription, the cron jobs ...). The NULL
-- check therefore comes before everything else.

CREATE OR REPLACE FUNCTION public.enforce_subscription_column_whitelist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  -- 1. service_role / postgres / migrations (no JWT -> auth.uid() IS NULL).
  --    These run trusted server code; never block them.
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  -- 2. Admins manage subscriptions through admin tooling.
  IF public.is_admin(v_caller) THEN
    RETURN NEW;
  END IF;

  -- 3. Authorized SECURITY DEFINER RPCs (join_team) set this txn-local flag.
  IF current_setting('app.in_join_team', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- 4. Writers acting on someone else's subscription (coach activating /
  --    cancelling a client's sub, coach-on-own-client) are governed by RLS,
  --    not this trigger. Only client-as-self writes are locked here.
  IF v_caller <> OLD.user_id THEN
    RETURN NEW;
  END IF;

  -- 5. A non-admin client editing their OWN subscription row directly: deny.
  --    There is no column a client should write here without an authorized
  --    server path (see the deny-by-default rationale above).
  RAISE EXCEPTION
    'subscriptions is not directly user-writable -- route through join_team() or the cancel-subscription / payment edge functions'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_subscription_column_whitelist ON public.subscriptions;
CREATE TRIGGER trg_enforce_subscription_column_whitelist
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_subscription_column_whitelist();
