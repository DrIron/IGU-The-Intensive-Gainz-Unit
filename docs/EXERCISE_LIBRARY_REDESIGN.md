# Exercise Library Redesign — Plan

> Status: PROPOSED (2026-06-13). Not yet applied. Supersedes the ad-hoc v2 state
> described in CLAUDE.md ("Two exercise tables"). Read alongside
> `docs/WORKOUT_BUILDER_SPEC.md`.

## Goal

Make `exercise_library` the single source of truth for every exercise across
**all session types** (strength, cardio, mobility, warmup, cooldown, physio),
with a controlled, drill-down taxonomy that powers three things from one schema:

1. **Filtering / browse** — coaches and clients narrow to exactly what they want.
2. **Substitute suggestions** — "swap this exercise" in the program builder, and
   "find an alternative" for clients, both served by ONE rule.
3. **Program-builder integration** — the picker filters to the session type the
   coach is currently building.

## Current state (verified against prod 2026-06-13)

- `exercise_library`: 351 rows (348 active). 21 `muscle_group` values, 22 `equipment` values.
- `exercises` (legacy): 97 rows. **Zero** FK references, **zero** name overlap with the library. Orphaned. → **DROP** (decided).
- `movement_patterns`: 82 rows; 7 have empty `execution_points`; Triceps Long Head 2 rows hold stale cues (the `elbow_extensors` filter bug).
- All four program tables (`module_exercises`, `client_module_exercises`, `direct_session_exercises`, `progression_suggestions`) already FK to `exercise_library`.

### Gaps this redesign closes

| Gap | Today | Impact |
|---|---|---|
| No top "body region" tier | `muscle_group` actually holds *muscles* (pecs, triceps) | Can't browse Chest → Pecs → … |
| Free-text taxonomy, no integrity | `muscle_group`/`subdivision`/`movement_pattern`/`equipment` are TEXT | Typos create phantom siblings → the triceps cue bug; substitute-matching unreliable |
| Dirty equipment | composites like `C-FT / C-AA`, `DB / BB`, `DB (plate)` | Faceted filters miss rows |
| No substitute engine | nothing computes "similar exercises" | Each component would reinvent it |
| Non-strength jammed into muscle fields | 9 cardio, 10 mobility, 6 warmup live under `muscle_group` | Cardio/mobility never filter cleanly |
| Frontend duplication | `MUSCLE_GROUPS`, `getDifficultyColor` copied across files; 5 components reimplement filtering | drift, bugs, no i18n |

## Planning board: unconstrained sessions (LOCKED 2026-06-13)

A session is a **container**, not a single modality. A coach building a Hyrox /
CrossFit / circuit day adds running + sled + lunges + rowing + med-ball throws into
**one** session. So:

- **A session has no enforced `type`.** Keep an optional **focus label** ("Hyrox",
  "Push", "Conditioning") for display/colour only — it never restricts contents.
- **One add-panel over the whole library**, with category filter tabs
  (Strength / Cardio / Mobility / Warmup / Cooldown / Physio / Sport) + search.
  The old strength-picker-vs-activity-picker split is removed.
- **`category` is a filter facet, not a session gate.** It still selects the facet
  tree and prescription columns for an exercise (strength → sets/reps; cardio →
  distance/zone), but doesn't limit where the exercise can be placed.
- This makes warmup/cooldown just activities you add to any session — no separate
  "session type vs block" decision needed.

The slot model already supports this: `MuscleSlotData` (`src/types/muscle-builder.ts:155-167`)
already carries both strength and activity fields in one shape. The work is UI
(unified picker, drop session-type scoping) + the conversion RPC.

**Conversion lift (the real work this unlocks):** today non-strength items convert
to module-only and aren't logged individually (CLAUDE.md, convert-RPC note). For a
mixed session to convert into something a client can log per-activity, the
conversion RPC must emit one row per activity regardless of category. Every activity
is already an `exercise_library` row and `module_exercises` already FK to the
library, so the plumbing exists — the RPC just stops discarding non-strength items.

## Unified category / session-type vocabulary (LOCKED 2026-06-13)

One shared list used by both the library `category` and the planning board, so the
picker can filter the library by what the coach is building:

`strength, cardio, mobility, warmup, cooldown, physio, sport_specific`

- Fold the board's `hiit` into `cardio` (HIIT is an energy-system facet value).
- Map the board's `yoga_mobility` → `mobility`, `recovery` → `cooldown`.
- Add `sport_specific` to the library `category` enum.

## Design principles

1. **`category` is the top-level switch.** It already exists as an enum
   (`strength, cardio, mobility, physio, warmup, cooldown`). Each category has its
   own ordered facet hierarchy. The muscle tree is the *strength* hierarchy only.
2. **Every classification value is controlled** (a row in a lookup table, FK-enforced).
   No free typing → no typo-class bugs → reliable matching and filtering.
3. **The hierarchy IS the substitute algorithm.** Descend the tree; the siblings at
   the leaf are the interchangeable options. Equipment is the variant axis.
4. **One data layer.** A single hook/RPC feeds the admin manager, the program-builder
   picker, and the client browse page. No more parallel reimplementations.

---

## Target taxonomy — one hierarchy per session type

Each type below is a **first-class, equal-depth** classification. Shared dimensions
(equipment, target region, technique) reuse one master lookup, tagged by which
categories they apply to.

### 1. Strength
```
Body region → Muscle → Subdivision → Movement pattern → Resistance profile → [Positioning?] → Equipment → [Equipment brand?] → exercise
  (chest)    (pec major) (sternal)    (Flat Press)        (Mid-range)          (optional)       (BB)         (optional)
```
Substitute key: **muscle → subdivision → movement pattern → resistance profile** (positioning,
equipment, and brand all vary within a class — they are NOT part of the key). See
**"Naming, Swap & Content Model (LOCKED 2026-06-21)"** below for the finalized axis
stack, the reasoning for excluding positioning, and the compute-not-store swap data model.

#### Canonical strength tree — LOCKED 2026-06-13

7 regions (glutes folded into Legs). Muscles a coach can't currently target are
seeded **empty** for future exercises. `()` = current DB value it backfills from;
"(empty)" = no exercises yet.

**CHEST**
- Pec Major *(pecs)* → Clavicular Head *(pecs_clavicular)*, Sternal Head *(pecs_sternal)*, Costal Head *(pecs_costal)*
- Pec Minor — (empty)
- Serratus Anterior *(serratus / serratus_anterior)*

**BACK**
- Lats *(lats)* → Thoracic *(lats_thoracic)*, Lumbar *(lats_lumbar)*, Iliac *(lats_iliac)*
- Upper Back → Upper Trapezius *(upper_back_upper_traps)*, Teres Major *(upper_back_teres_major)*
- Mid Back → Rhomboids *(mid_back_rhomboids)*, Mid Trapezius *(mid_back_mid_traps)*, Lower Trapezius *(mid_back_low_traps)*
- Lower Back → Spinal Erectors *(core_erectors — moved out of Core)*
- *Posterior Deltoid — cross-listed here (home = Shoulders). See note below.*

**SHOULDERS**
- Deltoids → Anterior *(shoulders_anterior)*, Lateral *(shoulders_lateral)*, Posterior *(shoulders_posterior)*
- Rotator Cuff → Supraspinatus *(rotator_cuff_supraspinatus)*, Infraspinatus *(rotator_cuff_infraspinatus)*, Subscapularis *(rotator_cuff_subscapularis)*, Teres Minor (empty)

**ARMS**
- Biceps / Elbow Flexors *(elbow_flexors)* → Biceps Long Head *(elbow_flexors_biceps_long)*, Biceps Short Head *(elbow_flexors_biceps_short)*, Brachialis *(elbow_flexors_brachialis)*, Brachioradialis *(elbow_flexors_brachioradialis)*
- Triceps *(triceps)* → Long Head *(triceps_long)*, Lateral & Medial Head *(triceps_lateral)*
- Forearm *(forearm)* → Flexors, Extensors, Pronators, Supinators *(forearm_*)*

**LEGS** *(includes glutes)*
- Quads *(quads)* → Rectus Femoris *(quads_rectus_femoris)*, Vastii (empty — general quad work stays at muscle level)
- Hamstrings *(hamstrings)*
- Glutes *(glutes)* → Gluteus Maximus *(glutes_max)*, Gluteus Medius *(glutes_med)*, Gluteus Minimus (empty)
- Adductors *(adductors)*
- Abductors *(abductors)*
- Hip Flexors *(hip_flexors)*
- Calves *(calves)* → Gastrocnemius *(calves_gastrocnemius)*, Soleus *(calves_soleus)*
- Tibialis Anterior *(calves/tibialis_anterior — pulled out of Calves)*

**CORE**
- Rectus Abdominis *(core_rectus_abdominis — minus the oblique exercises below)*
- Obliques — reassigned from rectus abdominis: woodchops, Russian twist, landmine rotation (active rotation), Pallof presses (anti-rotation), side bends (lateral flexion)
- Pelvic Muscles (empty)

**NECK**
- Neck *(neck)*

**Posterior Deltoid cross-listing.** It is ONE muscle (Shoulders › Deltoids ›
Posterior). A `muscle_region_membership(muscle_or_subdivision, region, is_primary)`
table lets it ALSO surface under Back. Browsing either region returns posterior-delt
exercises; the data isn't duplicated. Same mechanism handles any future "trained on
two days" muscle.

### 2. Cardio / Conditioning
```
Energy system → Movement pattern → Equipment → exercise
 (Intervals)     (Run)             (Treadmill / Outdoor)
```
Energy systems: LISS (Z1-2), Steady-state (Z3), Tempo (Z4), Intervals (Z4-5),
HIIT (Z5), Sprint. Movement patterns: Run, Sprint, Jog, Row, Ski, Cycle, Climb,
Skip, Carry, Drag/Push (sled). Equipment: treadmill, bike, rower, assault bike,
ski erg, stair climber, elliptical, jump rope, sled, battle ropes, outdoor/none.
Substitute key: **energy system + movement pattern** (treadmill intervals ↔ bike/rower intervals).

### 3. Mobility
```
Target region → Technique → exercise
 (t-spine)       (CARs / dynamic / static / PNF / foam roll / banded)
```
Substitute key: **target region + technique**.

### 4. Warmup (movement prep / activation)
```
Target region / focus → Type → Equipment → exercise
                         (general raise / dynamic / activation / potentiation)
```
Substitute key: **target region + type**.

### 5. Cooldown
```
Target region → Type → exercise
                (static stretch / breathing / foam roll / decompression)
```
Substitute key: **target region + type**.

### 6. Physio / Rehab
```
Target structure / joint → Purpose → Equipment → exercise
 (rotator cuff, low back)   (mobility / stability / strengthening / pain-relief / activation)
```
Substitute key: **target structure + purpose**. Physio cues remain gated to the
physiotherapist subrole (`can_write_injury_notes`) per CLAUDE.md.

---

## Naming, Swap & Content Model (LOCKED 2026-06-21)

This section refines the 2026-06-13 taxonomy with the naming system, the finalized
swap engine, the content-authoring model, and the admin flow. Where it differs from
earlier lines (axis order, substitute key), this section wins. Decided with Hasan in
the 2026-06-21 design session; validated against prod data inline.

### The single idea

**Naming, swapping, and content all derive from one ordered axis stack.** We do not
build three systems — we build one taxonomy and read it three ways. The exercise's
position in the tree *is* its name, *is* its swap-equivalence key, and *is* the address
where its execution/setup copy lives.

### The axis stack

Ordered top to bottom, with the role of each axis:

| # | Axis | In swap key? | Drives |
|---|------|:---:|--------|
| 1 | Muscle group (body region) | ✓ | naming, swap |
| 2 | Muscle | ✓ | naming, swap |
| 3 | Subdivision | ✓ | naming, swap |
| 4 | Movement pattern | ✓ | naming, swap, **execution copy** |
| 5 | Resistance profile | ✓ | naming, swap — **swap key ends here** |
| 6 | Positioning (optional, scoped) | ✗ | naming, setup |
| 7 | Equipment (required) | ✗ | naming, setup |
| 8 | Equipment brand (optional) | ✗ | naming, setup |

Axes 1–5 are the **swap equivalence key**. Axes 6–8 vary freely within a swap class.

### Two names from one stack

The exact same row renders under two naming schemes, chosen by audience:

- **Coach name** — the dense, precise label encoding the path: subdivision + equipment
  code + movement + resistance bias. This is what `exercise_library.name` already holds
  today (e.g. `"Clavicular Pec M Smith Incline Press (M)"`). Shown on all coach/admin
  surfaces (program builder, picker, swap dialog, admin manager).
- **Client name** — a friendly label (e.g. `"Smith Machine Incline Press"`). Stored in a
  new nullable `exercise_library.client_name`; when NULL, surfaces fall back to `name`.
  Shown on all client surfaces (workout session, client library browse).

Render rule everywhere: client surfaces show `client_name ?? name`; coach/admin surfaces
always show `name`. Client name generation is a later pass (auto-compose from
equipment-expansion + movement, with manual override) — the column + fallback ship first
so nothing blocks on naming all rows.

> **Why this matters / current bug:** clients today are shown the raw coach `name` in
> `WorkoutSessionV2` (e.g. `"Iliac Lat C-AA Single Arm Vertical Pull Around (L)"`). The
> `client_name` column + fallback fixes the leak.

#### Generation strategy (DECIDED 2026-06-21)

- **Coach `name` = auto-generated, editable.** Built from the taxonomy on save and stored
  in the existing `name` column; admin can override per exercise (a "regenerate" action
  rebuilds it from the axes). Stored (not computed-on-read) so every existing reader of
  `name` keeps working. Drift is acceptable because the override is explicit and regenerate
  is one click.
- **Client `client_name` = auto-composed, editable.** Generated from equipment + movement
  (+ positioning), stored, hand-fixable per exercise; blank → falls back to coach `name`.

**Prerequisite:** movement must become a controlled dropdown writing `movement_pattern_id`
(today the admin form types `movement_pattern` as free text and never sets the FK). Without
a real movement token, neither name generates deterministically. This single fix also
relinks execution cues and the swap key.

#### Naming grammar (CONFIRMED 2026-06-21)

Token order, cable collapse, and equipment words confirmed by Hasan. Smith Machine = its
own equipment code `SM`.

Token order, top of the stack to bottom. Optional tokens omitted when absent.

**Coach name:** `{subdivision|muscle} {equipment-code}[ {brand}] [{positioning}] {movement} ({resistance-initial})`
- e.g. `Clavicular Pec M Hammer Incline Press (M)` · `Biceps Long BB Drag Curl (S)` · `Iliac Lat C-AA Pull Around (L)`
- Keeps the precise equipment code (`C-FT` ≠ `C-AA` ≠ `C-FS`) and resistance bias — coach signal.

**Client name:** `[{brand} ]{equipment-word} [{positioning}] {movement}`
- e.g. `Hammer Strength Machine Incline Press` · `Cable Lying Leg Curl` · `Smith Machine Incline Press`
- Drops subdivision + resistance; **collapses cable subtypes** `C-FT/C-AA/C-FS → "Cable"` (clients don't need the distinction). Muscle is shown separately as a badge in-context, so it's left out of the client name.

**Equipment word map (glossary-as-data, CONFIRMED):**
`M → Machine`, `SM → Smith Machine`, `BB → Barbell`, `DB → Dumbbell`,
`C-FT / C-AA / C-FS → Cable`, `BW → Bodyweight`.
Stored as the `display_name`/tooltip on the equipment lookup row.

**Equipment data cleanup needed before name generation:**
- **Add `SM` and re-tag 9 Smith exercises** (currently coded `M` with "Smith" hand-typed
  in the name; verified prod 2026-06-21). After re-tag, the generator emits "Smith Machine"
  from the code and the hand-typed token disappears.
- **Normalize compound equipment values** — prod still has `C-FT / C-AA`, `DB / BB`,
  `DB (plate)`, `BW / M`, `BW / DB` (~15 rows). These fragment swap classes and break clean
  naming; resolve to atomic codes (or model multi-equipment via the planned
  `exercise_equipment` junction).

### Swap engine — finalized

**Equivalence key (strength):** two exercises are swappable iff they share
`muscle → subdivision → movement_pattern → resistance_profile`. Equipment, positioning,
and brand vary within the class.

**Empirical validation (prod, 326 strength rows, 2026-06-21):** grouping by this key
yields 120 classes; 86 (72%) have 2+ members and **292 of 326 exercises (90%) have at
least one in-class alternative**. Only 34 are singletons. The key produces useful swap
sets — it does not collapse to mostly classes-of-one.

**Positioning is deliberately excluded from the key.** A Smith incline press and a Smith
flat press are NOT swap-equal, but subdivision already separates them (incline →
Clavicular Head, flat → Sternal Head). You would never use a flat press to target the
clavicular head, so subdivision *carries* the positioning's training effect; adding
positioning to the key would be redundant. For muscles where subdivision isn't a
meaningful split (e.g. hamstrings, currently NULL subdivision), the class simply forms at
the muscle level — the key adapts to however deep the tagging goes.

**Graded fallback:** exact match = full key. If a class is thin/singleton, relax one axis
(drop resistance, then subdivision) and label those results "close" rather than "equal."

**Compute-not-store data model (important):** do NOT snapshot a frozen list of
alternatives into each plan. When a coach builds a plan, store only (a) the chosen primary
exercise and (b) the coach's explicit deltas (alternatives removed, or manually added). The
default alternative set is **derived live from the equivalence class**. Consequence: adding
new library exercises later automatically enriches every existing plan's swap menu; a
snapshot would rot.

**Swap UX (coach AND client, identical behavior):** the "+ add replacement" action opens a
picker **pre-filtered to the equivalence class** (up to resistance profile), so the in-class
options surface first. The user can accept all, pick individually, or clear the filter and
free-search the whole library as today. An "accept all" shortcut gives the speed of
auto-add without forcing un-vetted exercises onto a plan. Clients get the same pre-filtered
group when changing an exercise mid-workout — **this closes the existing bug** where the
client mid-workout swap bypassed the engine for a dumb name/`primary_muscle` text search
(`WorkoutSessionV2.tsx` inline `SwapExercisePicker`).

**Other categories — same engine, different key columns:**
- Cardio → `energy_system + movement_pattern` (treadmill intervals ↔ bike/rower intervals).
- Mobility / warmup / cooldown → `target_region + technique`.
- Physio → `physio_structure + purpose`.

### Content authoring — keyed at two depths

- **Execution** is shared down to the **movement node** (axes 1–4). Authored once per
  `{muscle group, subdivision, movement pattern}` and inherited by every exercise in it.
  Home = `movement_patterns.execution_text` / `execution_points` (already exists and is
  already keyed there). Client library "Execution" should read from the movement node, not
  per-exercise `description`.
- **Setup** is **per-exercise** (the leaf). Entered as each exercise is added; brand is an
  optional part of the leaf, not a separate node. We deliberately do NOT build a setup node
  keyed by equipment/brand — the brand level is ragged (present only for machines, e.g.
  Nautilus vs Atlantis vs Hammer Strength), so leaf storage is simpler than an
  inherit-from-deepest-node scheme.

This matches the production insight: within a movement class the **execution** is ~identical
(write once), and only the **setup** differs by equipment/brand (write per exercise). It
also makes video production tractable — one execution script per movement class, setup
notes per exercise.

### Positioning is a scoped vocabulary

Positioning terms are NOT a flat global list — they are valid **per muscle / subdivision**:
- Biceps: "shoulder-extended / shoulder-flexed" (the maintained position changes the stimulus).
- Hamstrings: "prone / seated".
- Chest, triceps: no positioning terms.

So positioning = a lookup table **plus** a mapping of which terms apply to which
muscle/subdivision. The admin add-exercise flow only offers the applicable terms (no "prone
triceps"). New positions can be added to a muscle later.

### Equipment brand

Equipment can have an optional brand sub-level (`machine_brand`, currently empty). Only
equipment types with real brand variance (machines) carry brands; dumbbells/barbells do
not. Admin can add brands as needed. Brand affects **setup only** — never the swap key.

### Glossary-as-data, not a static doc

Equipment codes (`M`, `C-FT`, `BB`, …) and other lookup terms each carry a human
`description`/`tooltip` field on their lookup row. The glossary then renders in-app
(hover/info on the code) AND is the single source of truth — no separate static glossary
to drift.

### Admin authoring = a guided cascade down the stack

Adding an exercise walks the same axis stack as a template/wizard, each step constraining
the next:

`region → muscle → subdivision → movement → resistance → positioning (only if that
subdivision has terms) → equipment → brand (only if that equipment has brands) → setup`

- **Execution** auto-inherits from the chosen movement node (editable at that node).
- **Setup** is entered for the exercise being added.
- Every lookup in the cascade (movements, positions, equipment, brands) is itself admin
  add/editable inline ("add as needed"). (Check the current `ExerciseLibraryManager` —
  some of these fields exist from the original library and can be built on rather than
  rebuilt.)

### Schema deltas this section implies (beyond the 2026-06-13 plan)

- `exercise_library.client_name text NULL` — client-facing label, falls back to `name`.
- `positioning_terms` lookup + `positioning_applicability(positioning_id, muscle_id|subdivision_id)` mapping.
- `machine_brands` lookup (FK from the equipment/exercise level); brand stays optional.
- `description`/`tooltip` column on equipment + other code lookups (glossary-as-data).
- Swap stays a **computed** RPC over the equivalence key; persistence is only the coach's
  primary pick + deltas (no materialized alternative lists).

---

## Schema

Keep a single `exercise_library` table. Replace free-text taxonomy columns with
FK columns into per-dimension lookup tables. Columns are NULL for categories that
don't use them (strength columns NULL on a cardio row, etc.).

### Lookup / controlled-vocabulary tables (admin-managed)

Every lookup has: `id`, `slug` (stable key), `display_name`, `display_name_ar`
(i18n), `sort_order`, `is_active`, plus a parent FK where hierarchical.

- `body_regions` — chest, back, shoulders, arms, legs, glutes, core, neck
- `muscles` — FK → body_region. (current `muscle_group` values land here)
- `muscle_subdivisions` — FK → muscle. (current `subdivision` values)
- `movement_patterns` — **already exists**; keep as the movement lookup + cue home.
- `equipment_types` — master list + `applies_to_categories[]`. Resolves the 22
  dirty values (split composites; map cardio machines here).
- `resistance_profiles` — Lengthened, Mid-range, Shortened (+ Full ROM).
- `cardio_modalities`, `energy_systems` — cardio.
- `target_regions` — shared by mobility/warmup/cooldown/physio (can reuse body_regions).
- `techniques` — shared by mobility/warmup/cooldown.
- `physio_structures`, `physio_purposes` — physio.

### `exercise_library` column changes

Add FK columns: `body_region_id, muscle_id, subdivision_id, resistance_profile_id,
modality_id, energy_system_id, target_region_id, technique_id, physio_structure_id,
physio_purpose_id`. Keep `movement_pattern_id` (exists). Equipment becomes a
junction `exercise_equipment(exercise_id, equipment_id)` to model multi-equipment
cleanly (replaces composite text). Backfill from existing values, then drop the
deprecated free-text columns after a soak (mirrors the coaches refactor playbook).

Add indexes on every taxonomy FK (currently missing → admin manager ordering is unindexed).

### Substitute engine

```sql
get_substitute_exercises(p_exercise_id uuid, p_available_equipment uuid[] DEFAULT NULL)
-- SECURITY DEFINER, RETURNS JSONB. Switches equivalence key on category:
--   strength → same subdivision + movement_pattern, overlapping resistance_profile
--   cardio   → same energy_system, comparable modality
--   mobility/warmup/cooldown → same target_region + technique/type
--   physio   → same structure + purpose
-- Ranks: exact-profile match first, then equipment availability.
```
Must include the mandatory REVOKE/GRANT block (CLAUDE.md § "SECURITY DEFINER RPCs").
Grant to `authenticated` (coaches AND clients call it).

### RLS

- Lookup tables: `authenticated` SELECT, admin write. Grant `anon` SELECT only if a
  public page needs them (the public exercise demo, if any).
- `exercise_library`: keep existing (active+global OR own-coach read). Add team-coach
  read parity if program-builder needs it.

---

## Phased rollout

Sequenced so each phase ships independently and the risky data work comes after the
safe wins. Launch is Jul 12 — Phases 0–1 are safe pre-launch; 2–6 can land after.

- **Phase 0 — Cue fix (safe, now).** Targeted migration re-runs Triceps Long Head
  cues with the correct `triceps/triceps_long` filter. Surfaces the 7 empty-cue
  rows for Hasan to fill (don't fabricate coaching cues). Independent of everything else.
- **Phase 1 — Drop legacy table.** `WorkoutLibrary.tsx` is a CRUD page on `exercises`
  (add/edit dialog writes there). Refactor it to a **read-only browse over
  `exercise_library`** (authoring belongs to admin's `ExerciseLibraryManager`).
  Remove the dual-fetch merge in `WorkoutLibrary.tsx` + `WorkoutLibraryManager.tsx`.
  Then `DROP TABLE exercises`. Verify with `tsc`.
- **Phase 2 — Strength lookups + region tier.** Create lookup tables, backfill from
  current values, add FK columns, add body-region parent, enforce, index.
- **Phase 3 — Non-strength facets.** Cardio/mobility/warmup/cooldown/physio lookups;
  migrate the cardio/mobility/warmup rows OUT of `muscle_group` into their facets.
- **Phase 4 — Substitute RPC** + wire "swap exercise" in the builder and
  "find alternative" in client browse.
- **Phase 5 — Frontend.** See the detailed breakdown below.
- **Phase 6 — Cleanup.** Drop deprecated free-text columns (`exercise_library.muscle_group`,
  `subdivision`, and — once nothing reads it — the whole legacy `exercises` table)
  after a zero-drift soak. Update CLAUDE.md "Two exercise tables" section.

## Phase 5 — frontend (detailed)

DB layer is fully applied (Phases 0/2/3/4 + small items). Sequenced so shared
foundation lands first, integrity-critical authoring next, then the big rewrites,
with the legacy-table drop only after every reader is gone.

| Step | Scope | Files | Risk |
|---|---|---|---|
| 5a | Regenerate Supabase TS types for the new tables/columns | `src/integrations/supabase/types.ts` | none (additive) |
| 5b | Shared data layer: `useExerciseTaxonomy` (lookups) + `useExerciseLibrary` (filtered query) + `useExerciseFilters` | new `src/hooks/useExerciseTaxonomy.ts`, `src/hooks/useExerciseLibrary.ts` | none (new files) |
| 5c | Admin authoring → lookup dropdowns; write `muscle_id`/`subdivision_id`/facets; cascading region→muscle→subdivision; category-aware facet fields | `src/components/admin/ExerciseLibraryManager.tsx` | med — highest leverage for future data integrity |
| 5d | Program-builder picker → unified, category-tabbed, faceted over the library; wire **Swap** to `get_substitute_exercises` | `src/components/coach/programs/ExercisePickerDialog.tsx` | med |
| 5e | Client browse → read-only faceted browse; **remove the authoring CRUD + legacy merge** | `src/pages/WorkoutLibrary.tsx` | med — page becomes read-only |
| 5f | Remove dual-table merge in admin manager, then **DROP TABLE `exercises`** (migration) once no reader remains | `src/components/WorkoutLibraryManager.tsx` + new migration | low after 5e |
| 5g | Unconstrained planning-board sessions: session loses hard `type`, one add-panel over whole library, optional focus label | `src/types/muscle-builder.ts`, `SessionAddPicker.tsx`, `SessionBlock.tsx`, `MobileDayDetail.tsx`, reducer | **high** — own sub-effort |
| 5h | Conversion RPC emits a row per activity (not just strength) so mixed sessions log everything | `convert_muscle_plan_to_program_v2` + `ConvertToProgram.tsx` | high |
| 5i | Delete duplicated `MUSCLE_GROUPS` / `getDifficultyColor` maps; add i18n keys for library strings | `WorkoutLibrary.tsx`, `WorkoutLibraryManager.tsx`, locales | low |

**Shared contracts (5b):** one query path everyone uses — admin manager, program-builder
picker, and client browse. No more 5 reimplementations of fetch+filter. Filters:
category → (strength: region/muscle/subdivision/movement/resistance/equipment;
cardio: movement/equipment; mobility-warmup-cooldown: target region/technique;
physio: structure/purpose) + free-text search.

**Recommended start:** 5a + 5b (foundation), then 5c (authoring integrity), then 5d/5e/5f
(swap + browse + legacy drop), then 5g/5h (planning board) as a separate focused effort.

## Open items to confirm before Phase 2

- Body-region set (proposed 8: chest, back, shoulders, arms, legs, glutes, core, neck).
- Whether `target_region` reuses `body_regions` or is its own list.
- Equipment master list (proposed ~15 strength + ~10 cardio) — needs Hasan's gym inventory.
- The 7 empty-cue movements need coaching cues from Hasan (esp. `lats / Pulldown (wide/overhand)`).
