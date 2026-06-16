# Strength Picker → DB Taxonomy Alignment — Scoping Plan

> Status: PROPOSED (2026-06-16). Finishes the unfinished slice of the Exercise
> Library Redesign (#147). Read alongside `docs/EXERCISE_LIBRARY_REDESIGN.md`
> (Phase 5g/5i) and CLAUDE.md § "Activity logging".

## Problem

The non-strength tabs of the activity panel (`UnifiedSessionPicker` →
`LibraryBrowse`) already share the library's data layer (`useExerciseTaxonomy`
+ `filterExercises`). The **Strength tab does not** — it delegates to
`SessionAddPicker`, which is built on hardcoded constants in
`src/types/muscle-builder.ts` (`MUSCLE_GROUPS`, `SUBDIVISIONS`, `BODY_REGIONS`).

Result: two different strength breakdowns for the same exercises.

| | Activity panel (Strength tab) | Workout Library |
|---|---|---|
| Source | hardcoded `muscle-builder.ts` | DB lookups (`body_regions`/`muscles`/`muscle_subdivisions`) |
| Regions | 4 — `push, pull, legs, core` (training split) | 7 — chest, back, shoulders, arms, legs, core, neck (anatomical) |
| Muscles | 19 ids | 24 |
| Subdivisions | 54 | 36 |

## Why it wasn't done in #147 (the real constraint)

`SessionAddPicker` fires `onAddMuscle(muscleId)` → reducer `ADD_MUSCLE`, and the
**muscle id is the volume-tracking key**: `useMusclePlanVolume` computes
MV/MEV/MAV/MRV landmarks per hardcoded muscle id, and the persisted
`slot_config` JSONB stores these ids. The conversion RPC + landmark data all
key on them. Swapping the picker to DB UUIDs without addressing this breaks
volume tracking and existing saved plans. This is the "high-risk, own
sub-effort" item flagged in the redesign doc.

## The slug reconciliation (measured 2026-06-16)

Not a 1:1 rename. Direct matches (13): `abductors, adductors, calves,
elbow_flexors, forearm, glutes, hamstrings, hip_flexors, lats, neck, quads,
rotator_cuff, triceps`.

Renamed: `pecs`→`pec_major`, `serratus`→`serratus_anterior`,
`shoulders`→`deltoids`, `tibialis`→`tibialis_anterior`.

Split: `core`→`rectus_abdominis`+`obliques`(+`pelvic_muscles`);
`upper_mid_back`→`upper_back`+`mid_back`(+`lower_back`).

DB-only muscles with **no hardcoded equivalent** (need volume landmarks defined):
`pec_minor, pelvic_muscles, lower_back, deltoids` (+ the split children).

Note the **subdivision direction is inverted**: hardcoded has *more*
subdivisions (54) than the DB (36). Moving to DB taxonomy verbatim would *lose*
subdivision granularity in the picker — the DB subdivision set may need
expansion first, or some hardcoded subdivisions retired deliberately.

## Recommended approach — two phases

### Phase A — Mapping layer (lower risk, ships the visible win)

Keep the hardcoded muscle ids as the **volume-tracking canonical key**; render
the Strength tab from the DB taxonomy but translate on add.

1. **Reconcile + add a stable map.** Add `volume_key TEXT` to `muscles` and
   `muscle_subdivisions` (the hardcoded id each row maps to), or ship a
   `src/types/muscleTaxonomyMap.ts` constant if you'd rather not touch the DB.
   Fill in the renames/splits above. Decide a volume key for the DB-only
   muscles (e.g. `deltoids`→`shoulders`) and add landmarks for any genuinely new
   ones.
2. **New strength browse in the picker** that reads `useExerciseTaxonomy`
   (Region → Muscle → Subdivision cascade, same as `WorkoutLibrary.tsx`), but on
   select emits `onAddMuscle(volumeKey)` so `ADD_MUSCLE` / `useMusclePlanVolume`
   are unchanged.
3. Wire it into `UnifiedSessionPicker`'s strength branch (replacing the
   `SessionAddPicker` delegation). Keep `SessionAddPicker` until parity is
   verified.
4. **Verify:** `tsc`; add muscles across all 7 regions; confirm volume
   landmarks still compute; load + re-save an existing `slot_config` and confirm
   no id drift; confirm conversion to program still works.

Deliverable: coach sees the same 7-region anatomical tree as the library, volume
math untouched.

### Phase B — Migrate volume tracking to DB ids (cleaner, later)

Make DB muscle/subdivision ids the canonical key end-to-end: `ADD_MUSCLE`
carries the DB id, `useMusclePlanVolume` landmarks re-keyed by DB id, landmark
seed data moved into a DB table, one-time migration of persisted `slot_config`
ids, conversion RPC updated. Removes the mapping layer and the duplicated
`muscle-builder.ts` constants (redesign Phase 5i). Higher blast radius — do it
as its own PR after Phase A soaks.

## Decisions (locked 2026-06-16)

- **New-muscle landmarks:** approved. `pec_minor` 0/2/6/10, `lower_back`
  2/4/12/16, `obliques` 2/4/12/16 (extrapolated, flagged in code comments);
  `pelvic_muscles` not volume-tracked.
- **Subdivisions:** accept the DB's 36 as canonical (no expansion to 54). The
  coarser DB nodes (vastii, forearm digits, neck/hip-flexor heads) roll up to
  muscle level.
- **Mapping home:** in the DB — `volume_key` columns on `muscles` /
  `muscle_subdivisions`, editable later.

## Phase A — IMPLEMENTED 2026-06-16 (pending migration push + browser smoke)

- Migration `supabase/migrations/20260616120000_add_volume_key_to_muscle_taxonomy.sql`
  — adds `volume_key` to both lookups + backfills all 24 muscles / 36
  subdivisions. Validated read-only against prod: every slug mapped, only
  `pelvic_muscles` NULL. **Not yet applied to prod** (push via `db push` on the
  feature branch to avoid prod-ahead-of-main drift).
- `src/types/muscle-builder.ts` — added `pec_minor`, `lower_back`, `obliques` to
  `MUSCLE_GROUPS` with the approved landmarks.
- `src/hooks/useExerciseTaxonomy.ts` — `Muscle`/`Subdivision` now carry `volume_key`.
- `src/components/coach/programs/muscle-builder/StrengthTaxonomyBrowse.tsx` (new)
  — renders the 7-region DB tree, emits each node's `volume_key` via `onAddMuscle`
  so volume tracking is unchanged; hides NULL-key nodes.
- `UnifiedSessionPicker.tsx` — strength tab now renders `StrengthTaxonomyBrowse`,
  falling back to the legacy `SessionAddPicker` only if the migration hasn't
  landed (no `volume_key` populated). `tsc` clean.
- **Still owed:** browser smoke test (add a muscle + subdivision, confirm volume
  landmark colours compute, save + reload a `slot_config`).
