# IGU — Coach Programs View Redesign (Mesocycle / Macrocycle)

_FOR_LATER planning doc. Planning only — no app code changes, no DB writes. Mockups:
`docs/COACH_PROGRAMS_VIEW_MOCKUPS.html`. Created 2026-07-12._

> **Part of a whole-feature redesign.** This doc is the **library / mesocycle-detail / macrocycle** slice of
> the coach programming feature. The umbrella coherence spec is `docs/WORKOUT_PROGRAMMING_REDESIGN.md`
> (+ `WORKOUT_PROGRAMMING_COHERENCE_MAP.html`); the authoritative model/flow is
> `docs/PROGRAM_SYSTEM_UNIFICATION(_BUILD_PLAN).md` + `TEAMS_CANONICAL_BUILD.md` + `DELOAD_V2.md` +
> `COACH_CLIENT_REDESIGN.md`. Build to those; this doc is presentation-layer only.

Owner problem statement (Hasan, 2026-07-12): _"When a coach goes on programs, microcycle, mesocycle,
then draft, I really don't like the current flow. The draft looks so nice, and then as soon as you save
it as a program it's primitive, weird, disorganized — as a mesocycle it looks horrible, and there is no
information given on the mesocycle whatsoever. Macrocycles are just a collection of mesocycles."_

---

## 0. The gap, precisely

The Programs page (`CoachProgramsPage.tsx`) has three tabs: **Macrocycles / Mesocycles / Drafts.**

- **Drafts** = Planning Board muscle plans (`muscle_program_templates.slot_config`). This is the rich
  builder — `MuscleBuilderPage` + `DayColumn` + `SessionBlock`. Per day it shows: **total sets**, an
  **estimated duration range** (mono, clock icon), a **muscle-distribution ribbon** (colored segments per
  parent muscle, sorted by volume), sessions as colored-bar subcards, and rest-day hatching. The side rail
  (`useMusclePlanVolume`) computes **muscles targeted, training days, avg sets/muscle, total reps, working
  sets, TUST**, plus **per-muscle frequency and landmark zone (MEV / MAV / MRV)**.

- **Mesocycles** = saved program templates (`program_templates`), rendered by `ProgramLibrary.tsx`. Each is
  a flat `Card` showing **only**: title (`line-clamp-1`), description (`line-clamp-2`),
  `{program_template_days?.length} days`, a level `Badge`, up to 3 tags, an "Edit Program" button, and a
  kebab (Edit / Edit in Planning Board / Duplicate / Assign to Client / Assign to Team / Add to macrocycle
  / Delete). **It loads `program_templates` joined with `program_template_days(id)` — the id array only.**
  So it literally has no session, exercise, muscle, volume, or week data to display. That is the "no
  information whatsoever."

- **Macrocycles** = `macrocycles` + `macrocycle_mesocycles` (ordered sequence). Presented as a bare list of
  the contained mesocycles with no arc, no progression, no per-block summary.

**The core insight: the information already exists.** Everything the draft shows is derivable from the
saved program's own rows — `program_template_days → day_modules → module_exercises → exercise_prescriptions`
(sets/reps live on the prescriptions / `sets_json`; muscle comes from `exercise_library.primary_muscle` or
the converted slot's source muscle). And the analytics engine already exists — `useMusclePlanVolume` and
the `DayColumn` ribbon. **The redesign is mostly presentational reuse: read the modules, feed the existing
volume math, render the existing ribbon/summary idioms on the saved-program surface.** It is not a new
analytics system.

Also note the week structure is recoverable: conversion encodes weeks (microcycles) as `day_index` ranges
(W1 = 1–7, W2 = 8–14, …), so the detail view can group days back into weeks without a schema change.

---

## 1. Design goals

1. **A saved mesocycle should read as well as its draft** — the coach should understand the whole program
   at a glance (structure + volume + muscle balance), without re-opening the Planning Board.
2. **Reuse the draft's visual vocabulary** so the two surfaces feel like one system: the muscle-distribution
   ribbon, the mono sets/duration strip, the volume tiles, the MEV/MAV/MRV zone language.
3. **Give macrocycles a reason to exist** — show the training arc across blocks (phase, weeks, volume trend),
   not just a list.
4. **Zero schema churn for P1/P2.** Everything renders from existing rows; only later optional caching if
   the per-card computation is too heavy for the grid (see §5).

---

## 2. Redesign — three surfaces

### 2A. Mesocycle card (Mesocycles tab grid) — from "N days" to a legible summary

Replace the info-poor card with a **content-forward card** that surfaces the computed shape:

- **Header:** program name (still `line-clamp-1`), level badge, and a **structure line** — `6 wks · 4
  days/wk · 24 sessions` (weeks derived from `day_index` ranges; days/wk = distinct training weekdays;
  sessions = `day_modules` count).
- **Muscle-distribution ribbon** — the exact `DayColumn` ribbon, but aggregated across the whole
  mesocycle: colored segments per parent muscle, sorted by set volume. This is the single highest-value
  add — it tells the coach _what this program trains_ in one glance.
- **Focus chips** — the top session archetypes (e.g. `Push · Pull · Legs`, or `Upper · Lower`), derived
  from session names / dominant muscle per day.
- **Volume strip (mono):** `312 sets · 18 exercises · ~58 min/session` — mirrors the draft's mono
  sets/duration idiom.
- **Footer:** up to 3 tags + the kebab (unchanged actions). Primary click opens the **detail view** (2B),
  not straight into the editor. "Edit" moves into the kebab / detail header.

Mockup: screen 1.

### 2B. Mesocycle detail view — the draft, read-optimized (NEW)

Opening a mesocycle currently jumps to an editor. Add a **read view** first — a clean, organized program
overview that mirrors the draft's structure top-to-bottom. Grounded in Runna's week-block pattern and
Hevy's muscle-distribution + stat tiles.

1. **Overview header** — name, level, structure line, and the primary actions (Edit in Planning Board ·
   Assign to Client · Assign to Team · Add to macrocycle).
2. **Summary band** — a row of `MetricCard`s reusing `useMusclePlanVolume.summary`: **Sets / week**,
   **Exercises**, **Muscles targeted**, **Est. time / session**. Beside them, the **muscle-distribution**
   rendered larger (ribbon + labeled legend, or the Hevy-style muscle bars), plus **per-muscle landmark
   zones** (MEV / MAV / MRV chips) so the coach sees under/optimal/overreaching balance — the draft
   already computes `getVolumeLandmarkZone`.
3. **Week-by-week (microcycles)** — one card per week: `Week 1 · 4 sessions · 78 sets`, then day rows
   (`Day 1 — Push · 6 exercises · 18 sets · ~55 min`) with the session-type colored bar. A day expands to
   its exercises (`Incline DB Press · 4 × 8–10`, reusing `client_name ?? name`). If weeks are identical
   except for progression, collapse to "Weeks 2–4 repeat Week 1 with +load" (progression deltas exist in
   the Planning Board's weekly-delta engine; surface them read-only).
4. **Deload / phase markers** — flag deload weeks (the draft's `isDeloadByWeek`) inline on the week card.

Mockup: screen 2.

### 2C. Macrocycle view — the arc, not a list (NEW)

A macrocycle is an ordered sequence of mesocycles. Present it as a **training arc / timeline**:

- **Arc header:** total span (`13 weeks · 3 blocks`), goal/phase label.
- **Block timeline:** each mesocycle as a block segment sized by its week count, labeled with its phase
  intent (`Hypertrophy → Strength → Peak`), showing per-block summary (weeks, sessions/wk, headline
  focus, sets/wk). A thin **volume-trend line** across blocks makes the periodization legible (e.g.
  volume tapering into the peak block).
- **Reorder / add / remove** blocks inline (the existing `MacrocycleEditor` actions), plus **Assign whole
  macrocycle to client** (the existing `assign_macrocycle_to_client_canonical` engine).
- Each block links to its mesocycle detail (2B).

Mockup: screen 3.

---

## 3. What data feeds each surface (all existing rows)

| Surface | Reads | Computed via |
|---|---|---|
| Mesocycle card ribbon + strip | `day_modules` → `module_exercises` → `exercise_prescriptions` (sets), exercise → `primary_muscle` | `useMusclePlanVolume` fed with a slot-shaped adapter |
| Structure line (wks/days/sessions) | `program_template_days.day_index`, `day_modules` count | derive weeks from `day_index` ranges |
| Detail summary tiles | same volume summary | `useMusclePlanVolume.summary` |
| Landmark zones | per-muscle `totalSets` vs `muscle.landmarks` | `getVolumeLandmarkZone` (already used in draft) |
| Week/day breakdown | `program_template_days` grouped by week, `day_modules`, `module_exercises` | grouping only |
| Macrocycle arc | `macrocycle_mesocycles` (sequence) + each mesocycle's summary | reuse per-mesocycle summary |

**One shared adapter is the whole trick:** a small function that maps a saved program's
`module_exercises` (+ prescriptions + exercise muscle) into the `MuscleSlotData[]` shape that
`useMusclePlanVolume` and the ribbon already consume. Build that once and both the card and the detail
view light up. (This adapter is the inverse of `convert_muscle_plan_to_program_v2`, read-side only.)

---

## 4. Reuse map (don't rebuild)

- **Ribbon:** the `DayColumn` muscle-distribution ribbon (colored segments, `getMuscleDisplay` colors).
- **Volume math + zones:** `useMusclePlanVolume` (summary, per-muscle, `getVolumeLandmarkZone`), and
  `estimateSessionDuration` / `formatDurationRange` for the time estimate.
- **Cards & tiles:** flat `Card` (12px radius, no shadow, `CardTitle` 500), `MetricCard`, `ClickableCard`
  for the card→detail nav (never `<Card onClick>`), `Badge` for level/tags.
- **Naming:** `client_name ?? name` for exercise rows.
- **Theme:** default-dark IGU tokens; crimson `--primary`; macro/muscle colors from `getMuscleDisplay`.
- **Mobile:** week/day breakdown collapses to stacked accordions; the ribbon and tiles wrap (follow the
  `useIsMobile` drawer patterns already used across the board).

Mobbin references pulled 2026-07-12: **Runna "Your Plan"** (week cards: `Week N · date range · Total
Workouts · [session rows]` + segment bar) → 2B week cards; **Hevy "Muscle distribution"** (radar +
`Workouts / Duration / Volume / Sets` tiles) → 2B summary band; **Nike Run Club "Plans"** (week header +
completion + day rows) → day-row idiom; **Bevel "Total Volume"** (per-muscle volume) → distribution legend.

---

## 5. Phasing

- **P1 — Rich mesocycle card.** Build the read-side volume adapter; render ribbon + structure line + focus
  chips + mono strip on `ProgramLibrary` cards. Highest impact, lowest surface area. _Green once the
  adapter lands._
- **P2 — Mesocycle detail view.** New read view (summary band + week-by-week breakdown), card click routes
  here; editor moves behind an explicit "Edit" action. Reuses the P1 adapter.
- **P3 — Macrocycle arc.** Timeline/arc presentation + volume-trend line in `MacrocycleLibrary` /
  `MacrocycleEditor`; per-block summaries reuse the P1 adapter.
- **P4 (optional) — Perf cache.** If per-card computation is heavy in a large grid, denormalize a
  `program_templates.summary_json` (sets, muscles, weeks, ribbon) written at save/convert time. Only if
  measured slow — P1 should be fine computing on read for a coach's own library size.

---

## 6. Open decisions (for Hasan)

1. **Card click target** — open the new **detail view** (recommended) vs keep opening the editor directly.
2. **Focus-chip source** — session names (`Push`/`Pull`) if coaches name sessions, else auto-derive from
   dominant muscle per day. Recommend: session name when present, else derived.
3. **Landmark zones on the card** — show MEV/MAV/MRV chips on the small card too, or reserve for the detail
   view to keep the card clean? Recommend: ribbon + strip on the card; zones in detail only.
4. **Macrocycle volume-trend line** — sets/week per block (simple, recommended) vs a relative-intensity
   proxy (needs load data we may not have per template).
5. **Progression display** — when weeks differ only by weekly-delta rules, show "Weeks 2–4: +load"
   summary (recommended) vs render every week in full.

---

## 7. Non-goals (display redesign only)

- The display redesign (§2–§5) doesn't touch the conversion RPC or the canonical program model.
- No new client-facing surface — this is coach Programs only.
- (The **flow redesign** in §8 below _does_ change the draft→program lifecycle — tracked separately.)

---

## 8. Flow & IA redesign — "one program, one lifecycle" (added 2026-07-12)

Hasan, reacting to the display mockups: _"I found it confusing how I go to a program and assign it to a
client — it seems messy. And once a draft is made into a program, the draft should just **become** the
program. I'm seeing drafts remain as drafts and the program becomes a program — it's like an upgrade, but
the flow is weird."_ He also greenlit restyling the Planning Board cards for coherence.

### 8.1 Why it feels forked (grounded in the code)

One training block is stored as **three** objects today:

```
muscle_program_templates (DRAFT, slot_config JSONB — the Planning Board edit buffer)
   └─ converted_program_id ─▶ program_templates (MESOCYCLE — normalized, assignable-ish)
                                  └─ plan (CANONICAL MIRROR, via source_muscle_template_id)
                                       └─ what assign_*_canonical actually clones onto a client
```

And the UI exposes the seams at every step:

- **Two tabs hold two copies.** The **Drafts** tab lists `muscle_program_templates`; the **Mesocycles**
  tab lists `program_templates`. After converting, the same block appears in **both** — the draft even
  wears a "Converted" badge and lingers. That's the "drafts remain as drafts and the program becomes a
  program."
- **"Convert to Program" is a jargon step,** not a save. It always **INSERTs a new `program_templates`
  row** (`ConvertToProgram.handleConvert`). Re-converting an edited draft creates **another** program —
  duplication, and old copies may already be assigned to clients.
- **"Edit in Planning Board" opens a _duplicate_ of the draft** (per `ProgramLibrary`'s own prop comment:
  _"open Planning Board on a duplicate of that plan"_). So editing forks yet again instead of editing the
  one thing.
- **Assignment is buried and fragile.** It lives in the mesocycle card's **kebab → Assign to Client /
  Assign to Team** (two separate menu items → two dialogs). And it **silently requires** the program to
  have been "opened once in the Planning Board" or `assign_*_canonical` returns `skipped` with _"isn't
  ready for assignment yet"_ (`assignProgram.ts`). A coach who built in the draft and never re-opened the
  compiled program hits a dead end.

### 8.2 This is already designed & partly built — reconcile, don't reinvent

**Correction (after reading the code + the existing plans, 2026-07-12).** The flow fix is **not net-new** —
it is the **Program System Unification** (`docs/PROGRAM_SYSTEM_UNIFICATION.md` = architecture / Direction A;
`docs/PROGRAM_SYSTEM_UNIFICATION_BUILD_PLAN.md` = execution). The forked legacy graph in §8.1 is exactly
what that effort is retiring, and much of the replacement is **already shipped**. This display redesign
(§2–§5) must sit on the **canonical `plan*` model**, not the legacy `program_templates`/convert path.

What's already true in the code (so don't re-propose it):

- **One canonical object.** `save_plan_from_builder(p_template_id, p_payload)` is an **identity-preserving
  upsert** — it mirrors a board save into `plan / plan_weeks / plan_sessions / plan_slots` **in place**
  (stable ids keyed on `builder_session_id` / `builder_slot_id`), so canonical logs stay linked. There is
  **no "compile INSERTs a duplicate" problem on the canonical path** — that was the legacy
  `convert_muscle_plan_to_program_v2` → `program_templates` path, which the unification removes. So my
  earlier "idempotent compile / edit-opens-a-duplicate" build items are **already solved canonically**;
  the fix is to finish cutting the UI over to `plan*` and drop the legacy surface, not to build upsert.
- **Assignment = own-your-copy clone.** `assign_template_to_client_canonical` **clones** the template plan
  (`clone_plan`) and points the client's `client_plan_assignment.plan_id` at their **own frozen copy**;
  teams share ONE plan (`assign_team_plan`, `team_id` set, no clone). Teams are fully canonical in prod.

### 8.3 The sync rule — DECIDED and matches Hasan exactly (not an open decision)

Hasan: _"If the client's workout hasn't been edited it should sync; if it has been edited on their page it
won't, because they have a different thing."_ That is the **already-agreed** rule, per
`PROGRAM_SYSTEM_UNIFICATION_BUILD_PLAN.md` (Board v2 context skins + Teams track):

- **1:1 client** — the client owns a copy that **follows the template until it's edited**. Editing the
  client's program on their page **detaches** that copy (TrueCoach-style **Sync toggle**: _"following
  template"_ ↔ _"detached / frozen"_, amber "edited" badges). While following, template edits sync down;
  once detached, it keeps its own version. (Mechanism evolved P4 override-layer → S-series **own-your-copy
  clone**; the `client_plan_overrides` table is being dropped in S5. Same semantic either way.)
- **Team** — members share the one team plan; editing it hits **all** members, **zero per-member
  overrides**, **no Sync toggle** (the shared plan _is_ the source).

So §8's job is **not** to decide propagate-vs-snapshot — that's settled. The display redesign just has to
**surface** the state: on an in-use program, show which clients are _following_ vs _detached_; in the
1:1 board context, show the Sync toggle + amber edited badges that the unification plan already specs.

### 8.4 IA + card, aligned to the unification's three objects

The unification already lands on three top-level objects — **Programs (templates) · Clients (1:1) ·
Teams** — with the Planning Board as the single program surface (three context skins: Template / 1:1 /
Team). This display redesign maps onto that:

- **Programs** library — one card per canonical template `plan`. The §2A rich card is that card, plus the
  two things the unification's mock already calls for: a primary **Assign** action + **Edit** (opens the
  board), and a **reach** readout — **`N clients · M teams`** — so "in use" is shown as real reach, not a
  vague pill. Status (`Draft` / `Ready`) still reads off whether the plan is complete/assignable.
- **Macrocycles** — the §2C arc.
- Drop the duplicate legacy "Drafts vs Mesocycles" split as the UI cuts over to `plan*` (a draft is just a
  template plan that isn't complete yet).

### 8.5 Assignment — adopt the unification's mocked assign flow (don't invent a new one)

The assign flow is **already mocked + agreed** in the unification plan; build to it rather than my earlier
simpler version:

- Template card: **Assign** (primary) + **Edit** + reach `N clients · M teams`.
- **One assign dialog**, target = **Client / Team / Several**, with **start date**, **start-on-day**
  (TrueCoach), and a **Sync toggle — 1:1 only** ("following template" default vs "detached"). Team fan-out
  via `assign_team_plan`; 1:1 via `assign_template_to_client_canonical` (clone). Draft chosen → "Finish
  this program to assign it," never a silent skip.
- Second entry point from a client's page ("Assign a program") is the same dialog — worth adding, sequenced
  with the Clients-track work.

### 8.6 Planning Board card coherence (greenlit)

Bring `DayColumn` / `SessionBlock` into the same flat-`Card` + ribbon + mono sets/duration vocabulary as
the redesigned Programs surface, so the board (Template skin) and the saved program read as one continuous
surface — reinforcing that they _are_ one canonical object.

### 8.7 What this doc actually adds (scope boundary)

Given the unification owns the model + flow, **this doc's contribution is the presentation layer**: the
rich mesocycle card (§2A), the mesocycle **read/detail** view (§2B), the macrocycle **arc** (§2C), the
muscle-distribution + landmark-zone visual language, and the reach/status/sync surfacing on top of the
canonical `plan*` model. It should be built **as part of / after** the unification UI cutover, not against
the legacy `program_templates` surface. **Open items are display choices only** (see §6); the flow/sync/
assignment decisions are already made in the unification plan.
