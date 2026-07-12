# "Change plan" — billing & payout (analysis)

**Status:** Analysis + open decisions (2026-07-07, Cowork; **corrected re: payment model**). Companion to `ONBOARDING_SERVICE_FLOW_MAP.md`.

## 0. Payment model — manual, NOT auto-recurring (per Hasan, 2026-07-07)
**There is no card-on-file auto-billing.** Clients **pay manually every cycle**: renewal reminders go out (`process-renewal-reminders` cron), the client pays via a **one-time Tap charge**, and `verify-payment` activates/extends them. `next_billing_date` = the next **manual due date**, not an auto-charge date. `verify-payment` NULLs `tap_card_id` / `tap_payment_agreement_id`, consistent with no stored card. The `subscriptions` row is effectively a **current-service + status + next-due** record plus per-payment one-time charges.

**Consequence:** there is **no recurring Tap subscription to modify**, so a plan change needs **no Tap-subscription edit, no cancel+recreate, no auto-charge proration**. This removes the external blocker an earlier draft assumed. **Change-plan is buildable without any Tap dependency** — what's left are product decisions + internal work (payout recompute, link migration).

## 1. What a plan change actually touches
Switching a client from service A → B changes: the **price** (next manual payment), possibly the **coach**, and the **payout math**. It should also **preserve history** (nutrition phase, programs). It does NOT touch any recurring-billing engine (there isn't one).

## 2. When does the new price take effect?
- Natural model under manual pay: the change **sets the new service + price now**, and the client's **next manual payment is at the new price**. No proration engine.
- Optional: an **immediate** mid-cycle upgrade = a one-time top-up charge for the difference — a normal Tap charge, not a subscription edit. Downgrades just take effect at the next due date (client keeps what they've paid for).
- **Decision (small):** upgrades apply immediately (optional top-up) vs at next due date; downgrades = next due date (recommended).

## 3. Coach continuity (not always possible)
The mockup says "we'll keep your coach." True only if the current coach **offers the new service** (a 1:1 Online coach may not do In-Person) and has **capacity** (`list_active_coaches_for_service`). If not → drop into the coach step in "change" mode to re-pick (reuse `assign_coach_atomic`). The screen must handle both "kept" and "re-pick" paths. (With managed gyms, In-Person/Hybrid continuity also depends on gym match — see `MANAGED_GYMS_AND_COACH_LOCATION_BUILD.md`.)

## 4. Payout / compensation must recompute (the real landmine)
Payout is **per-tier + per-level**, and tiers differ structurally (CLAUDE.md § Service Tiers):
- Flat per-client payout changes with the tier; **In-Person adds a profit-split** the others lack.
- Tier changes may **add/remove a dietitian** (care-team) → dietitian payout appears/disappears.
- Guardrails still apply: **5 KWD min IGU profit** (block/override), **30% max discount**, Lead-coach tier restrictions.
- **Recompute via `calculate_subscription_payout` for the NEW tier** — never carry the old number. This is the PR #159/#161 lineage; any change surface that forgets it re-introduces the payout bugs.
- **Payment-exempt (comp) clients:** stay out of revenue/paying counts (`paying_subscriptions`), keep zero payout.

## 5. The subscription row & link migration
- **Decision:** mutate the existing `subscriptions` row (`service_id`, price) vs **create a new sub + end the old**. Recommend **new sub + end old** (clean audit), and **migrate the links** — coach relationship, active nutrition phase, `client_plan_assignment` — from old→new so history is preserved and nothing orphans.
- This **link-migration helper is reusable**: it also fixes the existing cancel-orphan gap (cancel currently leaves coach/nutrition/program links dangling). Worth building once, using it for both change and cancel-cleanup.
- Keep the old row for audit; new one canonical; `paying_subscriptions` everywhere downstream.

## 6. Where it lives & who drives it
- **Recommend admin-assisted first:** a client "request a plan change" on billing → an admin confirms coach, price, effective date → executes. Self-serve later.
- A **`change-service` edge function** (service-role): validate the new tier, recompute payout (§4), set new service + next-due/price (§2), migrate links (§5), write an audit row, optionally fire a one-time top-up charge for immediate upgrades. Buildable now — no Tap-subscription dependency.

## 7. Decisions to close before speccing the build
1. Upgrade timing: immediate (optional one-time top-up charge) vs at next due date.
2. Downgrade timing: next due date (recommended) — confirm.
3. Coach carry-over vs forced re-pick UX.
4. Mutate sub row vs new-sub + end-old + migrate links (recommend the latter).
5. Admin-assisted first vs self-serve (recommend admin-assisted).
6. Scope at launch: which transitions are allowed? (e.g. only 1:1↔1:1, or also Team↔1:1 — Team↔1:1 is the biggest jump: adds/removes coach match, team membership, focus areas.)

These are all product calls, not external blockers. Once #1–#6 are picked, this becomes a normal build spec — the meat is the payout recompute (§4) and the link-migration helper (§5).
