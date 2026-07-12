# Onboarding visual pass (frontend-only, no flow restructure)

**Status:** Build handoff (2026-07-07, Cowork). **Owner:** terminal CC. Cowork verifies on prod.
**Scope:** the low-risk, buildable-now slice of the onboarding redesign (`docs/ONBOARDING_REDESIGN_MOCKUPS.html`). Widget + styling changes on the **current** step structure — NO step-split, NO mode-aware wizard, NO new screens (those are a separate larger spec). Frontend-only, no schema. English-first; keep layout RTL-capable but don't add Arabic strings (i18n deferred).

Do these in one PR; each is independent enough to review in isolation.

## 1. Drop the gradient + fix safe-area
- `OnboardingForm.tsx` container: replace `bg-gradient-to-br from-background via-background to-primary/5` with a flat `bg-background` (PUB retired gradients elsewhere).
- Ensure the scroll area uses `pb-24 md:pb-8` so content clears the sticky footer / mobile dock (see CLAUDE.md pb-24 rule).

## 2. Remove the dead Discord field
- `ServiceStep.tsx`: delete the "Discord Username (Optional)" input + the "Join our private Discord…" helper/link. Discord is OUT (confirmed decision).
- Stop sending `discord_username` in the submit payload; leave the DB column alone. Confirm `submit-onboarding` doesn't require it (it's optional) — tsc will catch a broken reference.

## 3. Focus areas → chips (reuse the existing component)
- `ServiceStep.tsx`: replace the 15-checkbox grid for `focus_areas` with **`SpecializationTagPicker`** (`src/components/ui/SpecializationTagPicker.tsx`) bound to the `focus_areas` array — same `selectedTags` / `onToggle` shape used in `SpecialistProfile.tsx:259-273`. This gives chips + the `X/15 selected` counter for free, and makes the client's goals visually identical to the coach's expertise picker (same vocabulary, same widget — reinforces the match story).
- Keep the "required for 1:1" validation (`validateStep` service case) — it already checks `focus_areas.length`.
- (Optional, flag if cheap) a "Recommended for your plan" subset above the full list, per the mockup — but shipping the plain picker first is fine; don't block on it.

## 4. Adopt `ClickableCard` for all selection cards
Replace the hand-rolled `<Card onClick role="button" tabIndex onKeyDown>` blocks with `<ClickableCard onClick ariaLabel>` (`src/components/ui/clickable-card.tsx` — it already carries the hover/focus/keyboard a11y):
- Plan cards in `ServiceStep.tsx`.
- `TeamSelectionSection.tsx` team cards.
- `CoachPreferenceSection.tsx` — the auto/specific mode cards AND the coach-list cards (currently bespoke onClick + `hover:shadow-md`). Keep the crimson selected ring (`border-primary ring-2 ring-primary/20 bg-primary/5`); ClickableCard supplies the rest. Pass a meaningful `ariaLabel` per card (plan name / coach name).

## 5. Segmented selectors instead of dropdown walls
`ServiceSpecificStep.tsx` — for the small-option enums, swap the `Select` dropdowns for a segmented control (shadcn `ToggleGroup type="single"`, or a small segmented component matching the mockup's `.seg`):
- `training_experience` (3), `training_days_per_week` (4), `gym_access_type` (3), `nutrition_approach` (4).
- Leave `preferred_gym_location` as a Select for now (it becomes the managed-gyms picker in `MANAGED_GYMS_AND_COACH_LOCATION_BUILD.md`); `preferred_training_times` stays multi-select checkboxes/toggles.
- Keep all field names + validation identical — this is a control swap, not a data change.

## 6. Sticky footer nav on mobile
- The Back / Continue nav (`OnboardingForm.tsx` bottom) becomes a **sticky bottom bar** on mobile (`useIsMobile()` branch): Back · a compact progress indicator (dots or the existing thin bar) · Continue, with safe-area padding. Desktop can keep the inline nav or adopt the same bar. Matches the mockup's `.foot`.
- The top `StepIndicator` stays; on mobile you may slim it since the sticky bar now carries progress too.

## 7. A completion screen before payment
- After successful submit, show a brief **"You're in" finish screen** (recap: plan · coach · focus) with a single "Continue to payment" CTA, instead of the current bare redirect. Small new view, no state-machine change — it renders on submit success then navigates to the existing payment route. (The richer waiting/medical-review states are a later spec.)

## Explicitly NOT in this pass (separate specs)
- Step split (Plan / About you / Goals) + mode-aware wizard (new|change|upgrade|reactivate).
- New screens: team-pick redesign detail, auth/create-account seam, email-verify, waiting/medical-review states.
- Managed gyms (its own spec). Change-plan (gated on Tap).

## Verify (Cowork, prod)
Cowork will clear the +hybrid test sub to reach onboarding (see the test-sub reactivation memory), then check:
- No gradient; content clears the footer (pb-24); no Discord field anywhere.
- Focus areas render as chips with the counter; selecting persists; 1:1 still requires ≥1.
- Plan / team / coach cards are keyboard-focusable (Tab + Enter/Space), correct selected ring, no lost click behavior.
- Segmented controls set the same values the dropdowns did (advance validation unchanged).
- Mobile: sticky footer reachable without a long scroll; safe-area ok; both light + dark.
- Finish screen shows on submit then routes to payment.
- tsc (~303 baseline zero-new), ESLint 0, build clean.
