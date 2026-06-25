# IGU Pricing Update — Implementation Handoff (for Claude Code)

> Author: planning session, June 2026. Target: implement the new pricing model in the IGU codebase.
> **Do not deploy to production until the prices below are confirmed final and a migration has been reviewed.**
> Read CLAUDE.md end-to-end first. Follow its conventions (migration naming, RLS, `{ error }` destructure, REVOKE pattern, no nested FK joins, coach-refactor soak caution).

---

## 1. Scope & guardrails

**IN scope (this round):**
1. New core client prices, level-based (Junior / Senior / Lead), for Team, 1:1 Online, Hybrid, In-Person.
2. Retire the `one_to_one_complete` service.
3. New coach per-client payouts by level (paired with the level-based prices).
4. Make the hardcoded `ComparisonTable` prices data-driven (or at least update them).

**OUT of scope — do NOT implement:**
- **Dietitian / physio add-ons / new add-on pricing.** Blocked pending a Kuwait MOH licensing legal review. Leave the existing `addon_services` rows as-is.
- **Business hiring milestones / tasks.** These are internal planning artifacts (in the Business Build Plan doc) — they have no place in the client-facing product. Do not add any milestone/task feature.

**Critical coupling:** the coach payouts in §3 are designed to be funded by the level-based client prices in §2. Do **not** ship the new payouts against a single flat client price — that re-creates the margin squeeze the new model exists to fix (a Lead coach paid more on a flat price collapses IGU's margin; this is why CLAUDE.md currently blocks Lead from 1:1 Online). Prices and payouts ship together.

---

## 2. Target pricing ladder (KWD / month) — coaching only

Client price = Coach pay + IGU keep + Ops. IGU keep is IGU's take after processing/ops; it eases as the coach levels up.

| Service | Slug | Level | Client price | Coach pay | IGU keep | Ops |
|---|---|---|---|---|---|---|
| Team Plan | `team_plan` | (single) | **10** | 6 (head coach, flat) | 2 | 2 |
| 1:1 Online | `one_to_one_online` | Junior | **30** | 17 | 10 | 3 |
| | | Senior | **35** | 24 | 8 | 3 |
| | | Lead | **40** | 30 | 7 | 3 |
| Hybrid | `hybrid` | Junior | **95** | 70 | 20 | 5 |
| | | Senior | **110** | 88 | 17 | 5 |
| | | Lead | **125** | 105 | 15 | 5 |
| In-Person | `in_person` | Junior | **145** | 107 | 30 | 8 |
| | | Senior | **175** | 141 | 26 | 8 |
| | | Lead | **215** | 183 | 24 | 8 |
| ~~1:1 Complete~~ | `one_to_one_complete` | — | **REMOVE** | — | — | — |

Notes:
- `Ops` (~2–8; Team Plan is 2) is payment processing + platform/infra cost per client. **Validate the real figure against Tap's actual fee + infra before treating as final.** Today it lives in `igu_operations_costs`.
- Team Plan dropped from 12 → 10 to fit the round-number scheme and sharpen the entry hook. The legacy named teams `team_fe_squad` / `team_bunz` are already `is_active = false` (deactivated in `20260501_deactivate_legacy_team_services.sql`) — only `team_plan` is live, so apply the new 10 KWD to `team_plan` and leave the dead slugs alone.

---

## 3. The core change: level-based CLIENT pricing

**Current state (confirmed in code):**
- Client price is a single value per service (`services.price_kwd` + redundant `service_pricing.price_kwd`).
- Coach level (`coaches_public.coach_level`) affects payout only, never client price.
- The coach is assigned **before** payment (`submit-onboarding` → `assign_coach_atomic`), so the coach's level **is known at charge time** in `create-tap-payment`.

**Target:** client price depends on the assigned coach's level, per the table in §2.

**Implementation outline:**
1. **Schema:** store the price as `(service, level)`. Either add a `level` dimension to `service_pricing` (e.g. `coach_level` column, with a row per service×level), or a new `service_level_pricing` table. Keep one canonical source of truth.
2. **Persist what was charged:** add `client_price_kwd` (and ideally `coach_level_at_purchase`) to `subscriptions`, written at payment time. Today nothing records what the client actually paid — this is also a pre-existing audit gap worth closing.
3. **`create-tap-payment` edge fn:** fetch the assigned coach's level for the subscription, look up the `(service, level)` price, charge that, and write it to `subscriptions.client_price_kwd`. (Handle OPTIONS before `req.json()`; keep the existing internal-auth pattern.)
4. **Payout RPC:** `calculate_subscription_payout` should read the new per-level coach payouts (§3 numbers) and the stored client price, preserving the existing min-IGU-profit and 30% discount guardrails. With level pricing in place, the "Lead blocked from 1:1 Online" guardrail should no longer trigger — verify and remove that block if appropriate.

**Product decision — RESOLVED (Hasan, June 2026): build B — "from / range" public display + confirm-at-checkout. Level stays an internal assignment attribute, NOT a client-facing choice. Do not build A.**

Premise correction (confirmed in code, June 2026): **the client does NOT choose their coach.** `submit-onboarding` auto-assigns a 1:1 coach by focus-area match + round-robin (`assign_coach_atomic`, migration `20260522120000`), and assignment happens **before** payment. So the coach's level — and therefore the exact price — is unknown on the public Services page but **known by the time of charge** in `create-tap-payment`. (An earlier framing assumed clients browse and pick a coach tier; they don't, so that framing is dropped.)

Given that flow, the two viable shapes are:

- **(B) — RECOMMENDED. "From / range" on the public page, real price confirmed at checkout.** Display e.g. "Online — from 30 KWD/mo" (or "30–40 KWD/mo"). After auto-assignment, show the client their assigned coach + the resolved price on the payment screen and require an **explicit confirmation before charging**. Because the level is already known pre-charge, this is a genuine confirmation step, not a surprise — it neutralises the "quoted 30, charged 40" risk that would otherwise sink a range display. Fits the existing assign-then-pay flow with minimal change. Lowest build, trust-preserving.
- **(A) — NOT chosen. Make level a client-facing choice.** (Recorded for context only — do not build.) Client picks Junior/Senior/Lead at its shown price up front, and auto-assignment is then *constrained* to coaches of the chosen level. Rejected because it turns level into a customer-facing product axis, forces the round-robin to filter by level (capacity risk if no coach at the chosen level is free), and is a larger onboarding/selection-flow change.

Build B. The **`ComparisonTable` prices are hardcoded in source** (`src/components/marketing/ComparisonTable.tsx`) and must be updated to the new numbers / made data-driven; and the **checkout must display the resolved price before charging** (this also closes the current gap where nothing records what the client actually paid — see §3 step 2).

---

## 4. Files & surfaces to touch (from codebase map)

- **DB / migrations** (`supabase/migrations/`, `YYYYMMDDHHMMSS_*.sql`, never edit applied ones):
  - `services` + `service_pricing`: new prices; level pricing structure.
  - `coach_payout_rates` (and/or the active payout path): new per-level coach payouts. **Note the documented payout-model drift** (hourly `professional_levels`/`service_hour_estimates` vs the flat `coach_payout_rates` from `20260327_flat_payout_model.sql`) — confirm which is live before editing, and surface the contradiction rather than guessing.
  - `igu_operations_costs`: confirm per-service ops values.
  - `subscriptions`: add `client_price_kwd` (+ optional `coach_level_at_purchase`).
  - Retire `one_to_one_complete` (set inactive rather than hard-delete if existing subscriptions reference it; grandfather any active Complete subscriptions).
  - Any new RPC/function: SECURITY DEFINER + `SET search_path = public` + the mandatory REVOKE-from-anon pattern.
- **Edge functions:** `create-tap-payment` (level-aware pricing + persist price).
- **Frontend:**
  - `src/pages/Services.tsx`, `src/components/ServiceCard.tsx` — level price display.
  - `src/components/marketing/ComparisonTable.tsx` — hardcoded prices (12/40/75/150/250) → new values; remove the Complete column.
  - `src/auth/roles.ts` — tier/payout definitions reference `one_to_one_complete` (lines ~318/328/362/376); update.
  - Onboarding plan list / `OnboardingForm` — remove Complete from selectable plans.
  - Admin: `PricingPayoutsPage.tsx`, `CoachCompensationCard.tsx`, `PayoutRatesManager.tsx` — reflect new tiers/levels, drop Complete.

---

## 5. Verification (do not claim done without)

- `npx tsc --noEmit` clean.
- Drift query for coach-refactor (CLAUDE.md §9) still returns 0 — don't disturb the Phase-2 soak.
- A test subscription at each coach level charges the correct price and writes `client_price_kwd`.
- `calculate_subscription_payout` returns correct coach/IGU split at each level with guardrails intact (anon `42501` check on any new RPC).
- Services page + ComparisonTable render the new prices with no Complete tier; no 404s where Complete used to be.
- Confirm no active `one_to_one_complete` subscription is broken by the retirement.

---

## 6. Explicitly NOT in this change
- Dietitian / physio add-ons and their pricing — **wait for legal**.
- Any "milestones"/"tasks" feature — stays in the planning doc.
- Final sign-off that these exact prices ship — confirm with Hasan before deploying.

---

## 7. Verification status & runbook (June 12 2026)

Code + migration reviewed against the live prod schema. **Done, verified read-only on prod:**
- Coach-refactor drift = 0 (Phase-2 soak undisturbed).
- Every column / table / enum / constraint the migration references exists with the exact names used, incl. the `coach_payout_rates_service_id_role_level_key` unique constraint the `ON CONFLICT` depends on.
- `igu_operations_costs` already has rows for all four services, so the migration's `UPDATE`s land (no silent no-op leaving ops at 0).
- `service_pricing` rows exist for all five services; `service_level_pricing` does not pre-exist (clean create).
- Guardrail math passes at all nine level rows; only Team sits on the boundary (10 − 6 − 2 = 2, floor 2).
- Prod still holds the OLD payouts — migration genuinely not applied; prod clean.

**Migration-history reality (corrects an earlier note):** prod's own `schema_migrations` is current (382 rows, head `20260609120300`). The "stuck at 20260209" is only the **branching / preview-DB replay source** — which is why dev branches stall at 20260209 and can't host this migration. So:
- A Supabase branch is NOT a viable test bed until that source is reconciled (separate task; doesn't block shipping).
- `supabase db push` should apply only `20260611120000` — but run `supabase migration list` first to confirm parity (the `apply_migration` timestamp-drift gotcha means local filenames may not map 1:1 to recorded versions).

**Runtime-verified on prod 2026-06-12** — the migration + checks were applied inside a single `BEGIN … ROLLBACK` (proven non-persisting beforehand with a throwaway-table probe; post-run confirmed `service_level_pricing` absent, online price still 40, Complete still active, lead payout still 34, no new column). Results, all green:
- 12 level-price seed rows correct (10/10/10 · 30/35/40 · 95/110/125 · 145/175/215).
- `calculate_subscription_payout` on a real 1:1 Online sub: junior `client_price 30 / coach 17 / ops 3 / profit 10`; senior `35 / 24 / 3 / 8`; lead `40 / 30 / 3 / 7`; `blocked=false` throughout. Price steps by the assigned coach's level. ✓
- `coach_assignment_would_block` (senior coach, online) → false. ✓
- Grants: anon EXECUTE on all three RPCs = false; authenticated = true on payout+quote, false on would_block; service_role = true on would_block. ✓ (equivalent to the anon-`42501` probe.)
- Coach-refactor drift = 0; `one_to_one_complete` retired (`is_active=false`). ✓

The only check that genuinely needs the live app (not SQL) is the end-to-end test charge writing `client_price_kwd` — verify that in the app smoke test (§7b step 4). `get_subscription_price_quote` happy path likewise needs `auth.uid()`, so test from the authenticated app.

### 7a. Runtime verification block — prod SQL editor, ROLLBACK = verify-only

Run as ONE execution (not statement-by-statement — the `ALTER TABLE subscriptions ADD COLUMN` holds ACCESS EXCLUSIVE until the txn ends; one batch = ~1–2s then rolls back). Test target is a real 1:1 Online sub; level is driven via `coach_level_at_purchase` (the RPC reads it first) so the shared coach row is never mutated.

```sql
BEGIN;

-- 1) Apply migration: paste the full body of
--    supabase/migrations/20260611120000_level_based_pricing.sql here (psql: \i it)

-- 2) Seed sanity -- expect 12 rows: 10/10/10, 30/35/40, 95/110/125, 145/175/215
SELECT s.slug, slp.coach_level, slp.price_kwd
FROM service_level_pricing slp JOIN services s ON s.id = slp.service_id
ORDER BY s.slug, slp.coach_level;

-- 3) Payout resolves by level. Expect client_price + coach_payout to step up,
--    blocked=false throughout: junior 30/17 -> senior 35/24 -> lead 40/30 (ops 3, floor 3)
UPDATE subscriptions SET coach_level_at_purchase='junior' WHERE id='f4d46e1b-afba-45eb-80d0-71d5d0ebc292';
SELECT 'junior' lvl, calculate_subscription_payout('f4d46e1b-afba-45eb-80d0-71d5d0ebc292');
UPDATE subscriptions SET coach_level_at_purchase='senior' WHERE id='f4d46e1b-afba-45eb-80d0-71d5d0ebc292';
SELECT 'senior' lvl, calculate_subscription_payout('f4d46e1b-afba-45eb-80d0-71d5d0ebc292');
UPDATE subscriptions SET coach_level_at_purchase='lead'   WHERE id='f4d46e1b-afba-45eb-80d0-71d5d0ebc292';
SELECT 'lead'   lvl, calculate_subscription_payout('f4d46e1b-afba-45eb-80d0-71d5d0ebc292');

-- would_block for the real (Senior) coach on online -- expect false (keep 8 >= 3)
SELECT coach_assignment_would_block('92605b68-6f91-4f82-aa91-45b67efbf9c8','5edcae66-284c-482f-becd-f7bf28c3ff1e');

-- 4) Anon denied -- each wrapped so 42501 doesn't abort the txn (expect 42501 x3)
SET LOCAL ROLE anon;
SAVEPOINT a; SELECT calculate_subscription_payout('f4d46e1b-afba-45eb-80d0-71d5d0ebc292'); ROLLBACK TO a;
SAVEPOINT b; SELECT coach_assignment_would_block('92605b68-6f91-4f82-aa91-45b67efbf9c8','5edcae66-284c-482f-becd-f7bf28c3ff1e'); ROLLBACK TO b;
SAVEPOINT c; SELECT get_subscription_price_quote('f4d46e1b-afba-45eb-80d0-71d5d0ebc292'); ROLLBACK TO c;
RESET ROLE;

ROLLBACK;   -- verify-only. Swap to COMMIT to ship. (drift already 0 live)
```

`get_subscription_price_quote` returns 42501 even to a non-anon SQL caller because `auth.uid()` is NULL there — test its happy path from the authenticated app, not the SQL editor.

### 7b. Ship sequence (after 7a outputs match)
1. `supabase migration list` -> confirm only `20260611120000` pending.
2. `supabase db push` (or re-run 7a with `COMMIT`).
3. Deploy `create-tap-payment` edge fn.
4. App smoke test: a real checkout shows the confirm-at-checkout price = the level price and writes `client_price_kwd`; Services page + ComparisonTable show new prices, no Complete tier.

### 7c. Separate, non-blocking
- Reconcile the branching/preview migration source (stuck at 20260209) so branch-based QA works again before launch.
- Dietitian-on-Hybrid/In-Person funding gap: post-launch business decision (new prices don't budget a dietitian line; MOH-blocked anyway).
- Ops figures (Team 2 / Online 3 / Hybrid 5 / In-Person 8) are provisional — validate vs Tap's real fee in the Level Pricing admin tab.
