# Onboarding structural redesign — build spec (phased)

**Status:** Build handoff (2026-07-07, Cowork). **Owner:** terminal CC. Cowork verifies on prod.
**Source of truth:** approved mockup `docs/ONBOARDING_REDESIGN_MOCKUPS.html`. The visual pass (chips, ClickableCard, segmented, sticky footer, finish screen) already shipped; this is the **structural** layer on top of it. English-first; keep layout RTL-capable, no Arabic strings yet.

Build in the parts below, each an independently-shippable PR with its own verify. **Recommended order: A → B → E → C → D.** A is the foundation the others attach to.

## Current structure (post-visual-pass), for reference
`OnboardingForm.tsx`: plan-derived step array (`OnboardingForm.tsx:165` — `service, details, [coach if 1:1], health, legal`), `stepId = steps[currentStep]?.id` (L175), `validateStep` switches on `steps[step]?.id` (L509), render by `stepId` (L847-851). `ServiceStep` currently holds personal info + plan cards + focus-area chips + heard-about-us (+ `TeamSelectionSection` for team). `ServiceSpecificStep` holds the per-service "details". A finish screen already renders on submit.

---

## Part A — Step split: Plan / About you / Goals  (foundation)
Split the overloaded `service` step into three lighter steps (the core of the redesign).

**New step array** (`OnboardingForm.tsx:165`):
- 1:1: `plan → about → goals → details → coach → health → legal` (7)
- Team: `plan → about → team → health → legal` (5) — `team` replaces `details`+`goals`+`coach` (see Part B; until B ships, keep team on `details`).

**Split `ServiceStep.tsx` into three step components** (or keep one component that renders by a `section` prop):
- `PlanStep` — the 4 plan ClickableCards + "How did you hear about us?" (+ the "You've selected X / Change" affordance). Owns `plan_name`, `heard_about_us`.
- `AboutYouStep` — personal info + demographics: `first_name, last_name` (email locked/read-only), `phone_number/country_code`, `date_of_birth`, `gender`, `height_cm`. (Discord already removed.)
- `GoalsStep` — the `focus_areas` `SpecializationTagPicker` (chips + counter). 1:1 only; team skips it.

**`validateStep`** (`OnboardingForm.tsx:509`) — split the `service` case into three:
- `plan`: `plan_name`, `heard_about_us`.
- `about`: `first_name, last_name, email, phone_number` (+ `date_of_birth` required as today's submit guard expects).
- `goals`: `focus_areas.length >= 1` for 1:1 (the check currently at L516-522).

**Render** (`OnboardingForm.tsx:847`) — add `stepId === "plan" | "about" | "goals"` branches; keep `details/coach/health/legal`.

**Draft/`current_step`:** the auto-save already stores `current_step` as an index; since the array changed length, add a **one-time clamp/migration on load** (a draft saved at old index N may land on a different step — clamp to valid range and don't crash). Reuse the existing shrink-clamp effect pattern (`OnboardingForm.tsx:179`).

Frontend-only, no schema. Verify: 1:1 shows 7 steps in the mockup order, team shows the shorter flow, all fields still validate + submit identically, sticky footer + finish screen intact, light+dark.

---

## Part B — Team flow as its own step
Today team uses `TeamSelectionSection` inside `ServiceStep` + acknowledgment checkboxes in `ServiceSpecificStep`. Give team its own step.

- New `TeamStep` (team plans only, inserted after `about`): the redesigned **team-pick cards** (head-coach name + spots + `Full → waitlist`) using `ClickableCard`, then the **acknowledgments as agreement rows** (`accepts_team_program`, `understands_no_nutrition`, + `accepts_lower_body_only` for Bunz of Steel) — same row style as `LegalStep`.
- Move the team validation (`validateStep` L536-556) to the `team` case; remove team branches from `details`.
- Team step array becomes `plan → about → team → health → legal`. `TeamSelectionSection` logic is reused inside `TeamStep`.

Depends on Part A's step model. Frontend-only. Verify: team signup shows the team-pick + acknowledgments as a dedicated step; Full teams show waitlist; submit unchanged.

---

## Part E — Account-creation + email-verify seam
The wizard assumes an account exists (`Services → /auth?signup → /onboarding`). Polish the seam per the mockup.

- `Auth.tsx` signup: add **confirm-email** + **confirm-password** fields and a **password-requirements hint** under the password field. **The hint text + validation must match the actual Supabase auth password policy** — check the configured policy and mirror it (don't hardcode a stronger rule than enforced).
- **Email-verify** screen: a calm "Check your inbox" state (the mockup) between signup and the wizard; reuse/point at the existing `email-confirmed` route. Add a "Resend" affordance if not present.
- Keep the `?service=` param flowing through auth → onboarding so plan preselection survives signup.

Independent of A/B. Verify: signup requires matching email + password with a visible rules hint; verify screen shows; `?service=` survives.

---

## Part C — Mode-aware wizard + reactivation
Introduce a wizard `mode: "new" | "reactivate"` (the `change`/`upgrade` modes come with the Change-plan spec later).

- **Reactivation:** a returning client whose sub is `cancelled`/`expired` (they can already re-enter onboarding — the guard only blocks `active`) sees a **"Welcome back"** entry that **skips what's on file** (PAR-Q, demographics, legal already accepted) and routes `plan → [details/coach as needed] → payment`. Pre-fill from their existing `profiles_*` + last `form_submissions`.
- Detect mode on load: if the user has a prior completed submission / prior sub, offer reactivation; else `new`.
- Skipped steps must still be *editable* (a "review your details" affordance), just not forced.

Depends on Part A. Verify: a cancelled test client re-entering onboarding gets the welcome-back path and doesn't re-answer PAR-Q/legal; a brand-new client gets the full flow.

---

## Part D — Waiting states + payment step
Onboarding doesn't end at submit — design the post-submit surfaces (today they're a thin limited-UI in `ClientDashboardLayout`).

- **Status screens** for `needs_medical_review`, `pending_coach_approval`, `pending_payment` — calm, branded (the mockup's "we're reviewing your health form" pattern), with "what you can do while you wait" (exercise library / calorie calc) and the right CTA (pay / nothing). Render in the client dashboard limited-UI (`ClientDashboardLayout` + `OnboardingGuard` dashboard passthrough — see CLAUDE.md).
- **Payment step** presentation: a clear plan summary + single "Pay X KWD" CTA (the mockup), replacing the bare redirect. Ties to `PaymentReturn`/`verify-payment` (unchanged logic; manual-pay model per `project_igu_payment_model_manual`). A PAR-Q "Yes" routes to the medical-review status.

Mostly a dashboard/guard surface, not the wizard. Independent of A. Verify (Cowork, prod): drive a test client into each status and confirm the screen; payment step shows the summary + CTA.

---

## Cross-cutting
- Reuse existing primitives: `ClickableCard`, `SpecializationTagPicker`, the `SegmentedField` from the visual pass, the sticky footer, `StepIndicator`.
- Keep all field names + the `submit-onboarding` payload identical unless a part explicitly changes them.
- `pb-24` + safe-area on every new step (CLAUDE.md mobile rule).
- After each part: tsc (~303 baseline zero-new), ESLint 0, build; Cowork verifies on prod (clears the +hybrid sub to reach onboarding).
