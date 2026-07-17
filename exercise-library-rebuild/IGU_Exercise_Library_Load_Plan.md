# IGU Exercise Library — Finalize & Load Plan

Source of rows: `exercise_library_generated.csv` (576 exercises). This plan covers taxonomy prep,
client names, and the load — **up to content** (setup/execution/video are a later phase).

**Execution:** written for Claude Code to apply via `supabase db push` (migration file), NOT out-of-band MCP.
After apply, regen `types.ts` **from latest `main`**. Touches only `exercise_*` + taxonomy tables. Nothing runs
until Hasan confirms the flagged decisions below.

---

## 1 · Taxonomy deltas (do first — the 576 FK into these)

Mostly additive. Current muscle/subdivision IDs captured (2026-07-06).

### New regions (`body_regions`)
- **Systemic** — full-body complexes + carries (22 exercises)
- **Powerlifting** — competition lifts (4 exercises)

### New muscles / subdivisions
| Region | Muscle | Subdivision(s) | Status |
|---|---|---|---|
| Back | **Upper/Mid Back** | Compound | NEW muscle + subdivision (multi-target rows) |
| Arms | `Biceps / Elbow Flexors` → rename **`Elbow Flexors`** | add **Biceps** (generic) | rename muscle + new subdivision; Long/Short/Brachialis/Brachioradialis already exist |
| Core | **Core** | **TVA** | NEW muscle (deep bracing: anti-extension/anti-rotation/partial crunch) |
| Systemic | **Systemic** | (whole) | NEW |
| Powerlifting | **Powerlifting** | (whole) | NEW |

### ⚑ Decision A — the Abs/Core restructure
Current DB: `Rectus Abdominis` and `Obliques` are **muscles** directly under the Core region.
The new model wants a muscle **`Abs`** with `Rectus Abdominis` + `Obliques` as its **subdivisions**, sitting
next to the new `Core` (TVA) muscle. Two ways:
- **(A1, recommended)** Create muscle `Abs`; convert `Rectus Abdominis` + `Obliques` into subdivisions under it.
  Clean hierarchy, matches the model. Requires repointing any existing exercises on those muscles.
- **(A2)** Keep `Rectus Abdominis` + `Obliques` as muscles; treat "Abs" as display-only grouping. Less disruptive, but the model/hierarchy won't match the CSV.
**Hasan: pick A1 or A2.**

### Subdivision `(whole)` → `NULL`
CSV `(whole)` (Quads, Hamstrings, Adductors, Abductors, Hip Flexors, Tibialis, Neck, Systemic, Powerlifting)
maps to `subdivision_id = NULL` on the muscle. No new subdivision rows needed for these.

### Unused-by-new-model (leave as-is, don't delete)
Pec Minor, Rotator Cuff · Teres Minor, Quads · Vastii, Core · Pelvic Muscles — keep; the new roster just doesn't populate them yet.

---

## 2 · Equipment / movement / positioning
These are **text columns** on `exercise_library` (or the movement lookup) — no blocking schema change to load rows.
- **New equipment codes used:** `TB`, `KB`, `Belt`, `Sled`, `SM`, `BND`, plus cable subtypes `C-SF/C-SB/C-BS/C-SG` (already partially present). Add to the equipment vocab/enum if one exists.
- **New movements:** Carry, Cross-Body Extension, Complex, Protraction (exists), Straight-Arm Pullover, etc. — text; back them with `movement_patterns` rows for the cue-inheritance layer later.
- **Positioning** is stored per the positioning model; **split `Stepped-Back Bent-Over` into two multiselect tokens** (`Stepped-Back` + `Bent-Over`).
- **`resistance_profiles`** is an array — load the CSV `resistance` (e.g. `L/M/S`) as `{Lengthened,Mid-range,Shortened}`.

---

## 3 · Client names
CSV carries a first-pass `client_name` (equipment collapsed to "Cable", muscle prefix dropped, res suffix dropped).
### ⚑ Decision B — client-name uniqueness
94 collisions (e.g. 13× "Cable Single-Arm Row") because the muscle prefix is dropped. In-app these are disambiguated
by muscle grouping, so collisions may be fine. Options:
- **(B1)** Keep contextual names (collisions OK — the UI always shows them under a muscle). Simplest.
- **(B2)** Prefix the target muscle for global uniqueness ("Lat Cable Single-Arm Row"). Add a friendly-muscle map.
Also fix the double-word artifact ("Machine Machine Crunch" → "Machine Crunch") — skip the equipment word when the label already contains it.
**Hasan: pick B1 or B2.**

---

## 4 · Load strategy (⚑ Decision C — confirm)
Existing ~348 exercises are referenced by live client programs (by `exercise_id`). Non-destructive plan:
1. **Insert the 576** as `is_global=true, is_active=true`, resolving `muscle_id`/`subdivision_id` by **name lookup** against the taxonomy (so no hardcoded IDs).
2. **Deactivate the old** set (`is_active=false`) — keep the rows so historical program references still resolve; they just stop appearing in pickers.
3. The 13 already-inserted Ganbaru additions (trap-bar DL, carries, etc.) — reconcile: either dedupe against the new canonical rows or leave (they're `is_global`).
**Hasan: confirm "insert new + deactivate old" (vs a full old→new remap).**

---

## 5 · Planning Board volume tracking
The muscle-builder volume engine counts sets via `muscles.volume_key` / `muscle_subdivisions.volume_key`.
**New muscles/subdivisions (Abs, Core/TVA, Elbow Flexors·Biceps, Upper/Mid compound, Glute Min already keyed, Systemic, Powerlifting) need `volume_key` set** so volume counting stays correct. Systemic/Powerlifting: decide whether they contribute to a muscle's volume (they're multi-muscle) or are excluded from per-muscle volume.

---

## 6 · Sequence for CC
1. Migration 1 — taxonomy: new regions, new muscles/subdivisions, the Elbow Flexors rename, Abs/Core per Decision A, `volume_key`s.
2. Migration 2 — data: insert 576 (name-resolved FKs) + `resistance_profiles` arrays + `client_name`; deactivate old.
3. Regen `types.ts` from `main`. Verify pickers (Planning Board + program creation) show the new set; volume counts sane.
4. Later phases: execution cues (per movement), setup (per exercise), demo video, the admin add-exercise UI, discipline/powerlifting content versioning.
