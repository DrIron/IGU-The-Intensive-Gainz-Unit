# BUG6 — Mobile swap-exercise picker drifts/clips when the keyboard opens

**Status:** Drop-in spec (2026-06-22, Cowork). **Priority / effort:** P1 (bug) / S. Frontend only — props change on one Drawer, no DB/migration. Mirrors an existing in-repo fix.

## Symptom
On mobile, mid-workout, when a client taps **Swap** on an exercise and then taps the **"Search exercises…"** field, the bottom sheet **drifts upward and the "Swap Exercise" title clips off the top of the screen** as the keyboard opens.

## Root cause (confirmed from code + in-repo precedent)
The picker is `SwapExercisePicker` in `src/pages/client/WorkoutSessionV2.tsx` (~L1096-1210). Its mobile branch renders a vaul `<Drawer open onOpenChange={…}>` (L1196) with **no `repositionInputs` prop**.

- vaul is `^0.9.9`, where **`repositionInputs` defaults to `true`** — vaul translates the whole drawer up by the keyboard height to keep the focused input visible. That upward translate **is the "drift."**
- The `DrawerContent` is `max-h-[92dvh]` (L1197) — `dvh` is **keyboard-unaware**, so the sheet stays ~full-height. When vaul lifts a near-full-height sheet by the keyboard height, the top (handle + **title**) is pushed past the viewport top → **the title clips.**
- The existing mitigation only sets `autoFocus={!isMobile}` (L1157) so the keyboard doesn't open *on mount*. It does nothing once the user **taps** the field to actually search — which is the whole point of the picker. So the bug persists.

**In-repo precedent (the established fix):** `src/components/coach/programs/muscle-builder/MobileDayDetail.tsx` (L587, L740) renders input-bearing Drawers through the same wrapper with **`repositionInputs={false} shouldScaleBackground={false}`** and does not exhibit the drift. The wrapper (`src/components/ui/drawer.tsx`) spreads both props straight to `vaul`'s `Drawer.Root`. The swap picker simply never adopted that pattern.

## Fix — `src/pages/client/WorkoutSessionV2.tsx` (SwapExercisePicker mobile branch, ~L1196)
Add the two props to the mobile `<Drawer>`:

```tsx
// before
<Drawer open onOpenChange={(open) => { if (!open) onClose(); }}>

// after
<Drawer
  open
  onOpenChange={(open) => { if (!open) onClose(); }}
  repositionInputs={false}
  shouldScaleBackground={false}
>
```

Nothing else changes. With `repositionInputs={false}`, vaul no longer lifts the sheet when the search field focuses, so the title stays pinned at the top. The sheet stays bottom-anchored at `max-h-[92dvh]`; the title + search input sit in the non-scrolling header (always above the keyboard), and the results (`DrawerScrollArea flex-1 min-h-0`, L1160) scroll in the band between the input and the keyboard — exactly how `MobileDayDetail`'s picker behaves. `shouldScaleBackground={false}` matches the precedent and avoids the background-scale transform compounding the visual shift.

### Optional (only if it tests well on-device)
Now that the drift is gone, `autoFocus={!isMobile}` (L1157) could become `autoFocus` (focus on mount on mobile too) for faster searching. Leave it as-is unless the device test shows the keyboard-on-open behaves cleanly — it's a UX nicety, not part of the bug fix. Keep the core fix to the two Drawer props.

## Non-goals / guardrails
- The **coach** `SwapExerciseDialog.tsx` is NOT affected — it lists RPC substitutes with **no search input** (no keyboard), so it has nothing to drift. Don't touch it.
- Don't touch the desktop branch (centered overlay, no vaul, no keyboard reflow issue).
- Don't introduce a `visualViewport` hook — the codebase's chosen pattern for this is `repositionInputs={false}` (used in `MobileDayDetail`); stay consistent.
- No DB/RPC/migration.

## Verify
- `npx tsc --noEmit` clean; `npm run build` clean.
- **MANDATORY real-device test** — this CANNOT be validated in desktop Chrome (no real soft-keyboard / visual-viewport reflow; per the project's mobile-smoke note, Chrome resize is not a true mobile viewport). On **iOS Safari AND Android Chrome** (or the Capacitor build): start a workout session → tap **Swap** on an exercise → tap the **Search** field. Expect: the keyboard opens, the sheet **does not drift up**, the **"Swap Exercise" title stays visible**, typing filters the list, and picking a result still swaps the exercise and closes the sheet. Confirm the desktop overlay is unchanged.

## Follow-up (not BUG6, flag only)
Other input-bearing mobile Drawers that don't set `repositionInputs={false}` may share this latent issue (e.g. `ExercisePickerDialog.tsx`, the `CoachClientThread` composer, `MacrocycleEditor.tsx`). If any are reported drifting, the same one-line prop fix applies — sweep separately rather than expanding BUG6.
