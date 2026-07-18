# Exercise library — By-Muscle browse (build spec)

Replace the dropdown-facet `ExercisesTab` (and retire the duplicate `WorkoutLibrary` page) with an
anatomical **region → muscle → exercise** drill using live counts, serving clients (Learn hub) and
coaches (picker) from one surface. Mock: `docs/EXERCISE_BROWSE_REDESIGN_MOCKUP.html`. Approved by
Hasan 2026-07-17.

## Prerequisite / sequence
The exercise rows' ⓘ opens the shared **ExerciseDemoCard** (the elevated guide sheet with
`client_name` + MuscleMap slot). Build that shared card first (slice 1) or in the same PR. Interim, ⓘ
may open the existing `ExerciseGuideSheet` until the card lands. This browse is slice 2 of the
exercise-library epic (1 card → 2 browse → 3 swap → 4 admin).

## Locked design decisions
- Drill: region → muscle → **exercise list** (NOT a subdivision level). Subdivision (Long Head/Lateral/
  Medial) + resistance profile are **filter chips** on the exercise list, not extra drill levels.
- Rows show friendly **`client_name ?? name`** + a `equipment · resistance` mono line + a **UNI** chip
  when `laterality <> 'bi'`. ⓘ → ExerciseDemoCard.
- Region grid uses **live counts**; "Systemic"/"Powerlifting"/cardio live under the **category strip**,
  not the anatomical grid.

## Grounding (verified live 2026-07-17)
- Taxonomy linkage: `exercise_library.muscle_id → muscles.id`; `muscles.primary_region_id →
  body_regions.id`; `muscle_subdivisions.muscle_id → muscles.id` and `exercise_library.subdivision_id →
  muscle_subdivisions.id`. Tables: `body_regions(slug,display_name,sort_order)`,
  `muscles(slug,display_name,primary_region_id,sort_order)`, `muscle_subdivisions(...,muscle_id)`.
- Live region counts (active, via muscle→region): Chest 82 · Back 119 · Shoulders 66 · Arms 127 ·
  Legs 119 · Core 29 · Neck 8 · Systemic 22 · Powerlifting 4. Arms muscles: Elbow Flexors 83 ·
  Triceps 30 · Forearm 14.
- `category` enum: `strength, cardio, mobility, physio, warmup, cooldown, sport_specific, systemic,
  powerlifting`.
- **No equipment lookup table exists** — codes are raw text (`BB, DB, BW, KB, TB, BND, C-AA, C-BS,
  C-FT, C-SB, C-SF, C-SG, M, SM, Band, Assault Bike, Treadmill, …`). Need a frontend code→label map;
  collapse all `C-*` → "Cable". Some values are already friendly (Assault Bike, Treadmill) — pass
  through. Reuse/centralize the admin's existing equipment constants if present.
- Hooks already exist: `useExerciseTaxonomy` (regions/muscles/subdivisions lookups + `musclesByRegion`/
  `subdivisionsByMuscle` maps) and `useExerciseLibrary` (`useExerciseLibraryData()` loads all ~601
  active rows once, cached). **Compute all counts in-memory** from the loaded rows — no new RPC.
- cardio/systemic/etc. rows have **no `muscle_id`** → they won't appear in the muscle grid; surface them
  via the category strip as a flat list.

## Build
Elevate `src/components/learn/ExercisesTab.tsx` (mounted in `Learn.tsx`, `tab==="exercises"`) into a
three-level browse. Keep the Learn shell's search box.

1. **Level A — regions.** A category strip (All · Strength · Cardio · Mobility · Physio · …, from the
   enum) + the region-card grid (2-col mobile, wider on desktop) with live counts, sorted by
   `body_regions.sort_order`. Region card = display_name + `{n} exercises` + a `MuscleMap` thumb slot
   (placeholder now). When the selected category is **Strength (default)** show the region grid; when a
   **non-strength category** is selected, skip the grid and show a flat filtered exercise list (those
   rows lack a muscle region).
2. **Level B — region → muscles.** Breadcrumb + muscle rows (display_name + count + chevron), from
   `musclesByRegion`, counts in-memory.
3. **Level C — muscle → exercises.** Breadcrumb + filter chips: **subdivision** (from
   `subdivisionsByMuscle[muscle]`) + **resistance profile** (distinct `resistance_profiles` in the set).
   Exercise rows as specced (client_name, equipment friendly label, resistance, UNI chip, ⓘ). Sort
   sensibly (e.g. by subdivision then name).

- **Equipment label map:** new `src/lib/equipmentLabels.ts` — `Record<code,label>` with `C-*`→"Cable",
  `BB`→"Barbell", `DB`→"Dumbbell", `BW`→"Bodyweight", `KB`→"Kettlebell", `SM`→"Smith Machine",
  `M`→"Machine", `TB`→"Trap Bar", `BND`/`Band`→"Band", pass-through for already-friendly values,
  fallback to the raw code. Centralize so the demo card + admin reuse it.
- **Retire the duplicate:** `src/pages/WorkoutLibrary.tsx` is a near-identical standalone browse —
  redirect its route to the Learn exercises tab (confirm no unique entry point) and delete the page +
  its `ExerciseCard` if unused elsewhere.
- **Coach reuse (flag):** the same browse should eventually back the coach exercise picker
  (`ExercisePickerDialog`) — either parameterize this component for a "picker" mode (row tap = select
  instead of ⓘ) now, or note as the next follow-up. Confirm scope with Hasan; don't silently fork.

## Guards / conventions
- `ClickableCard` for region/muscle/exercise nav rows (never `<Card onClick>`); `ariaLabel`.
- Client surfaces render `client_name ?? name` — never the bare `name`.
- Empty states: a muscle/region with 0 exercises → "No exercises here yet" (not a broken empty); empty
  search → "No exercises found" (guard the `""` case, no `matching ""`).
- Flat IGU tokens (crimson, Geist/Bebas/Mono, flat cards, dark+light). Mobile-first; `useIsMobile`.
- Match existing plain-string convention; Arabic rides CC11-b.

## Tests
- Region grid renders live counts from mocked data; selecting a non-strength category swaps to a flat
  list (no region grid).
- Drill region → muscle → exercise updates breadcrumb + list; subdivision/resistance filters narrow the
  set; UNI chip only on `laterality<>'bi'`.
- Equipment label map: `C-FT`→"Cable", `SM`→"Smith Machine", unknown→raw.
- Empty-search shows the no-search copy, not `matching ""`.

## Verify
- `tsc -p tsconfig.app.json --noEmit` → zero new vs 292 baseline.
- Vitest new/updated green; CI green.
- Live smoke: Learn → Exercises renders the region grid with real counts; Arms → Triceps → filtered
  rows with friendly names/equipment; ⓘ opens the demo card (or interim guide sheet); the old
  `/workout-library` route no longer shows the duplicate.
