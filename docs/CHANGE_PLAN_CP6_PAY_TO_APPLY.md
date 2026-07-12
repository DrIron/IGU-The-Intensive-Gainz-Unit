# Change plan CP6 — "pay new price to apply" (billing-aware renewal)

**Status:** Build handoff (2026-07-09, Cowork). **Owner:** terminal CC. Cowork verifies on prod.
**Companion:** `docs/CHANGE_PLAN_BUILD.md` (CP1–CP5, shipped). This supersedes the earlier "verify-payment apply hook (latency-only)" follow-up — investigation showed it's not latency, it's a **revenue-correctness** change.

## Why (the finding)
Today a scheduled change applies at the due date via `process-plan-changes` cron using an **override activation with no charge**, and `apply_subscription_change` sets the new sub's `next_billing_date := v_effective + interval '1 month'`. Net: at the change boundary the client is moved to the new tier **for a full cycle with no payment collected** — a free month of the new tier (a free month of the *pricier* tier on an upgrade). The renewal path is entirely change-unaware (only `change-service` / `process-plan-changes` / `delete-account` reference `subscription_change_requests`; `process-renewal-reminders`, `create-tap-payment`, `verify-payment` do not).

**Decision (Hasan, 2026-07-09):** switch to **pay-new-price-to-apply** — when a scheduled change is due, the client's renewal is billed at the **new** tier price and the change applies **on that successful payment**. No free cycle; correct revenue; it's the literal reading of the original "effective at next due date, at the new price" decision. **Non-payment fallback = payment-gated (Cowork's recommendation, accepted):** if the client doesn't pay, the change waits and the sub follows the existing past-due/dunning flow. The cron **stops** override-applying for free.

## What changes (4 surfaces + the cron)
A scheduled change is "**due**" when `status='scheduled' AND effective_at <= now` and its `current_subscription_id` is the sub being renewed. Introduce one shared resolver (SQL helper or edge util), e.g. `get_due_change_for_subscription(p_subscription_id) → subscription_change_requests row | null`, used by all surfaces so the "is a change due + what's the new price" logic lives in one place.

### 1) `create-tap-payment` — charge the NEW price when a change is due
When building a renewal charge for a subscription that has a **due** change, use the change's `target_price_kwd` (re-derive server-side from the target service + client level, don't trust a stale snapshot — mirror how CP2 `schedule` priced it) as the charge amount, and stamp the change id into the TAP charge **metadata** (`change_request_id`) so `verify-payment` can tie the capture back to the change. Exempt clients: no charge (unchanged).

### 2) `process-renewal-reminders` — show the NEW plan + price
When a sub has a due change, the reminder copy reflects the **target** plan name + new price ("Your plan changes to X -- renew at Y KWD"). Dedup key unchanged. Purely presentational; no send-logic change beyond the price/plan lookup.

### 3) `verify-payment` — apply the change on successful capture (the core)
In `activateSubscription` (`supabase/functions/verify-payment/index.ts`, ~L136–310):
- **Amount validation (L168):** when a due change exists, `expectedAmount` must be the **new** price (from the resolver / charge metadata `change_request_id`), not the current sub's price — otherwise a legitimate new-price payment is rejected as a mismatch.
- **Apply after a verified CAPTURED charge:** once the charge is validated, call `apply_subscription_change(change_id, 'applied on renewal payment')`. **Ordering (important for bookkeeping):** the renewal payment must land on the **new** (post-change) subscription, not the old one that gets cancelled. Prefer: resolve/apply the change **first** (get the new sub id), then write the `subscriptions.status='active'` + `next_billing_date` update and the `subscription_payments` row against the **new** sub. If reordering `activateSubscription` is too invasive, alternative: apply after, and have `apply_subscription_change` (or the hook) **re-link the just-created `subscription_payments` row** to the new sub id. State which you chose in the PR.
- **Idempotent + non-fatal:** `apply_subscription_change` already guards on `status='scheduled'`, so a double-fire is safe. Wrap the apply in try/catch — if it throws, **log and still return payment success** (the money is captured; the cron reconciliation below is the safety net). Never fail a verified payment because the apply hiccuped.
- This is **payment-critical code** — keep the change minimal, preserve every existing validation (CAPTURED, currency, already-paid short-circuit at L189/L254 `onConflict tap_charge_id`), and add focused logging (`step: "change_applied_on_payment"`).

### 4) `process-plan-changes` cron — stop the free override; become paid-only reconciliation
Change its behavior from "apply every due change via override" to a **reconciliation safety net**:
- Apply a due change **only if** its renewal has already been paid (the current sub has a captured renewal covering the period at/after `effective_at` — e.g. `last_verified_charge_id` set for the current cycle / a `subscription_payments` row on/after `effective_at`). This catches the rare "paid but the verify-payment hook didn't fire" case. Idempotent.
- If the renewal is **not** paid: **do nothing** — leave the change `scheduled` and let the existing past-due/dunning flow act on the sub. **No override activation, no free cycle.**
- Because apply is now payment-gated, `apply_subscription_change`'s internal override activation is only reached in the paid-reconciliation path (legitimate — a charge exists). Keep the override (system context) but it must never run against an unpaid cycle. If cleanest, add a `p_require_paid boolean` guard to the RPC.

## Edge cases
- **Current sub lapses/cancels while a change is `scheduled`** (client never pays): the change is moot. Either cancel it in the existing cancel/lapse path (call from `cleanup-cancelled-accounts` / `cancel-subscription`), or leave it — but ensure a `scheduled` change against a cancelled `current_subscription_id` can never apply. Prefer explicitly cancelling it (status `cancelled`) so the admin/queue views stay clean.
- **Downgrade** (new price < old): client pays the smaller amount at renewal, applies, on the cheaper tier — clean, no change to logic.
- **Payment-exempt / comp:** no charge; keep the cron path for exempt clients (override-apply is legitimate — there's genuinely no charge, and `client_price_kwd` stays NULL, out of `paying_subscriptions`). Exempt is the **one** case where override-apply-without-payment is correct. Gate the "free override" strictly to `payment_exempt = true`.
- **Discount on the current sub:** decide whether an active discount carries to the new price (recommend: recompute new price at list rate, discounts don't auto-carry across a plan change — flag in PR).
- **Amount tolerance:** keep the existing `Math.abs(charge.amount - expectedAmount) > 0.001` guard against the new price.

## Phasing
- **CP6a — apply-on-payment core:** `verify-payment` change-aware (amount + apply hook + payment-lands-on-new-sub), `create-tap-payment` charges new price, `get_due_change_for_subscription` resolver. Cron still runs (now redundant for payers) — but flip it to paid-only in the same PR to avoid a window where both fire (idempotency makes it safe regardless).
- **CP6b — polish:** renewal reminder copy, lapse-cancels-pending-change, discount decision.

## Verify (Cowork, prod)
Non-exempt test sub (temporarily flip `payment_exempt=false`, set `next_billing_date` and an `effective_at <= now` scheduled change):
- `create-tap-payment` for the renewal quotes the **new** price (not the current sub's).
- Paying that charge → `verify-payment` applies the change: new-tier sub active, old cancelled, **the `subscription_payments` row is on the new sub**, `next_billing_date` one cycle out, payout recomputed for the new tier. No free cycle.
- Cron with an **unpaid** due change → does **nothing** (change stays `scheduled`, no new sub, no override). Cron with a **paid** due change where the hook didn't fire → applies once (reconciliation), idempotent.
- Exempt client with a due change → cron still override-applies (the one legitimate free path).
- Restore test state + waitlist ON.
Gates: tsc zero-new, ESLint 0, build. Treat `verify-payment` / `create-tap-payment` edits as payment-critical — no behavior change to the non-change renewal path.
