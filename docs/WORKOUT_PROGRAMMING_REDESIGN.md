# IGU — Workout Programming: Coherent Feature Redesign (umbrella)

_FOR_LATER planning. Planning only — no app code, no DB writes. Created 2026-07-12._

This is the **umbrella coherence spec** for the coach-side workout-programming feature. Hasan: _"This is a
redesign of the whole feature now — the upgrade has to be coherent."_ The feature is already heavily
designed across many docs; the risk is fragmentation (each surface styled/flowed differently, and new
sessions re-proposing what's decided). This doc does one thing: **make every programming surface one
visual language and one journey, on top of the already-authoritative model.** It owns coherence, not the
data model.

> **Authoritative model/flow docs — this umbrella defers to them, never contradicts:**
> `PROGRAM_SYSTEM_UNIFICATION.md` + `PROGRAM_SYSTEM_UNIFICATION_BUILD_PLAN.md` (canonical `plan*` model,
> own-your-copy clone, 1:1 Sync toggle, assign flow, Board v2 context skins, supersets + per-set
> instruction menu), `TEAMS_CANONICAL_BUILD.md` (shared team plan, zero overrides), `DELOAD_V2.md`
> (authored + on-demand deloads), `COACH_CLIENT_REDESIGN.md` (Client Overview shell, Workouts tab, vitals
> rail, B4 in-place editor), `COACH_SYSTEM_REVIEW.md` (capacity, subroles). Presentation children:
> `COACH_PROGRAMS_VIEW_PLAN.md` (+ mockups) = the library/detail/macro surfaces; this umbrella absorbs it
> as §4C.

---

## 1. The whole feature, as one journey

Today the feature is a set of disconnected screens with different looks and a forked object model. The
coherent target is a single loop a coach travels, every surface sharing primitives:

```
   BUILD ─────────▶ LIBRARY ────────▶ ASSIGN ────────▶ COACH IN USE ────────▶ CLIENT
   Planning Board   Programs +        one dialog        1:1 client skin        today's workout
   (Template skin)  Macrocycles       Client/Team/      + Team skin            + logger
                    (rich cards)      Several + Sync     (edit → sync)          (canonical read)
        ▲                                                      │
        └──────────────────  edit the same object  ◀───────────┘
```

The single object travelling this loop is the canonical **`plan`** (the unification's whole point). Build
mirrors board → plan in place; Library lists plans with reach; Assign clones (1:1) or shares (team); In-use
edits flow back to the same board and sync to following clients; the client reads the canonical resolver.
**One object, one loop** — that is the coherence thesis, and it's already the unification's architecture.

## 2. The four surfaces that must feel identical

1. **Builder / Planning Board** (`MuscleBuilderPage` + `DayColumn` + `SessionBlock` + volume rail) — the
   Template/1:1/Team skin editor. Already the richest surface; it sets the visual vocabulary.
2. **Programs library + Mesocycle detail + Macrocycle arc** (`ProgramLibrary`, new detail view,
   `MacrocycleLibrary`) — the saved-program surfaces. Today info-poor and visually divergent (see
   `COACH_PROGRAMS_VIEW_PLAN.md`). Must adopt the builder's vocabulary.
3. **Assignment** (`AssignFromLibraryDialog`) — the one dialog (Client/Team/Several + start date +
   start-on-day + Sync 1:1-only). Already close; just needs to read the shared card summary.
4. **Coach-in-use surfaces** (Client Overview → Workouts tab; My Teams → team program) — where the coach
   sees a program live on a client/team and edits it. Governed by `COACH_CLIENT_REDESIGN` (B4) +
   `TEAMS_CANONICAL_BUILD`; must render the same program summary + sync state.

Plus the **client-facing** end (today's workout card + `WorkoutSessionV2` logger) — coherent through the
canonical resolver + the exercise-library client design (`EXERCISE_LIBRARY_CLIENT_DESIGN.md`).

## 3. The shared "programming design system" (codify once, use everywhere)

Every surface above must be built from the **same primitives**. Most already exist in the builder — the
job is to lift them into shared components and use them on the saved-program + in-use surfaces too.

| Primitive | What | Source of truth today | Used on |
|---|---|---|---|
| **Muscle-distribution ribbon** | thin colored stacked bar per parent muscle, volume-sorted | `DayColumn` ribbon + `getMuscleDisplay` colors | builder day, program card, detail, macro block |
| **Volume tiles** | sets · exercises · muscles · est. time · TUST | `VolumeOverview` / `useMusclePlanVolume.summary` | builder rail, detail summary band |
| **Landmark-zone chips** | MEV / MAV / MRV per muscle | `getVolumeLandmarkZone` | builder rail, detail distribution |
| **Session-type color bar** | left bar keyed to activity type | `ACTIVITY_TYPE_COLORS` / `SessionBlock` | builder session, detail day rows |
| **Mono stat strip** | `JetBrains Mono` sets/duration/reach line | `DayColumn` header strip | everywhere numbers appear |
| **Status pill** | Draft / Ready / In use · N | new (this redesign) | library card, detail header |
| **Sync pill** | Following / Detached / Team | unification 1:1 Sync model | in-use client list, client skin banner |
| **Week (microcycle) card** | week header + day rows + progression delta | new (detail) + `ProgressionRulesBar` | detail, in-use program view |
| **Flat Card / MetricCard / ClickableCard** | 12px radius, no shadow, `CardTitle` 500 | design foundation (DS1) | all cards |

Tokens (authoritative, `DESIGN_TRACK_HANDOVER`): crimson `hsl(355 78% 48%)`, 12px radius, Geist body /
Bebas display / JetBrains Mono data, **no gradients, no shadows, font-weight ≤ 600**, status rails
emerald=on-track / amber=attention / red=behind. **No e1RM** anywhere; actual logged rep-maxes only.

## 4. Surface-by-surface redesign

### 4A. Builder / Planning Board — align, don't rebuild
The builder is the reference; keep its power (weeks, sessions, volume rail, progression rules, deload,
Calendar⇄Weeks toggle, context skins). Coherence changes only:
- `DayColumn` / `SessionBlock` adopt the shared flat-`Card` + ribbon + mono-strip components (so the
  library/detail literally reuse the same code, not a lookalike).
- The **context banner** (Template / 1:1 client / Team) uses the shared Status/Sync pill vocabulary.
- Net-new builder work is owned by the unification (supersets/circuits grouping, per-set instruction menu:
  back-off / drop / rest-pause / AMRAP / note) and `DELOAD_V2` — **not re-specced here**; this umbrella
  only ensures they render in the shared language.
- Retire the **legacy** parallel editor pathway (`ProgramEditor` / `ProgramCalendarBuilder` /
  `DayModuleEditor` / `SessionEditorSheet`) as the UI cuts to the board on `plan*`. Two editors for one
  concept is the biggest structural incoherence. (Also reconcile the `studio/` alt-render — one board.)

### 4B. Library + Assign — the front door
Per `COACH_PROGRAMS_VIEW_PLAN.md` §2A + §8: one **Programs** tab (drafts + mesocycles merged, one row per
plan, status pill + reach `N clients · M teams`), a **Macrocycles** tab (arc), primary **Assign** + **Edit**
on each card, and the single agreed assign dialog. Nothing here contradicts the unification — it _is_ the
unification's mocked library/assign flow, drawn in the shared language.

### 4C. Mesocycle detail + Macrocycle arc (absorbed from COACH_PROGRAMS_VIEW_PLAN)
The read-optimized detail (summary band + distribution + week-by-week → exercises) and the macro arc
(blocks sized by weeks, phase-labeled, sets/week trend). Built from the shared primitives + the one
read-side adapter (`module_exercises`/`plan_slots` → the `MuscleSlotData[]` shape `useMusclePlanVolume`
already eats). See `COACH_PROGRAMS_VIEW_PLAN.md` for the full detail.

### 4D. In-use (Client Overview Workouts tab + Team program) — show reach & sync
On a client's Workouts tab and a team's Program section, render the **same** program summary card + week
breakdown, plus the **sync state** (1:1: Following/Detached with amber edited badges; Team: shared, always
inherits). Editing routes into the board (respective skin). This is `COACH_CLIENT_REDESIGN` B4 + Teams T2/T3
— this umbrella only pins that they reuse §3's primitives so the program looks the same whether viewed in
the library or on a client.

## 5. Coherence rules (apply to every programming surface)

1. **One object language.** Never show "draft vs mesocycle vs plan" to a coach — it's a **Program** with a
   status. Legacy `program_templates` naming disappears from coach-facing copy as the UI moves to `plan*`.
2. **One card.** The program summary (name · structure line · ribbon · volume strip · status/reach) is a
   single shared component rendered in library, detail header, assign dialog, and in-use views.
3. **One editor.** All editing is the Planning Board in the right skin. No second grid/calendar editor.
4. **One set of primitives.** Ribbon, tiles, zone chips, session bars, mono strips, pills — imported, not
   re-implemented per surface.
5. **Numbers speak the same.** Mono font for all stats; MEV/MAV/MRV, TUST, adherence, PRs use identical
   glyphs/colors across builder, detail, and the coach-client Workouts pulse.
6. **Mobile parity.** Every surface stacks to one column with the established drawer patterns (coaches
   program on phones) — the current mockups are desktop-only and need the mobile pass.

## 6. Incoherences to fix (the actual backlog this creates)

- **Two editors for one concept** — muscle-builder board vs legacy `ProgramEditor`/`ProgramCalendarBuilder`.
  Consolidate onto the board (`plan*`); retire legacy after P5.
- **Saved surfaces don't use the builder's vocabulary** — library/detail/macro (COACH_PROGRAMS_VIEW fixes).
- **Three-tab IA with duplicate rows** — Drafts + Mesocycles hold two copies of one thing (unify to Programs).
- **`studio/` alternative rendering** — decide: fold into the one board or drop; don't maintain two looks.
- **Assign was kebab-buried / silently skips** — promote to primary + the agreed dialog (already specced).
- **Desktop-only mockups** — owe the mobile pass across the whole feature.
- **Program summary re-derived ad hoc** — build the one read adapter + shared card so every surface agrees.

## 7. Build sequencing (presentation slotted onto the model phases)

The model work is phased (unification P1→P5, Teams T1→T5, Deload v2, Coach-Client B-series). The
presentation redesign rides those, it doesn't precede them:

1. **Now / parallel (no model dep):** shared primitives extraction (ribbon/tiles/zone/pill/mono into
   `src/components/coach/programs/shared/`), the read adapter, the rich **library card + detail + macro
   arc** (COACH_PROGRAMS_VIEW P1–P3) — reads existing rows, ships independently.
2. **With unification UI cutover:** unify IA to Programs + Macrocycles, retire legacy editor + duplicate
   drafts tab, assign dialog to the shared card, context-skin banners in shared pills.
3. **With Teams T2/T3 + Coach-Client B4:** in-use program view + sync-state surfacing reuse the same card.
4. **Cross-cutting, last:** mobile pass across all surfaces; retire `studio/`.

## 9. Legacy-editor retirement — one board, no second editor

The single biggest structural incoherence: **two editors for one concept.** The Planning Board edits the
canonical draft/plan; a parallel **legacy calendar/grid editor** edits the compiled `program_templates →
program_template_days → day_modules → module_exercises → exercise_prescriptions` tree directly. Grounded in
the code 2026-07-12, here's exactly what exists and how to retire it.

### 9.1 The legacy editor subtree (what's wired today)

| Component | Lines | Status | Reached from |
|---|---|---|---|
| `ProgramCalendarBuilder.tsx` | ~1250 | **LIVE** legacy meso editor (writes `day_modules`/`module_exercises`/`exercise_prescriptions`) | `CoachProgramsPage` (Mesocycles → "Edit Program"), `MacrocycleEditor` (open program), `TeamProgramTab` (edit team program) |
| `SessionEditorSheet.tsx` | — | LIVE (child of ProgramCalendarBuilder) | ProgramCalendarBuilder only |
| `EnhancedModuleExerciseEditor.tsx` | ~690 | LIVE (child of SessionEditorSheet + DayModuleEditor) | SessionEditorSheet, DayModuleEditor |
| `ProgramEditor.tsx` | ~500 | **DEAD** — exported in `index.ts` barrel, never mounted | (none) |
| `DayModuleEditor.tsx` | — | **DEAD** — only imported by dead `ProgramEditor` | (ProgramEditor only) |
| `AssignProgramDialog.tsx` | — | LIVE legacy 1:1 assign | `ClientVitalsRail`, `CoachClientDetail` (client-side "Assign program") |

The board (`MuscleBuilderPage`) already accepts `assignmentId` / `teamId` / `boardContext:
"template"|"client"|"team"` + `startDate` — **the plumbing to be the universal editor already exists**
(Board v2). Retirement is therefore mostly routing + deletion, not new editor construction.

### 9.2 Retirement in three tiers

**Tier 0 — delete dead code now (no dependencies, no gate).**
`ProgramEditor.tsx` is unmounted; `DayModuleEditor.tsx` is reachable only through it. Remove both + their
`index.ts` exports. Pure deletion, ~1000 lines, zero behavior change. (Verify `DayModuleEditor` has no live
importer first — current grep shows only `ProgramEditor` + the barrel.) This is a safe standalone PR.

**Tier 1 — replace the live legacy editor's three entry points with the board.**
Every place that opens `ProgramCalendarBuilder` re-points to `MuscleBuilderPage` in the right skin, reading
the canonical `plan` (not the `program_templates` tree):
- `CoachProgramsPage` Mesocycles → "Edit Program" → board **Template** skin on the program's canonical
  plan. (Removes the "Edit in Planning Board opens a *duplicate*" wart at the same time — §8.1.)
- `MacrocycleEditor` open-program → same board Template skin.
- `TeamProgramTab` → board **Team** skin (`boardContext="team"`, `teamId`) — this is exactly Teams-track
  **T2** ("Open program launches the shared team plan in the P4 board team skin"). So Tier 1's team half is
  gated on T2; the mesocycle/macrocycle halves are gated only on the board being able to **open an existing
  program by its canonical plan** (the unification's board-as-universal-editor cutover).
- Then delete `ProgramCalendarBuilder` + `SessionEditorSheet` + `EnhancedModuleExerciseEditor` (~2000+
  lines) once no route mounts them.

**Tier 2 — consolidate the assign dialogs into one.**
Three assign surfaces exist: `AssignFromLibraryDialog` (library), `AssignProgramDialog` (client-side, via
`ClientVitalsRail` + `CoachClientDetail`), `AssignTeamProgramDialog` (team). Collapse to **one shared
dialog** (the agreed Client/Team/Several + start-date + start-on-day + Sync-toggle-1:1 dialog from §8.5).
The client-side entry points call the same dialog with the client preselected. Retire the two extras.

### 9.3 Data-layer consequence (hands to the unification P5)

Once **no editor writes** the legacy `program_templates → … → exercise_prescriptions` tree (all editing is
the board → canonical `plan*`), those meso tables become read-only, then droppable — which is precisely the
**P5 legacy burn-down** in `PROGRAM_SYSTEM_UNIFICATION_BUILD_PLAN.md`. This umbrella doesn't own that drop;
it just notes that retiring the editor is the UI prerequisite that unblocks it. Assignment already resolves
template → canonical plan (`assign_template_to_client_canonical`), so nothing reads the legacy tree for
assignment.

### 9.4 Sequencing & risk

1. **Tier 0** ships immediately (dead-code deletion) — do first, it shrinks the surface and de-risks the rest.
2. **Tier 1 mesocycle/macrocycle** ships with the board-opens-existing-program cutover (unification).
3. **Tier 1 team** ships with Teams **T2** (board team skin).
4. **Tier 2** (assign consolidation) ships with the §8.5 shared dialog.
5. **Delete** ProgramCalendarBuilder subtree only after 1–3 land and a soak with zero legacy-editor mounts.

Risk to flag: `ProgramCalendarBuilder` is the **only** current way to edit a saved program's exercises
directly (the board historically edited the draft, then converted). The board must reach **full parity**
(open any saved program, edit sessions/exercises/prescriptions, save in place) **before** deletion — verify
against the 4 test clients + a team, same as the unification's parity gates. Don't delete on faith.

### 9.5 Tier 0 — dead-code deletion PR (ready to build now)

Verified against the codebase 2026-07-12 — safe, standalone, zero behavior change. This is the ideal first
commit of the whole effort: it shrinks the surface before any redesign lands.

**Proof it's dead:**
- `ProgramEditor.tsx` — no `<ProgramEditor` mount anywhere; the only references are its own definition, its
  export in `index.ts:2`, and it importing `DayModuleEditor`. Nothing renders it.
- `DayModuleEditor.tsx` — referenced only by its own definition, its export in `index.ts:3`, and the import
  inside dead `ProgramEditor`. With `ProgramEditor` gone it has no consumer.
- The barrel `src/components/coach/programs/index.ts` is **imported nowhere** (grep for imports of
  `@/components/coach/programs` / `./programs` / `../programs` → no matches). Every live component is
  imported by its direct path (e.g. `AssignProgramDialog` directly by `ClientVitalsRail` /
  `CoachClientDetail`), so removing barrel exports breaks nothing.

**The change:**
1. Delete `src/components/coach/programs/ProgramEditor.tsx`.
2. Delete `src/components/coach/programs/DayModuleEditor.tsx`.
3. In `src/components/coach/programs/index.ts` remove the two exports (`ProgramEditor`, `DayModuleEditor`).
   If the barrel is now empty/near-empty, note it as a follow-up (it's already unused) but don't expand
   scope here.
4. Grep `ProgramEditor.tsx`'s own imports for any helper it was the **sole** consumer of and remove those
   too — but **keep `EnhancedModuleExerciseEditor`** (still used by the live `SessionEditorSheet` subtree)
   and keep everything shared.

**Don't touch / don't confuse:** `featureFlags.ts:isClientProgramEditorEnabled()` is unrelated — it's the
P4 *client* program editor flag; the substring match is coincidental. Leave it.

**Verification:** `tsc -p tsconfig.app.json` green (the real gate — a dangling import would surface here),
`npm run build` succeeds, Programs hub + coach client surfaces render unchanged. ~1000 lines removed, no
migration, no flag, no UX change. Reviewable in minutes.

**Risk:** none functional. Only residual risk is an unused-but-intended-for-later component — but
`ProgramEditor` predates the muscle-builder board and is superseded by it, so deletion is correct, not
premature (git history preserves it if ever needed).

## 10. Mobile pass — every programming surface, phone-first

**Mobile mockups: `docs/WORKOUT_PROGRAMMING_MOBILE_MOCKUPS.html`** (6 phone screens — library, detail,
day-drawer, macro arc, assign sheet, reach/sync).

Coaches program on their phones; the redesign mockups so far are desktop-only. IGU's mobile contract
(CLAUDE.md): `useIsMobile()` branches to **vaul `Drawer`** for modals/pickers, `pb-24 md:pb-8` so content
clears the `h-16` dock, 44px touch targets, `h-10 text-base` inputs, safe-area padding, single-column
stacks. The builder already has a mobile layer (`MobileDayDetail`, `MobileWeekStrip`, `MobileSetEditor`,
`MobileSetCard`, `MobileSetCarousel`) and `CoachProgramsPage` already does mobile (FAB, drawer assign, card
stacks). The gap is the **new** surfaces (§2–§4). Per-surface treatment:

### 10.1 Programs library (mobile)
- One-column card stack (the §2A card is already flex-column — it reflows cleanly).
- Filter chips (`All · Drafts · Ready · In use`) in a horizontal scroller; tabs (Programs · Macrocycles)
  same. FAB for "New" (exists).
- Card footer wraps: reach strip on its own line above the `Edit` / `Assign` buttons (buttons full-width,
  44px). Ribbon + mono strip stay — they're the at-a-glance value on a small screen.

### 10.2 Mesocycle detail (mobile)
- Summary tiles → **2×2 grid**, not a 4-wide row. Distribution bars go full-width (already horizontal bars).
- **Week cards become accordions** — collapsed to `Week N · 4 sessions · 78 sets`; expand to day rows.
  Tapping a day opens a **`MobileDayDetail`-style Drawer** (reuse the builder's component) showing that
  day's sessions + exercises — one component, both surfaces (coherence).
- Sticky header: program name + a single primary **Assign** button; secondary actions in an overflow.

### 10.3 Macrocycle arc (mobile)
- The horizontal block timeline doesn't fit a phone. Two options (recommend **A**): **(A)** stack blocks as
  vertical cards in sequence, each with its phase chip + mini ribbon + `wks · days/wk · sets/wk`, and render
  the sets/week **trend as a small inline sparkline** on each card rather than one wide axis; **(B)** keep a
  horizontal scroll-snap track. Assign-macrocycle as a sticky bottom button.

### 10.4 Assign dialog (mobile)
- Render as a **vaul Drawer** (bottom sheet, `max-h-92vh`), not a centered Dialog. Segmented
  Client/Team/Several full-width; client/team picker is a searchable list inside the sheet; **native date
  input**; Sync toggle a full-width row with the explainer beneath. Primary "Assign" pinned at the bottom
  with safe-area padding.

### 10.5 Reach / sync state (mobile)
- One-column rows; the Following/Detached/Team pill sits under the client name if it wraps. The "editing
  syncs to N following" confirm is a Drawer, not an inline callout.

### 10.6 Builder parity check (not a rebuild)
- Confirm the redesigned session/day cards route through the existing `MobileDayDetail` / `MobileWeekStrip`
  on phones; confirm the muscle-distribution ribbon + volume tiles render legibly at small width (ribbon
  min-height, tiles 2-up). The context-skin banner (Template/1:1/Team) collapses to a single line.

### 10.7 Cross-cutting mobile checklist (apply to all of the above)
`pb-24 md:pb-8` on every scroll container · Drawers not Dialogs for pickers/modals · 44px min touch targets ·
`h-10 text-base` inputs (no iOS zoom) · mono numbers stay ≥ 12px · horizontal scroll-snap for week/filter
strips · one-column reflow, never a squeezed multi-column grid · safe-area insets on sticky/pinned actions.

## 11. Shared-primitives extraction — the concrete first PR

The coherence thesis (§3) only becomes real if every surface imports the **same** components. Today those
visuals live inline inside `DayColumn` / `SessionBlock` / `VolumeOverview`. Step one is a **pure refactor**:
lift them into `src/components/coach/programs/shared/` with clean prop contracts, and re-point the builder
to import them. No visual change, no model dependency — the safest possible first PR, and it unblocks the
library card / detail / macro work to reuse instead of re-implement.

### 11.1 New home
`src/components/coach/programs/shared/` — presentational only (no data fetching, no Supabase). Colors/zones
come from the existing sources (`getMuscleDisplay`, `ACTIVITY_TYPE_COLORS`, `getVolumeLandmarkZone` in
`types/muscle-builder.ts`); volume math from `useMusclePlanVolume`. These primitives just render.

### 11.2 Components to extract (props contract · source · consumers)

| Component | Props | Lifted from | Consumers |
|---|---|---|---|
| `MuscleDistributionRibbon` | `segments: {id, colorHex, pct}[]` · `height?` | `DayColumn` inline ribbon | builder day, program card, detail, macro block, in-use |
| `SessionTypeBar` | `activityType: ActivityType` · `size?` | `SessionBlock` left bar (`ACTIVITY_TYPE_COLORS`) | builder session, detail day rows |
| `LandmarkZoneChip` | `zone: LandmarkZone` | `VolumeOverview` inline chip (`getVolumeLandmarkZone`) | builder rail, detail distribution |
| `VolumeTiles` | `summary: VolumeSummary` · `layout?: 'row'\|'grid'` | `VolumeOverview` tiles | detail summary band, in-use |
| `MuscleDistributionBars` | `entries: MuscleVolumeEntry[]` | new (composed from `volumeEntries`) | detail, in-use |
| `ProgramStatStrip` | `{ sets, exercises, estMin?, reach? }` (mono) | `DayColumn` header strip | card, detail, assign, in-use |
| `ProgramStatusPill` | `status: 'draft'\|'ready'\|'in_use'` · `count?` | new | library card, detail header |
| `SyncStatePill` | `state: 'following'\|'detached'\|'team'` | new | in-use client list, client/team skin banner |
| `WeekBreakdownCard` | `{ week, days[] }` · `defaultCollapsed?` | new (composed) | detail, in-use, mobile day-drawer |
| `ProgramSummaryCard` | `{ program, status, reach, onEdit, onAssign }` | new — composes ribbon + strip + pills | **library, assign dialog, detail header, in-use** (the one card §5.2) |

`ProgramSummaryCard` is the keystone: build it once and the "same card everywhere" rule (§5.2) holds by
construction.

### 11.3 The one read adapter (unblocks saved surfaces)

The builder computes volume from live in-memory `MuscleSlotData[]`. Saved programs have their data in
`plan_slots` (canonical) / `day_modules → module_exercises → exercise_prescriptions` (legacy). One adapter
bridges them:

```ts
// src/components/coach/programs/shared/programSummaryAdapter.ts
// Maps a saved program's rows into the slot shape useMusclePlanVolume + the ribbon already consume.
adaptCanonicalPlanToSlots(plan_slots, plan_sessions, plan_weeks): MuscleSlotData[]   // primary
adaptLegacyProgramToSlots(day_modules, module_exercises, prescriptions): MuscleSlotData[] // transitional, dies with legacy
// then: const { summary, volumeEntries } = useMusclePlanVolume(adaptedSlots);
```

Build the **canonical** adapter first (it's the future); the legacy one is a thin transitional shim that
retires with the legacy tables (§9.3). This adapter is the single dependency the library card / detail /
macro all share.

### 11.4 PR sequence

1. **PR1 — extract primitives (pure refactor, no model dep).** Create `shared/`, move the 6 existing
   visuals (ribbon, session bar, zone chip, volume tiles, stat strip) + add the 2 new pills; re-point
   `DayColumn`/`SessionBlock`/`VolumeOverview` to import them. **Verify: builder renders pixel-identical
   (screenshot diff), `tsc -p tsconfig.app.json` green, no behavior change.** Ships alone.
2. **PR2 — adapter + `ProgramSummaryCard` + rich library card** (COACH_PROGRAMS_VIEW P1). Reads existing
   rows; ships independently.
3. **PR3 — `WeekBreakdownCard` + `MuscleDistributionBars` + mesocycle detail view** (P2).
4. **PR4 — macro arc** (P3). Then the in-use surfaces reuse `ProgramSummaryCard` + `SyncStatePill` as
   Teams T2/T3 + Coach-Client B4 land.

### 11.5 Guardrails
Extraction is presentational only — do not fold data fetching into `shared/` (keep it dumb + reusable).
Match the existing tokens exactly (12px radius, no shadow, mono numbers) so PR1 is a true no-op visually.
Keep the mobile variants (`MobileDayDetail` etc.) importing the same primitives so phone + desktop can't
drift.

## 12. What this umbrella does NOT decide

Model, migrations, RPCs, sync mechanism, assign semantics, deload model, per-set instruction schema, teams
data model — **all owned by the authoritative docs in the callout above.** Open items here are purely
presentation/coherence: primitive extraction boundaries, the exact detail-view layout, macro trend metric,
mobile treatment, and the `studio/` disposition. Everything else: build to the authoritative docs.
