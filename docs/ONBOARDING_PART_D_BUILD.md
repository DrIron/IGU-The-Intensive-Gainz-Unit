# Onboarding Part D — Waiting states + payment step (build spec)

**Status:** Build handoff (2026-07-08, Cowork). **Owner:** terminal CC. Cowork verifies on prod.
**Source of truth:** approved mockup `docs/ONBOARDING_REDESIGN_MOCKUPS.html` (lines 382-406 — "After Finish: payment & the waiting states"). Part of the onboarding redesign arc (`docs/ONBOARDING_STRUCTURAL_REDESIGN_BUILD.md` § Part D). English-first, RTL-capable, no Arabic strings yet.

## What this is (and isn't)
The post-submit surfaces **already exist** — they're just thin `Alert` blocks. This is a **redesign to the mockup's calm/branded pattern**, NOT net-new plumbing. **No status-machine, guard, or payment-logic changes.** `create-tap-payment`, `PaymentReturn`, `verify-payment`, `OnboardingGuard`, and the manual-pay model (`project_igu_payment_model_manual`) all stay exactly as they are.

**Canonical surface = the dashboard limited-UI in `ClientDashboardLayout`** (`src/components/client/ClientDashboardLayout.tsx`). `OnboardingGuard` routes every incomplete client to `/dashboard`, so that's where these screens live. The standalone `/pages/onboarding/{MedicalReview,AwaitingApproval,Payment}.tsx` pages are a parallel/legacy surface — **D3 below** resolves them (don't redesign both).

---

## D1 — Shared `OnboardingStatusScreen` component
New `src/components/onboarding/OnboardingStatusScreen.tsx`. One calm, branded, centered screen driven by a status key. Mockup ref: lines 398-406.

**Layout** (matches mockup):
- Centered column, `pb-24 md:pb-8`, max-w ~`md`.
- Tinted icon chip (60px rounded, tone-colored bg — amber/blue/emerald per status) with a lucide icon.
- `font-display` title (~19-21px), muted reassuring subtext.
- A **"While you wait"** recap card (reuse `Card`, muted `desc` label + one line) — see D4 for the links decision.
- CTA area (bottom): the right button per status (below).

**Props:**
```ts
interface OnboardingStatusScreenProps {
  status: "needs_medical_review" | "pending_coach_approval" | "pending_payment";
  clientName?: string;            // greeting; from profiles_public.first_name
  onPay?: () => void;             // only pending_payment; wire to existing create-tap-payment path
  isPaying?: boolean;             // spinner on the pay CTA
}
```

**Per-status config** (single `Record<status, {...}>` in the component — no `.replace()`/switch sprawl):

| status | icon / tone | title | subtext | CTA |
|---|---|---|---|---|
| `needs_medical_review` | Clock/Shield, amber | "We're reviewing your health form" | "You flagged something on the PAR-Q, so a coach is giving it a quick look -- usually within a day. We'll email you." | ghost "Back to dashboard" (no action needed) |
| `pending_coach_approval` | UserCheck, blue | "Your coach is reviewing your info" | "We're pairing you with the right coach -- usually within a day. We'll email you when you're cleared to start." | ghost "Back to dashboard" |
| `pending_payment` | CreditCard, emerald | "You're almost in" | "Your spot is ready -- activate your plan to get started." | primary "Continue to payment" → renders the D2 payment step |

Copy uses `--` not `—` (CLAUDE.md). Keep it reassuring, not clinical (wellbeing tone — a flagged PAR-Q shouldn't read as alarming).

---

## D2 — Payment step redesign
Redesign the **presentation** of `src/components/client/PaymentStatusDashboard.tsx` (the live `pending_payment` surface, embedded in `ClientDashboardLayout` L265-283 and also `/pages/PaymentStatus.tsx`). Mockup ref: lines 386-396.

**Target:** a clean plan-summary card + one CTA, replacing the current dense layout:
- Summary `Card`:
  - Row: plan name (e.g. "1:1 Hybrid") · price value.
  - Row: muted "Billed monthly · cancel anytime" (this is the **manual-renewal** model — copy must not imply auto-charge; say "renew monthly" not "auto-billed").
  - Divider row: **"Due today"** + large price number (`font-display`).
- Single primary CTA: **"Pay {amount} KWD"** → the existing `create-tap-payment` invoke + `window.location.href = paymentUrl` (PaymentStatusDashboard.tsx L430/L449 — **unchanged logic**, restyled button).

**Keep** (don't drop existing functionality, just declutter it): the discount-code entry, the `payment_deadline` countdown, and the billing breakdown — collapse them into secondary/expandable affordances beneath the summary so the primary path is "see price → pay". If the countdown/discount crowd the mockup's calm look, put them below the CTA, not above it.

**Do NOT** touch: `create-tap-payment` body/params, `PaymentReturn.tsx`, `verify-payment`, the `paymentVerified` navigation-state handoff, or the `ClientDashboardLayout` fallback verify on `?tap_id` (L100-123).

---

## D3 — Reconcile the standalone `/onboarding` status pages
`/pages/onboarding/MedicalReview.tsx` + `AwaitingApproval.tsx` (+ any `Payment.tsx`) duplicate these surfaces with the older `OnboardingStepTracker` pattern. Pick one, in the PR:
- **If they're still routed** (check `App.tsx` / `routeConfig.ts`): point them at the shared `OnboardingStatusScreen` (or redirect to `/dashboard`) so there's one surface, not two that can drift.
- **If they're dead** (no route): note it in the PR and leave for a separate cleanup, or delete if trivially unreferenced.

State which case is true in the PR — don't silently leave two divergent designs.

---

## D4 — "While you wait" links (decide + implement)
The mockup offers "Explore the exercise library & calorie calculator" while waiting. Constraint: `OnboardingGuard` only lets **dashboard paths** through for incomplete clients — `/workout-library` is client-gated and would bounce to `/dashboard`, while `/calorie-calculator` is a **public** page (in the WaitlistGuard public list) and is reachable.

**Default (do this unless told otherwise):** the "While you wait" card links only to what actually works without loosening the guard — **Calorie Calculator** (public) and **Educational Videos** if reachable. Drop the exercise-library link rather than ship a dead bounce. If we want the library reachable during waiting, that's a deliberate `OnboardingGuard` allowlist change — **flag it, don't do it inline.**

---

## Edge cases (must hold)
- **`payment_exempt` clients never see a pay CTA.** ClientDashboardLayout already excludes them (L265-283 checks `!payment_exempt`). The `pending_payment` status screen's pay CTA must respect the same exclusion (an exempt client in `pending_payment` should see a neutral "you're all set / activating" state, never "Pay X").
- **Legacy `approved` = alias for `pending_payment`** (`isLegacyApproved`, L80-81) — the redesigned payment surface must trigger for both, as today.
- **PAR-Q "Yes" → `needs_medical_review`** routing is unchanged (submit-onboarding sets the status); D1 just renders it calmly.
- Screens are read from `profiles_public.status` (+ `subscriptions.status`) exactly as today — no new fetch, no status writes from these screens.

## Reuse / constraints
- Primitives: `Card`/`CardContent`, `Button`, `ClickableCard` (for the "while you wait" card if it navigates), lucide icons, `font-display` for hero numbers/titles, `cn()`. Match the `NutritionPhaseCard`/`MetricCard` calm aesthetic (flat, crimson hero number, no consumer progress rings).
- `pb-24 md:pb-8` + safe-area on every screen (CLAUDE.md mobile rule).
- Light + dark, RTL-capable layout.
- Copy: `--` never `—`.

## Gates + verify
- CC: `tsc -p tsconfig.app.json` (~303 baseline, zero-new), ESLint 0, build clean. Screenshot each status in the browser.
- Cowork (prod): drive the +hybrid test client into each status and confirm the redesigned screen renders (mobile + desktop, light + dark):
  - `needs_medical_review`, `pending_coach_approval`, `pending_payment` → each calm status screen.
  - `pending_payment` → payment summary card + single "Pay X KWD" CTA; clicking it reaches the Tap redirect (I'll stop before actually paying).
  - `payment_exempt` + `pending_payment` → no pay CTA.
  - "While you wait" links go somewhere real (no bounce).
