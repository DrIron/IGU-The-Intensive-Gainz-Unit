# Remove the WK5 client-facing per-set type toggle

Rip out the client-facing per-set type marker (warm-up / drop / failure) added by WK5 (#240),
end-to-end. Decision (Hasan, 2026-07-17): drop/failure are coach-prescription concepts the client
shouldn't re-declare, and warm-up "tracking" only bought a partial, self-reported tonnage
exclusion. Remove it all.

## MUST NOT TOUCH (different, legitimate systems)
- `src/lib/setInstructions.ts` and everything it drives — the coach's PRESCRIBED drop / back-off /
  AMRAP / rest-pause set instructions. This is the real drop-set model. Leave 100% intact.
- `src/components/coach/programs/WarmupSection.tsx` and the program `section: "warmup" | "main" |
  "accessory" | "cooldown"` structure — the coach's warm-up SECTION. Untouched.
- The `setTypeFilter` `useState` setters in `DiscountAnalytics.tsx`, `EducationalVideosManager.tsx`,
  `EmailLogTab.tsx` — unrelated React setters that happen to match the grep. Do not touch.

## What the marker was (grounded)
`performed_json.set_type` ∈ {normal,warmup,drop,failure}, default normal (unpersisted). Only real
effect: `setTonnage` returned 0 for `warmup`. drop/failure were cosmetic chips with no analytics
effect. The marker is threaded through the workout read path below.

## Remove
Delete these files:
- `src/lib/setType.ts`
- `src/components/workout/SetTypeChip.tsx` + `src/components/workout/SetTypeChip.test.tsx`
- `src/pages/client/WorkoutSessionV2.setType.test.tsx`

Edit these:
- `src/pages/client/WorkoutSessionV2.tsx` — remove the imports (L27-28), the `<SetTypeChip …>`
  render (L746), the type `<select>` block (~L851-863, the `SET_TYPES.map`), and the
  `onUpdateExtra("set_type", …)` write. Confirm the set row still lays out cleanly without the
  chip/select (no dangling flex gap).
- `src/utils/workoutFlags.ts` — remove the `if (set.setType === "warmup") return 0;` branch (L131)
  and the `setType` field from the `LoggedSet` type. `setTonnage` now counts every completed set.
- `src/utils/workoutFlags.setTonnage.test.ts` — drop the warm-up-exclusion cases; keep/adjust the
  plain tonnage math tests (or fold into an existing workoutFlags test).
- `src/components/client-overview/workouts/useClientWorkouts.ts` — remove the `setType` field
  (L296) and its `parseSetType(...)` population (L353-354) + the import (L16).
- `src/components/client-overview/workouts/useWorkoutPulse.ts` — remove the `setType` mapping
  (L157) + import (L39).
- `src/components/client-overview/workouts/WorkoutHistoryTrends.tsx` — remove the `setType`
  mapping (L50) + import (L17).
- `src/components/client-overview/workouts/SessionLogViewer.tsx` — remove the `<SetTypeChip
  type={s.setType} />` render (L217) + import (L28) + the `setType` source field it reads.
- `src/utils/prEngine.ts` — remove the `setType?` field (L40-41). **Verify first** it isn't
  branched on in PR logic (the WK5 comment said PR exclusion was a never-shipped "follow-up", so it
  should be an unused carried field). If it IS used, stop and flag — don't change PR behavior blind.

## Data note (flag, not a blocker)
Existing rows tagged `performed_json.set_type='warmup'` will now count toward tonnage (the
exclusion is gone), so historical tonnage/trends for those sets tick up. Pre-launch (waitlist ON),
so the affected data is test/early only — acceptable. No migration; the `set_type` key just stops
being read/written and sits inert in old blobs.

## Verify
- `tsc -p tsconfig.app.json --noEmit` → zero NEW errors vs the 292 baseline.
- Vitest: remaining workout/tonnage/pulse/history suites green after the test deletions/edits;
  CI green.
- Live smoke (after deploy): open the workout logger on a client with a set, confirm the set-type
  select + chips are gone and logging/saving a set still works; the coach's prescribed drop/AMRAP
  badges still render; workout history + pulse still show tonnage.
