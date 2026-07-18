# Back the coach exercise picker with the By-Muscle browse (slice 2b)

Replace the coach `ExercisePickerDialog`'s dropdown-facet + flat dense-name list with the slice-2
anatomical region → muscle → exercise drill, in a "picker" mode (row tap selects). Extract the browse
into a shared component both the client Learn tab and the coach picker use. Follow-up flagged by CC on
the slice-2 PR (#244). Reuses the approved slice-2 UX — no new mock.

## Grounding (verified 2026-07-18)
- **Client browse** lives in `src/components/learn/ExercisesTab.tsx` (slice 2): region-card grid (live
  counts) → muscle list → exercise rows (client_name + friendly equipment·resistance via
  `lib/equipmentLabels`, UNI chip) with subdivision + resistance FILTER chips; ⓘ opens the shared
  `ExerciseDemoCard`. Data: `useExerciseLibraryData` + `useExerciseTaxonomy` + `filterExercises`.
- **Coach picker** `src/components/coach/programs/ExercisePickerDialog.tsx` uses the SAME data layer but
  the OLD UI: a section `<Select>` (warmup/main/accessory/cooldown), category tabs, per-category facet
  `<Select>`s (Region/Muscle/Subdivision for strength, etc.), and a flat list where each row shows the
  **dense `name`** (L484) + category badge + `primary_muscle` + **raw equipment code** (L495). Props:
  `onSelectExercise(id, section, name)` (single), `multiSelect` + `onSelectMany(picks[])` (replacement
  mode, checkbox toggle + batch footer, L460-534), `sourceMuscleId` (muscle-scoped when opened from a
  slot, L194-238), `coachUserId`. Scoping: `is_global || created_by_coach_id === coachUserId` (L200-203)
  + a "Custom" badge on non-global rows. Mobile = Drawer, desktop = Dialog.

## Build
### 1. Extract a shared `src/components/exercise/ExerciseBrowse.tsx`
Lift the slice-2 drill (region grid → muscle list → exercise rows + subdivision/resistance filters,
breadcrumb, category strip, live in-memory counts) out of `ExercisesTab` into a reusable component:
```
<ExerciseBrowse
  mode="browse" | "picker"
  rows={ExerciseRow[]}                 // caller supplies the scoped rows
  onSelect?(exercise)                  // picker single-select
  multiSelect?  selectedIds?  onToggle?(exercise)   // picker replacement mode
  sourceMuscleId?                      // deep-link straight to a muscle's Level-C list
  showInfo?  onInfo?(exercise)         // ⓘ → ExerciseDemoCard (browse: on; picker: optional)
/>
```
- `mode="browse"` (client): row → ⓘ opens `ExerciseDemoCard` (current behavior).
- `mode="picker"` (coach): row tap → `onSelect` (single) or `onToggle` + checkbox (multiSelect);
  keep an ⓘ affordance to preview the demo card (nice-to-have, not required).
- `sourceMuscleId` set → open at that muscle's Level-C exercise list directly, with a "browse other
  muscles" escape back up the drill.
- Counts + taxonomy come from the caller's `rows` + `useExerciseTaxonomy` (unchanged).

### 2. Refactor `ExercisesTab` to render `<ExerciseBrowse mode="browse" rows={scopedActiveRows} showInfo>`.
No behavior change for clients.

### 3. Rewire `ExercisePickerDialog` to use it
- KEEP the Dialog/Drawer shell, the **section `<Select>`**, the `multiSelect` **batch footer**, the
  `sourceMuscleId` scoping intent, and the `is_global || own` row scoping + "Custom" badge.
- REPLACE the category-tabs + facet `<Select>`s + flat list (L409-525) with
  `<ExerciseBrowse mode="picker" rows={scopedRows} sourceMuscleId={sourceMuscleId}
   onSelect={(ex) => onSelectExercise(ex.id, selectedSection, clientNameOrName(ex))}
   multiSelect={multiSelect} selectedIds={[...checkedRows.keys()]} onToggle={toggleChecked} />`.
- Pass the coach-scoped rows (`is_global || own`) into `rows`; the "Custom" badge renders on
  non-global rows inside the browse row (add a `badge` slot or render it from `!is_global`).
- `sourceMuscleId` → the browse deep-links to that muscle (replaces the old muscle-filter banner).

### 4. Naming in the picker — DECISION (recommend client_name)
The browse rows show `client_name ?? name`. Recommend the coach picker do the same (friendlier +
scannable; the drill context supplies muscle/subdivision, so the dense name's extra tokens are
redundant). If coaches need the precise dense name, that's a one-line prop (`denseName` mode) — flag in
the PR, don't silently switch. `onSelectExercise`'s `exerciseName` arg should stay the dense `name`
(it's what the builder stores/labels), even if the row DISPLAYS client_name.

## Guards / conventions
- `ClickableCard` for region/muscle/exercise rows; client-facing display uses `client_name ?? name`;
  friendly equipment via `equipmentLabels`.
- Preserve honesty/empty states (empty region/muscle → EmptyState; empty-search guarded; LoadError).
- Flat IGU tokens; mobile Drawer / desktop Dialog via `useIsMobile`. Match plain-string convention.

## Tests
- `ExerciseBrowse`: browse mode ⓘ opens demo card; picker mode row tap fires `onSelect`; multiSelect
  toggles `onToggle` + shows checked state; `sourceMuscleId` opens at Level C; empty states hold.
- `ExercisePickerDialog`: single-select returns `(id, section, denseName)`; multiSelect batch-commits
  checked rows; `sourceMuscleId` deep-links; Custom badge on non-global rows; coach scoping
  (`is_global || own`) still filters.
- `ExercisesTab`: unchanged behavior (regression) via the extracted component.

## Verify
- `tsc -p tsconfig.app.json --noEmit` → zero new vs 292.
- Vitest new/updated + full suite green; CI green.
- Live smoke: coach program builder → add exercise → the region→muscle→exercise drill (picker), tap
  selects into the section; replacement multiselect batch-adds; opening from a muscle slot deep-links to
  that muscle. Client Learn browse unchanged.
