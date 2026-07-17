# Exercise library — shared ExerciseDemoCard (build spec, slice 1)

Elevate the in-session "Form & demo" drawer into ONE shared `ExerciseDemoCard` reused across
library detail · in-session · swap · coach picker, showing the friendly `client_name`, a `MuscleMap`
slot (chips-only interim — no fake silhouette), meta chips, setup/execution, and context CTAs. Also
fixes the dense-name leak across the existing exercise surfaces. This is slice 1 of the
exercise-library epic (card → browse → swap → admin); the browse's ⓘ opens this card. Mock:
`docs/EXERCISE_DEMO_CARD_REDESIGN_MOCKUP.html`. Approved by Hasan 2026-07-17.

## Grounding (verified live 2026-07-17)
- Current in-session card: `ExerciseGuideSheet` in `WorkoutSessionV2.tsx:395-487` — vaul Drawer, shows
  the DENSE `name`, YouTube embed or "No demo video yet", grey `bg-muted` chips (primary_muscle,
  equipment, 2 secondary), numbered Setup (`setup_points` → `setup_instructions` fallback), Execution =
  `description`. Opened from the exercise thumbnail tap + a "Form & demo" Info button (`:1092-1110`,
  `setGuideOpen(true)`). Data = the embedded `exercise.exercise` (exercise_library fields on the session).
- `exercise_library` fields available: `client_name`(576/601), `name`, `primary_muscle`,
  `secondary_muscles[]`, `muscle_id`, `subdivision_id`, `equipment`, `resistance_profiles[]`,
  `laterality`(576, values `bi`/`uni`/…), `positioning`, `grip`, `setup_points[]`(2 populated),
  `setup_instructions`, `description`, `default_video_url`(**0 populated**), `anatomical_name`.
- **No `animation_url` column** → the Animation half of the media toggle is a disabled "coming soon"
  (don't bind to a missing field). Video = `default_video_url` via the existing `getYouTubeId` helper;
  `getYouTubeThumbnail` helper exists for stills.
- Dense-name leak also in `ExercisesTab`'s `ExerciseCard` and `SwapExerciseDialog` rows (both render
  `name`). `client_name` is read nowhere today.

## Build
### New shared component `src/components/exercise/ExerciseDemoCard.tsx`
Props: `{ exercise, context: "library" | "in-session" | "swap" | "coach", lastSet?, onSwap?, onFindSimilar?, onAddAlternative? }`.
Blocks top→bottom (a couple toggle by context — additive slices, one layout):
- **Media**: Animation ⇄ Video segmented toggle. Video = YouTube embed from `default_video_url`;
  Animation = disabled "Coming soon". No video → a **branded pending placeholder** ("Demo video coming
  soon") — a clean framed block, NOT an emoji, never a broken empty.
- **Headline**: `client_name ?? name`. `context="coach"` adds the dense `name` as a muted subline +
  `resistance_profiles`/`positioning`/`grip` detail.
- **MuscleMap** (`src/components/exercise/MuscleMap.tsx`, NEW): props `{ primary, secondary[], renderUrl? }`.
  For now renders **Primary / Secondary muscle chips** (friendly names from `primary_muscle` +
  `secondary_muscles`) inside a reserved framed slot. `renderUrl` (the anatomy still) is null today →
  the chips fill the slot. **Do NOT draw any silhouette/body art.** When `renderUrl` lands later, the
  component shows the still + chips. Sized for a portrait render.
- **Meta chips**: equipment (friendly via `equipmentLabels`), resistance profiles, `laterality`
  ("Unilateral" when `<> 'bi'`). Differentiate the chip types (a leading micro-icon or grouping), not
  identical grey pills.
- **Setup / Execution** segmented tabs: numbered `setup_points` (→ `setup_instructions` newline-split
  fallback); Execution = `description`. Empty → branded "Setup & execution coming soon" pending block.
- **"Your last set"** stat: `context="in-session"` only (from `lastSet`).
- **CTA**: library "Find similar" · in-session "Swap" · swap "Swap this in" · coach "Add as alternative".
- Mobile = vaul `Drawer`; desktop library/coach = `Dialog` (in-session stays the Drawer it is today).
  Use `useIsMobile`.

### New `src/lib/equipmentLabels.ts`
`Record<code,label>` (shared — browse + admin reuse). `C-*`→"Cable", `BB`→"Barbell", `DB`→"Dumbbell",
`BW`→"Bodyweight", `KB`→"Kettlebell", `SM`→"Smith Machine", `M`→"Machine", `TB`→"Trap Bar",
`BND`/`Band`→"Band"; pass through already-friendly values (Assault Bike, Treadmill…); fallback to the
raw code. (No equipment lookup table exists in the DB.)

### Adopt + dense-name fix
- Replace the inline `ExerciseGuideSheet` (`WorkoutSessionV2.tsx:395-487`) render with
  `<ExerciseDemoCard context="in-session" exercise={…} lastSet={…} onSwap={…} />`, keeping the same open
  triggers (thumbnail + "Form & demo" button → drawer). The swap CTA wires to the existing swap entry
  (the 3-tier engine swap is a later slice; for now keep current swap behavior).
- `src/components/learn/ExercisesTab.tsx` `ExerciseCard` and `SwapExerciseDialog` rows → render
  `client_name ?? name` (the dense-name leak fix).

## Guards / conventions
- Client/in-session/swap surfaces render `client_name ?? name`; only `context="coach"` shows the dense
  `name`.
- HONESTY: no fabricated data. Pending media/setup = branded "coming soon" (never a broken empty), no
  fake silhouette, no invented last-set. `ClickableCard` for any nav rows.
- Flat IGU tokens (crimson, Geist/Bebas/JetBrains Mono, flat cards, dark+light). Match plain-string
  convention; Arabic rides CC11-b. `--` not `—`.

## Tests
- Renders `client_name` (not the dense `name`) in library/in-session/swap contexts; `coach` context
  shows the dense name.
- No video → pending placeholder renders and NO YouTube iframe; no setup → pending block, not an empty.
- MuscleMap renders Primary/Secondary chips and NO silhouette/body SVG when `renderUrl` is null.
- `context` toggles the right blocks (last-set only in-session) + the right CTA label.
- `equipmentLabels`: `C-FT`→"Cable", `SM`→"Smith Machine", unknown→raw.
- Adoption: opening "Form & demo" in the logger renders `ExerciseDemoCard`; `ExercisesTab`/swap rows
  show `client_name`.

## Verify
- `tsc -p tsconfig.app.json --noEmit` → zero new vs 292 baseline.
- Vitest new/updated green; CI green.
- Live smoke: logger → "Form & demo" opens the new card (client_name, muscle chips, pending media,
  swap CTA), logging unaffected; the exercise browse cards + swap dialog show `client_name`.

## Note
Meaty slice (shared card + MuscleMap + equipmentLabels + in-session adoption + dense-name fixes). Fine
as one PR; if CC prefers, split: (a) ExerciseDemoCard + MuscleMap + equipmentLabels + in-session
adoption, (b) the ExercisesTab/swap dense-name fixes.
