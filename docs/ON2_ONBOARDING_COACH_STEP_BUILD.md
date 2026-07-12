# ON2 — Dedicated "Choose your coach" onboarding step (1:1 only)

**Status:** Build handoff (2026-07-07, Cowork). **Owner:** terminal CC. Cowork verifies on prod.
**Board:** ON2 (Onboarding, P1). Frontend-only. **No schema change, no new RPC** — every backend piece already exists (see "Already built").

## The gap
`CoachPreferenceSection.tsx` is fully built (auto-match vs. specific cards, capacity-aware coach list, focus-area match scoring + sort, "no coaches available" fallback) but **never rendered anywhere**. The form schema already carries `coach_preference_type` (`"auto"` default) and `requested_coach_id`, and step-0 validation already checks them (`OnboardingForm.tsx:494-500`) — but the client is never shown the UI to set them, so every 1:1 client silently lands on `auto`. ON2 surfaces the picker as its **own step** for 1:1 plans.

Hasan's chosen flow (verbatim): a **dedicated "Choose your coach" step** — "Leads with a 'Recommended for you' coach card, then a browsable list, tap a coach for the full profile (`CoachDetailDialog`), plus an 'auto-match me' option."

## Target flow
- **1:1 plans** (`1:1 Online` / `1:1 Hybrid` / `1:1 In-Person`): Service → Service Details → **Choose Coach** → Health → Legal (5 steps).
- **Team plans** (`Team Plan` / `Fe Squad` / `Bunz of Steel`): Service → Service Details → Health → Legal (4 steps, unchanged — no coach selection).

## Already built (reuse as-is, do NOT rebuild)
- `src/components/onboarding/CoachPreferenceSection.tsx` — props `{ form, planType: 'online'|'hybrid'|'in_person', focusAreas: string[] }`. Renders the two mode cards + the capacity-aware coach grid, sorts by `calculateMatchScore(specializations, focusAreas)` then available spots, auto-falls-back to `auto` when no coaches are available. **This is the step body.**
- `list_active_coaches_for_service(p_service_id)` RPC (migration `20260523084526`) — client-safe (SECURITY DEFINER; the `coaches_client_safe` view is RLS-broken pre-subscription, RPC is the correct source), returns only coaches with `available_spots > 0` with capacity counts server-side.
- `assign_coach_atomic` — called by `submit-onboarding/index.ts:471-482`. Honors `coach_preference_type`/`requested_coach_id`: `specific` → capacity-checked assign to the chosen coach; `auto` → focus-area scoring + load-balanced match. **Assignment is already wired end-to-end** — ON2 only feeds it the client's choice.
- `src/components/CoachDetailDialog.tsx` — reusable rich coach profile (used by MeetOurTeam) for the "View profile" affordance.
- Schema defaults already correct (`OnboardingForm.tsx:138-139`).

## The core work: convert the index-based wizard to a key-based dynamic step array
`OnboardingForm.tsx` today hardcodes numeric steps in three places that must stay in lockstep — inserting a conditional step by number is fragile. Refactor to derive steps from plan type and drive everything off a stable step **id**.

1. **Dynamic steps.** Replace `const steps = ["Service", "Service Details", "Health", "Legal"];` (L153) with a memoized array of `{ id, label }` built from `selectedPlanName`:
   ```ts
   const isOneToOne = ["1:1 Online", "1:1 Hybrid", "1:1 In-Person"].includes(selectedPlanName);
   const steps = useMemo(() => [
     { id: "service",  label: "Service" },
     { id: "details",  label: "Service Details" },
     ...(isOneToOne ? [{ id: "coach", label: "Choose Coach" }] : []),
     { id: "health",   label: "Health" },
     { id: "legal",    label: "Legal" },
   ], [isOneToOne]);
   ```
   Keep a helper `const stepId = steps[currentStep]?.id`.

2. **Guard the shrink.** If a client is on the coach step (or later) and then switches back to a team plan, `currentStep` can exceed the new array length. Clamp on change: `useEffect(() => { setCurrentStep(s => Math.min(s, steps.length - 1)); }, [steps.length]);`

3. **Render by id, not number** (L770-773): switch `currentStep === 0/1/2/3` → `stepId === "service"/"details"/"coach"/"health"/"legal"`. Add `{stepId === "coach" && <ChooseCoachStep form={form} planName={selectedPlanName} />}`.

4. **Validate by id, not number.** Rewrite `validateStep`'s `switch (step)` (L481) to `switch (steps[step]?.id)`:
   - `service`: keep the current field list. **Keep the `focus_areas` non-empty check** (the coach step sorts by it) but **move the coach-selection validation out** (L494-500) — it belongs to the `coach` step now.
   - `details`: current `case 1` body unchanged.
   - `coach`: new — if `coach_preference_type === "specific" && !requested_coach_id`, set the `requested_coach_id` error and return false; otherwise valid (auto needs no selection).
   - `health` / `legal`: current `case 2` / `case 3` bodies unchanged.

5. **Fix the two hardcoded final-step guards:**
   - L762 `if (currentStep !== 3)` → `if (stepId !== "legal")` (prevents Enter-key submit before the last step).
   - L801 `currentStep < steps.length - 1` is already length-based — leave it, it now works for both 4- and 5-step flows.
   - The submit's DOB-fallback `setCurrentStep(0)` (L601) stays (step 0 is always `service`).

## New component: `src/components/onboarding/ChooseCoachStep.tsx`
Thin wrapper that adapts form state to `CoachPreferenceSection` and adds the profile affordance:
- Derive `planType` from `planName`: `{ "1:1 Online":"online", "1:1 Hybrid":"hybrid", "1:1 In-Person":"in_person" }`.
- Read `focusAreas = form.watch("focus_areas") ?? []`.
- Header: a short title + subtext ("Pick the coach you'd like to work with, or let us match you.").
- Render `<CoachPreferenceSection form={form} planType={planType} focusAreas={focusAreas} />`.
- **"Recommended for you" highlight:** `CoachPreferenceSection` already sorts best-match-first, so the top coach card = the recommendation. Minimal lift: pass an optional flag/prop into `CoachPreferenceSection` to badge the first card ("Recommended") when `preferenceType === "specific"` and `matchScore > 0`. If you'd rather not touch the shared component, render a one-line "★ Top match: {firstCoach.first_name}" hint above it instead — either is acceptable; don't fork the list.
- **View profile:** add a small "View profile" button on each coach card (inside `CoachPreferenceSection`, guarded so the card's select `onClick` doesn't also fire — `stopPropagation`) that opens `CoachDetailDialog` for that coach. If `CoachDetailDialog` needs a coach id/shape the RPC doesn't return, keep ON2 scoped: wire the button to open the dialog by `coach.user_id`/`coach.id` and let the dialog fetch its own detail (it already does for MeetOurTeam). If the dialog's data contract doesn't fit the onboarding (pre-subscription) RLS context, **ship ON2 without View-profile and flag it** — the step + recommended highlight are the must-haves; profile dialog is the nice-to-have.

## Reuse / don't
- **Reuse:** `CoachPreferenceSection`, `list_active_coaches_for_service`, `assign_coach_atomic` (via `submit-onboarding`, untouched), `CoachDetailDialog`.
- **Don't:** add a new RPC, a new coach query, or a second sort. Don't render the coach step for team plans. Don't remove the step-0 `focus_areas` validation (the coach sort depends on it). Don't change `submit-onboarding` — it already reads the two form fields.

## Verify (Cowork, prod)
1:1 flow (use `dr.ironofficial+<tier>@gmail.com` test path or a fresh 1:1 service link):
- Wizard shows **5** steps with "Choose Coach" between Service Details and Health; progress/step counter reflects 5.
- The coach step renders the auto/specific cards; "specific" reveals the capacity-aware list sorted best-match-first; the top card reads as recommended; "spots left" badges present.
- Selecting "specific" without a coach blocks Next with the field error; selecting a coach or switching to "auto" advances.
- (If shipped) "View profile" opens `CoachDetailDialog` and closing it doesn't select/deselect the card.
- Submitting with a specific coach assigns that coach; submitting on auto assigns via match — confirm on prod (`subscriptions.coach_id` / the new relationship row) for the test client.
- Team flow (`Team Plan`): still **4** steps, no coach step, submits cleanly (regression check on the index refactor).
- Switching plan 1:1 → team mid-wizard doesn't strand `currentStep` past the array end (clamp works).
- Mobile: step body scrolls, coach list `ScrollArea` usable, no overflow behind the dock; tsc (~306 baseline, zero-new), ESLint 0, build clean.
