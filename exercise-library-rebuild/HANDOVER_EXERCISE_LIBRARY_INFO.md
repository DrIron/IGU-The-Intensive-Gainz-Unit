# Handover — IGU Exercise Library (INFORMATION workstream)

**For:** the next Cowork session picking up this workstream.
**Date:** 2026-07-18.
**Owner context:** Hasan (dr.ironofficial), coach + owner of IGU. He is NOT a developer — you write
paste-ready blocks; he relays them to Claude Code (CC) and pastes results back. You cannot push git or
run `db push` from the sandbox — **all prod writes go through CC via `db push`, gated on Hasan's approval.**

---

## 0 · The one boundary that matters

There are **two** exercise-library workstreams. Keep them clean:

- **THIS workstream = INFORMATION.** The database, taxonomy, muscle model, the exercise roster, all
  exercise *content* (names, setup steps, execution cues, resistance/equipment metadata, video links),
  and converting free-text fields into controlled vocab. You own the generator + migrations.
- **DESIGN workstream = a separate coworker + their design doc.** Look, layout, components, mockups,
  the client demo card, library browse, Learn hub. **Do NOT touch the design doc.** The interface
  contract between the two is in `IGU_Exercise_Library_Design_Handoff_Brief.md` (§9). You deliver clean
  field shapes; they bind to them.

Do not drift into design work. If Hasan asks for a mockup, that's the design coworker's lane — confirm
before crossing over.

---

## 1 · Where things stand (prod = Supabase `ghotrbotrywonaejlppg`)

**LIVE (shipped PR #241, 2026-07-17):** the full canonical library — **576 active exercises**
(550 strength / 22 systemic / 4 powerlifting). Old ~300 strength rows deactivated (`is_active=false`,
kept so historical program refs resolve); cardio/mobility/warmup untouched. ~901 rows total.

**BUILT THIS SESSION, awaiting CC `db push` (NOT yet applied):** an amendment taking the generator to
**587**. See §2. The CC prompt to apply it is ready (Hasan has it; also reproduced in §5).

Key schema facts (verified against live DB this session — always re-verify before speccing, past builds
bounced 3× on wrong column shapes):
- `exercise_library` columns used by the load: `name` (coach label, UNIQUE — index
  `exercise_library_name_unique`), `client_name`, `equipment` (text, atomic code), `category`
  (enum `exercise_category`: strength/cardio/mobility/physio/warmup/cooldown/sport_specific +
  `systemic` + `powerlifting`), `muscle_group` (text = `lower(muscle)`), `subdivision` (text),
  `movement_pattern` (text), `positioning` (text), `grip` (text), `laterality` (text 'bi'/'uni'),
  `resistance_profiles` (text[]), `muscle_id` (FK), `subdivision_id` (FK), `is_global`, `is_active`.
- FKs resolve **by name** against `body_regions.display_name`, `muscles.display_name`
  (+ `primary_region_id`), `muscle_subdivisions.display_name` (+ `muscle_id`).
- `(whole)`-muscle exercises (Quads, Adductors, Hamstrings, Abductors, Hip Flexors, Tibialis, Neck,
  Systemic, Powerlifting) store `subdivision = NULL, subdivision_id = NULL`.
- Muscle display names of note: Glutes → subs "Gluteus Maximus/Medius/Minimus"; "Mid Back" →
  "Mid Trapezius"/"Rhomboids"/"Lower Trapezius"; Triceps → "Long Head"/"Lateral & Medial Head".

---

## 2 · What was built this session (the pending amendment)

Hasan's structural correction: **reverse lunge belongs under Glutes; normal lunge stays under Quads.**
Plus fill gaps so the 7 formerly-approximate legacy remaps become exact.

Generator went **576 → 587**: +11 new, 3 reactivated, 2 deactivated.

- **New (11):** Glute Max Reverse Lunge {BB, DB, SM} + DB Front-Foot-Elevated + DB Contralateral-Elevated;
  Quads cable Step-Ups {C-FT, C-AA, C-SG}; Mid Traps Standing Retraction Rows {C-FT, C-AA, C-SG}.
- **Reactivated (3, existed inactive from the old library — same exact names):** Adductors BW Copenhagen
  Plank, Glute Med DB Side-Lying Abduction, Triceps Long M Overhead Extension.
- **Deactivated (2, moved to Glutes):** Quads BB Reverse Lunge, Quads DB Reverse Lunge.

Two migration files (apply order **mig 4 THEN mig 3** — mig 3's by-name repoints need mig 4's inserts to exist):
- `migration_4_additions.sql` — `INSERT … ON CONFLICT(name) DO UPDATE` (handles inserts + reactivations
  uniformly) + the 2 deactivations. All 14 add/reactivate rows were **dry-run-verified** against live prod
  (every row resolves muscle_id/subdivision_id; none dropped by the inner join).
- `migration_3_remap_programs.sql` (revised) — the original 43-row legacy→canonical program remap, now
  split: **36** exact hardcoded remaps + **4** repointed BY NAME (their mig-4 uuids are runtime-random) +
  **3 dropped** (their legacy row is reactivated in mig 4, so program refs auto-resolve). Result: all 7
  formerly-approximate remaps are now exact.

Every ⚠ in `IGU_Program_Remap_Review.md` is resolved; the doc explains each of the 7.

---

## 3 · How the roster is produced — the GENERATOR (source of truth)

Do NOT hand-edit the CSV or migrations. Everything flows from **`exlib_gen.py`** (in `outputs/` and repo
`exercise-library-rebuild/`). It's a rules-as-data generator:

- `R(equip, positioning, laterality, resistance, label=…, grip=…)` = one exercise row.
- `build(region, muscle, subdivision, prefix, { 'Movement': [R(...), R(...)] })` expands rows and
  auto-generates the coach `name` (grammar: `{prefix} {equip-code}[ brand] [positioning] [Single-Arm]
  {movement} ({resistance})`) and a friendly `client_name` (equipment word, cables → "Cable", drop
  internal codes, friendly muscle prefix for uniqueness).
- `resistance` is L/M/S (single or slash-joined like `L/M/S`) → stored as array
  `{Lengthened,Mid-range,Shortened}`. `grip` is a multiselect attribute (doesn't multiply rows).

Workflow to change the roster: edit `exlib_gen.py` → `python3 exlib_gen.py` (regenerates
`exercise_library_generated.csv`) → diff vs live DB by name → build an amendment migration (insert new,
`ON CONFLICT(name) DO UPDATE` reactivates existing-inactive, `UPDATE is_active=false` for removed) →
verify FK resolution read-only against prod → hand to CC.

**Naming/model principles already locked with Hasan** (don't relitigate):
- movement = pure action; ALL modifiers (angle, grip, path, bench, shoulder position) = the positioning axis.
- Positioning-driven resistance (stepped-back/standing/arm's-length) = SEPARATE exercises (each gets its
  own demo/setup), NOT collapsed.
- Deadlift variants (conventional/RDL/stiff-leg) are DISTINCT, not dupes.
- Systemic = full-body complexes + carries; Powerlifting = comp lifts. Powerlifting → PR-eligible,
  Systemic → no PRs (wired in prEngine).
- Equipment atomic: BB, DB, M, SM, BW, BND, TB, KB, Belt, Sled + cables C-AA, C-FT, C-SG, C-SF, C-SB, C-BS.

---

## 4 · Pending / open items

1. **Apply the amendment.** Hand mig 4 then mig 3 to CC via `db push`. CC prompt is in §5.
2. **Live-smoke the picker** (needs Hasan signed in — he has 4 payment-exempt test clients
   dr.ironofficial+<tier>@gmail.com; Cowork drives via Chrome MCP + seeds via execute_sql). Confirm the
   Planning Board / program-creation activity panel shows the new Glute reverse lunges + cable step-ups,
   and that the moved Quads reverse lunges no longer appear.
3. **Volume-key gap (flagged, not yet fixed).** The muscle-builder volume engine (`MUSCLE_GROUPS` landmark
   table in `src/types/muscle-builder.ts`) doesn't map the newer muscles' `volume_key`s — new muscles
   count toward total sets but not per-muscle volume. CC needs to map landmarks for Upper/Mid Back, Abs,
   Core, Elbow Flexors (reuse nearest existing) and decide whether Systemic/Powerlifting are excluded from
   per-muscle volume. Not a blocker; flag it.
4. **DEFERRED — the entire CONTENT phase. Do NOT start it unless Hasan says go.** Order when it comes:
   execution cues (per-movement node, inherited) → setup points (per-exercise) → demo video → admin
   add-exercise cascade UI (spec: `IGU_Admin_Add_Exercise_System_Spec.md`, extends
   `src/components/admin/ExerciseLibraryManager.tsx`) → powerlifting/discipline content-versioning. Hasan
   has said "not yet" to content twice.
5. Minor deferred: split the `"Stepped-Back Bent-Over"` positioning into two multiselect tokens at the
   taxonomy level.

---

## 5 · The CC prompt to apply the pending amendment (paste-ready)

> Apply two exercise-library migrations to prod via `db push`, in this exact order (mig 4 first — mig 3's
> by-name repoints depend on mig 4's inserts existing). SQL is ready in
> `exercise-library-rebuild/migration_4_additions.sql` and `.../migration_3_remap_programs.sql`.
>
> Context: follow-up to PR #241 (576-exercise load). Reverse lunge recategorised Quads → Glutes (normal
> lunge stays Quads), 11 new exercises added, 3 previously-deactivated rows reactivated. Makes all 7
> formerly-approximate legacy program remaps exact.
>
> 1. Create two timestamped files in `supabase/migrations/` (YYYYMMDDHHMMSS; mig 4's ts strictly earlier
>    than mig 3's): `<ts1>_exercise_library_additions_reverse_lunge_move.sql` ← migration_4_additions.sql;
>    `<ts2>_remap_programs_exact.sql` ← migration_3_remap_programs.sql.
> 2. `supabase db push`.
> 3. Verify (paste results back):
>    - `SELECT count(*) FROM exercise_library WHERE is_active AND category='strength';` — expect **+12** vs pre-push.
>    - `SELECT name,is_active FROM exercise_library WHERE name IN ('Quads BB Reverse Lunge (L)','Quads DB Reverse Lunge (L)');` — both `false`.
>    - `SELECT name,is_active FROM exercise_library WHERE name IN ('Adductors BW Copenhagen Plank (M)','Glute Med DB Side-Lying Abduction (S)','Triceps Long M Overhead Extension (L)');` — all `true`.
>    - `SELECT count(*) FROM module_exercises WHERE exercise_id IN ('bdf90752-e57d-4cfa-a94b-0dd6ed98bdb4','67988daa-22ab-4199-82b1-6161af810b10','b04d3a89-d031-46bd-bea6-039c1ff98583','6472d98b-990a-4ae6-93c1-cf8e6d2370ee');` — expect **0**.
>    - Confirm none of those 4 repointed `module_exercises.exercise_id` are NULL.
> 4. Regen `src/integrations/supabase/types.ts` from prod; `npx tsc -p tsconfig.app.json` (report delta vs
>    ~292 baseline); commit; push.
>
> Notes: unique index `exercise_library_name_unique` exists → `ON CONFLICT (name)` is valid. Don't edit
> the SQL — it's dry-run-verified. Rationale in `IGU_Program_Remap_Review.md`.

---

## 6 · Files (all in repo `exercise-library-rebuild/` and `outputs/`)

| File | What |
|---|---|
| `exlib_gen.py` | **The generator — source of truth.** Edit here, never the CSV. |
| `exercise_library_generated.csv` | 587-row output. |
| `migration_4_additions.sql` | Pending: 11 insert + 3 reactivate + 2 deactivate. |
| `migration_3_remap_programs.sql` | Pending (revised): 36 exact + 4 by-name + 3 dropped. |
| `IGU_Program_Remap_Review.md` | Legacy→canonical remap rationale (all ⚠ resolved). |
| `IGU_Exercise_Library_Load_Plan.md` | The original taxonomy + load plan (decisions A/B/C). |
| `IGU_Exercise_Library_Information_Master.md` (outputs) | Locked vocab: equipment, movements, positioning catalog. |
| `IGU_Admin_Add_Exercise_System_Spec.md` (outputs) | The future admin cascade UI spec (content phase). |
| `IGU_Exercise_Library_Design_Handoff_Brief.md` (outputs) | The interface contract with the DESIGN workstream. |

Memory file carrying this workstream's history: `project_igu_exercise_library_info_workstream.md`
(read it first — it has the full dated trail).

---

## 7 · Coordination rules (learned the hard way)

- **Ground every schema claim against the live DB** (`execute_sql`) BEFORE speccing. Past builds bounced
  on wrong table/column shapes.
- **Prod writes only via CC `db push`**, one CREATE FUNCTION per file if any RPCs (Supabase CLI dollar-quote
  splitter bug). Never out-of-band MCP DDL for structural changes (the 2026-07-06 13-row insert was a
  one-off pure-data exception Hasan approved).
- **After any DB change, regen `types.ts` from prod**, and tsc with `tsconfig.app.json` (root tsc is a no-op).
- Write **paste-ready** CC blocks — no preamble; Hasan is the copy-paste middleman.
- This exercise library is the detailed backing model for the Planning Board's / program creation's
  **activity panel** — changes here surface there.
