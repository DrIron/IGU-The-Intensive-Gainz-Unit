# Change plan — build spec

**Status:** Build handoff (2026-07-08, Cowork). **Owner:** terminal CC. Cowork verifies on prod.
**Companions:** `docs/CHANGE_PLAN_BILLING_ANALYSIS.md` (analysis), `docs/ONBOARDING_SERVICE_FLOW_MAP.md`, `docs/MANAGED_GYMS_AND_COACH_LOCATION_BUILD.md`. Manual-pay model (`project_igu_payment_model_manual`) — **no recurring Tap subscription to modify**, so this is internal work only, no Tap-subscription dependency.

## Decisions (locked by Hasan 2026-07-08)
1. **Timing:** upgrades AND downgrades take effect **at the next due date** — no proration, no immediate top-up charge either way.
2. **Downgrade:** at next due date (client keeps what they paid for).
3. **Coach:** keep the current coach when they offer the new tier and have capacity; else re-pick. Screen handles both.
4. **Subscription record:** **new sub + end old + migrate links** (not row mutation) — clean audit; the link-migration helper also fixes the existing cancel-orphan gap.
5. **Driver:** **client self-serve** (from billing).
6. **Scope:** **all transitions** — 1:1↔1:1, Team↔1:1 (both directions), Team↔Team.

---

## The timing model (committed — this is the crux; read first)
"Effective at next due date" means a change is **requested now but applied at the client's `subscriptions.next_billing_date`**, not immediately. This is the only faithful reading of decisions #1+#2 (a mid-cycle downgrade must NOT strip already-paid premium access; an upgrade must NOT charge now).

**So a change is a *scheduled* operation, not an instant switch:**
- **On request:** validate + preview price, write a `subscription_change_requests` row (status `scheduled`). The client's **current** subscription/coach/team/program are untouched — they keep current-tier service until `next_billing_date`. The client sees "Your plan changes to **X** on **<next due date>** — you'll pay **Y KWD** then."
- **On the next billing cycle:** the renewal reminder + payment reflect the **new** plan/price. When the client pays for the new cycle (`verify-payment` sees a due scheduled change) — or a daily safety cron `process-plan-changes` fires at `effective_at` — the change **applies**: new sub row (active, new `service_id`/price/`team_id`), coach via `assign_coach_atomic` (capacity re-checked *then*, not held for a month), links migrated old→new, old sub ended, payout recomputed, request marked `applied`.
- The client can **cancel a scheduled change** any time before it applies (reverts to nothing-changed).

> **CC checkpoint (not a blocker):** if we'd rather ship the lighter "apply immediately, bill new price next cycle, no proration" model (much less build — no scheduling/apply-hook, but a mid-cycle downgrade would drop premium access early and an upgrade is a free remainder-of-cycle), flag it in the PR and we'll confirm with Hasan. **Default = the scheduled model above.** Everything below assumes scheduled.

---

## Architecture (4 moving parts)
1. **`subscription_change_requests`** — new table (schedule + audit). Migration.
2. **`migrate_subscription_links(p_old_sub, p_new_sub)`** — reusable SECURITY DEFINER helper that re-points coach/nutrition/program links old→new. Used by apply, and retrofits cancel-cleanup.
3. **`change-service` edge function** (service-role) — two actions: `schedule` (validate + preview + write request) and `apply` (materialize; called by cron + verify-payment).
4. **Dedicated `/change-plan` flow** (its own thin wizard shell) that **reuses the onboarding step components** (`PlanStep`, `GoalsStep`, `ChooseCoachStep`, `TeamSelectionSection`) + a **billing entry point** in `BillingPayment.tsx`. **[Revised 2026-07-08 — see note below; supersedes the earlier `mode="change"` on `OnboardingForm` approach.]**

> **Approach revision (2026-07-08, Cowork + CC):** the spec originally pinned a third `mode="change"` inside `OnboardingForm.tsx`. Since Part A split the wizard into standalone step components (`PlanStep`/`GoalsStep`/`ChooseCoachStep` + reusable `TeamSelectionSection`), the reuse we wanted (don't rebuild plan cards / coach picker / team picker) is achievable via **component** reuse without threading a divergent third mode through a 1000-line file. The change flow differs materially from onboarding — entered by an **active** client from billing, skips About/PAR-Q/legal, and its terminal action is `change-service:schedule` (**not** `submit-onboarding`). Threading that into `OnboardingForm`'s already-complex `onSubmit`/mode branching risks regressing the new/reactivate paths we just stabilized (P0 + Part D). **Decision: build a dedicated `/change-plan` flow with its own lightweight shell (step array, sticky footer, StepIndicator) that imports the shared step components.** Accept the small scaffolding duplication; keep `OnboardingForm`'s submit path untouched.

### 1) Data model — `subscription_change_requests`
```sql
CREATE TABLE public.subscription_change_requests (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL,
  current_subscription_id  uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  target_service_id        uuid NOT NULL REFERENCES public.services(id),
  target_team_id           uuid REFERENCES public.coach_teams(id),         -- team target only
  coach_preference         text NOT NULL DEFAULT 'auto',                   -- 'auto' | 'keep' | 'specific'
  requested_coach_id       uuid,
  focus_areas              text[] NOT NULL DEFAULT '{}',
  target_price_kwd         numeric,                                        -- previewed new price (snapshot)
  effective_at             timestamptz NOT NULL,                          -- = current sub next_billing_date
  status                   text NOT NULL DEFAULT 'scheduled'              -- scheduled | applied | cancelled | needs_admin
                             CHECK (status IN ('scheduled','applied','cancelled','needs_admin')),
  applied_subscription_id  uuid REFERENCES public.subscriptions(id),      -- set on apply
  requested_at             timestamptz NOT NULL DEFAULT now(),
  applied_at               timestamptz,
  block_reason             text                                           -- if needs_admin (guardrail)
);
-- one open request per user (partial unique)
CREATE UNIQUE INDEX uq_scr_one_open ON public.subscription_change_requests(user_id)
  WHERE status = 'scheduled';
```
**RLS:** client can `SELECT`/`INSERT`(via edge fn only)/`UPDATE`(cancel own scheduled) their own rows; admin all; care-team read. **Follow the SECURITY DEFINER REVOKE pattern** (CLAUDE.md) on any RPC. Writes to this table go through the edge function (service-role), not client-direct, except the client's own **cancel** (`scheduled → cancelled`).

### 2) `migrate_subscription_links(p_old_subscription_id uuid, p_new_subscription_id uuid)` — SECURITY DEFINER, `RETURNS jsonb`
Re-points, inside one transaction, from old→new sub:
- `coach_client_relationships` — end (`ended_at=now()`) the old sub's active rows; the NEW coach rel is created by `assign_coach_atomic` at apply (don't copy the old coach blindly — a tier change may re-pick).
- `nutrition_phases` — the active phase is keyed by `user_id` (not subscription), so it **carries automatically**; assert the single-active invariant still holds (don't duplicate). No re-point needed, but confirm it isn't accidentally deactivated.
- `client_plan_assignment` — update `subscription_id` (and `team_id`/`primary_coach_id` if the coach/team changed) from old→new so the canonical program assignment follows the client. Preserve logs (this is the P5 canonical table — never orphan it).
Return a summary `{ coach_rows_ended, plan_assignments_moved, nutrition_active }`. **Reuse for cancel-cleanup** (the analysis §5 orphan gap): calling it on cancel with a null new-sub just ends the coach rel + detaches the assignment cleanly.

### 3) `change-service` edge function (service-role, `--no-verify-jwt`, internal auth check — mirror submit-onboarding)
**Action `schedule`** (called by the wizard on confirm):
- Auth: the caller must be the subscription owner (or admin).
- Validate the transition is in-scope (all allowed) and that current sub is `active`.
- **Preview price + payout:** resolve the new price for `target_service_id` at the client's level (reuse `get_subscription_price_quote` shape / `CLIENT_PRICE_PER_LEVEL`), and run a payout preview for the new tier. **Guardrails (§4 of analysis):** 5 KWD min IGU profit, 30% max discount, Lead-coach tier restriction. If a guardrail blocks the *auto/self-serve* path → write the request `status='needs_admin'` + `block_reason`, and the client sees "this change needs a quick review — we'll follow up" (graceful, not a hard error).
- Write the `subscription_change_requests` row (`effective_at = current sub next_billing_date`; if that's null/past, use `now()` and note it applies at the next payment).
- Do **not** touch the current subscription.

**Action `apply`** (called by cron `process-plan-changes` at `effective_at`, and by `verify-payment` when the client pays a cycle that has a due scheduled change):
- Load the `scheduled` request; idempotency guard (skip if already `applied`).
- Create the new `subscriptions` row (status `active`, `service_id`=target, `client_price_kwd`=previewed, `team_id`=target or null, `next_billing_date`=one cycle out).
- `assign_coach_atomic(p_user_id, target_service_id, focus_areas, requested_coach_id, is_team_plan, target_team_id, …)` — capacity re-checked now. `coach_preference='keep'` → pass the current coach as `requested_coach_id`; the RPC falls back to auto if they can't take the new tier.
- `migrate_subscription_links(old, new)`.
- End the old sub (`status='cancelled'`/`expired` per your convention, keep for audit).
- **Recompute payout** via `calculate_subscription_payout(new_sub_id)` — **never carry the old number** (PR #159/#161 lineage). Payment-exempt stays zero + out of `paying_subscriptions`.
- Mark request `applied` + `applied_subscription_id`; audit row.

### 4) Dedicated `/change-plan` flow + billing entry
- **Entry:** `BillingPayment.tsx` (`/billing/pay`) — add a **"Change plan"** action on the current-plan card (`PlanBillingCard`), routing to **`/change-plan`**. If a `scheduled` request already exists, show its summary + **"Cancel scheduled change"** instead of the entry (one open change at a time).
- **New page `src/pages/ChangePlan.tsx`** — a thin wizard shell (own step array + sticky footer + `StepIndicator`, mirror the onboarding scaffolding) that **imports and renders the shared step components** (`PlanStep`, `GoalsStep`, `ChooseCoachStep`, `TeamSelectionSection`) — do NOT fork their internals. Guard: only reachable by an **active** client (redirect others). Uses its own local form state; prefill from current sub + `profiles_*` (you can lift the `loadReactivationData` fetch shape into a shared helper if convenient, but don't route through `OnboardingForm`). Skip PAR-Q/legal (on file). Route added to `App.tsx` + client mobile-nav prefix list (CLAUDE.md rule); wrap in the client auth/role guard. Step array by target:
  - **→ 1:1:** `plan → [goals if focus areas need re-confirming] → [details if In-Person/Hybrid & gym unknown] → [coach: shows "keeping <coach>" or a re-pick] → confirm`.
  - **→ Team:** `plan → team (TeamSelectionSection + acks) → confirm`.
  - The **confirm** step is a change-summary: **from → to**, new price, **when** ("effective <next due date>"), coach kept/changed. Its CTA calls `change-service:schedule` (NOT submit-onboarding). No payment now.
- Reuse `TeamSelectionSection` (`src/components/onboarding/TeamSelectionSection.tsx`, already standalone-reusable) for the →Team path.

---

## Per-transition matrix (what gets re-asked)
| Transition | Coach | Team | Re-ask | Notes |
|---|---|---|---|---|
| 1:1 → 1:1 (same category) | keep if offers new tier + capacity, else re-pick | n/a | gym only if →In-Person/Hybrid & unknown | dietitian added/removed for Complete/Hybrid/In-Person — handled by payout recompute, no client step |
| 1:1 → Team | dropped; head coach of chosen team | pick team + acks | — | focus areas not used by team |
| Team → 1:1 | re-pick via `assign_coach_atomic` | leave team | focus areas + details (gym) | biggest jump |
| Team → Team | head coach of new team | pick new team + acks | — | |

Existing active clients skip medical-review + legal (already cleared) — mode="change" never routes to those.

## Self-serve guardrails (graceful)
Client-driven means blocks must read as help, not errors. If `schedule` hits a guardrail (min-profit / Lead-coach restriction / no coach available for the target at their gym) → request `needs_admin` + a calm "we'll review and follow up" screen (and an admin surface to resolve). Never expose IGU profit math to the client.

## Edge cases
- **Payment-exempt (comp) clients:** a change keeps them exempt + zero payout + out of `paying_subscriptions`; no price shown, confirm reads "your plan will change on <date>, no payment needed."
- **One open change at a time** (partial unique index). A new request while one is `scheduled` → offer to replace it.
- **Cancel before apply** reverts cleanly (request `cancelled`, nothing else touched).
- **`next_billing_date` null/past** → applies at the next payment; state that in the confirm copy.
- **Idempotency:** `apply` is safe to call twice (cron + verify-payment may both fire) — guard on `status='scheduled'`.
- **`nutrition_phases` carries by `user_id`** — assert it's not deactivated during migration.

## Reuse / real refs (from code, don't reinvent)
- `assign_coach_atomic(p_user_id, p_service_id, p_focus_areas, p_requested_coach_id, p_is_team_plan, p_selected_team_id, …)` — coach/team assignment at apply.
- `calculate_subscription_payout(p_subscription_id, p_discount_percentage)` — payout recompute (new tier).
- `list_active_coaches_for_service(p_service_id, p_gym_id)` — coach availability for the re-pick / "keep" check.
- `get_subscription_price_quote(p_subscription_id)` shape — price resolution for the preview.
- Subscription insert shape: mirror `create-manual-client` (`status`, `service_id`, `start_date`, `coach_id`, …) / `submit-onboarding`.
- `TeamSelectionSection` (`src/components/onboarding/TeamSelectionSection.tsx`).
- `BillingPayment.tsx` / `PlanBillingCard.tsx` for the entry point.

## Phasing (independently shippable)
- **CP1 — foundation:** `subscription_change_requests` table + `migrate_subscription_links` helper (+ retrofit cancel-cleanup to use it). Verify: helper re-points links on a test sub; cancel no longer orphans.
- **CP2 — schedule + entry (1:1↔1:1):** `change-service:schedule` (DONE), dedicated `/change-plan` flow for 1:1↔1:1 (reusing step components), billing "Change plan" entry, pending-change display + cancel. Verify: a 1:1 client schedules a change; request row correct; current sub untouched; client sees the scheduled summary.
- **CP3 — apply at billing:** `process-plan-changes` cron + `verify-payment` hook + payout recompute. Verify: force `effective_at` past on a test request → apply materializes new sub, migrates links, ends old, payout correct for new tier.
- **CP4 — Team↔1:1 + Team↔Team:** TeamSelectionSection path, focus re-ask, head-coach routing. Verify each direction.
- **CP5 — self-serve guardrails + polish:** `needs_admin` path + admin resolve surface; exempt handling; copy.

## Gates + verify
- CC per phase: `tsc -p tsconfig.app.json` (~303 baseline, zero-new), ESLint 0, build clean.
- Cowork (prod, +hybrid + a fresh test sub per tier): schedule each transition, confirm the request row + client-facing summary; force-apply and confirm new sub + migrated coach/nutrition/program links + recomputed payout + old sub ended; exempt stays zero/out of `paying_subscriptions`; cancel reverts; one-open-change enforced. Restore test state + waitlist ON after.
