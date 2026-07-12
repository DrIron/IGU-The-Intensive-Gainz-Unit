# IGU Exercise Library — Client Design (design workstream)

_The design side of the exercise-library brief. Pairs with the data/content workstream's handoff and with
`docs/EXERCISE_LIBRARY_REDESIGN.md` (taxonomy / naming / swap / content model). Mockups:
`docs/EXERCISE_LIBRARY_MOCKUPS.html`._
_Created 2026-07-05. Binds to the Section 3 field contract; designed for **Final** field shapes._

Scope: the **client-facing** experience — library browse, the "demo" detail card, the Learn framing, and
the swap sheet. Themed, default dark, real IGU tokens; client surfaces render **`client_name ?? name`**
and never the dense coach label.

---

## 1. The demo card — ONE shared component, three contexts (answers open Q2)

**Grounded in the live flow (WorkoutSessionV2, verified 2026-07-05):** in-session, each exercise card
already has a **video thumbnail** that opens a **"Form & demo" vaul `Drawer`** (`ExerciseGuideSheet`) —
the client never leaves the workout (Runna/Ladder pattern). That sheet today shows the **dense coach
`name`** (the leak), video-only media (or "No demo video yet"), muscle/equipment **chips (no map)**,
numbered Setup, and an Execution paragraph. Set logging is the Weight/Reps/RIR grid with PR detection.
**The demo card IS that drawer, elevated** — same entry point (thumbnail / "Form" → drawer), plus:
`client_name`, the **muscle map**, the **Animation ⇄ Video** toggle, the "your last set" stat, and a
proper **swap** (today's mid-session swap uses a dumb text search that bypasses the engine). Mockup screen
0 shows the logger entry point.

There is **one** `ExerciseDemoCard`, used in **library detail · in-session · swap**. The contexts are
**additive slices**, not separate variants — same layout, a couple of props toggle extra blocks:

```
<ExerciseDemoCard exercise context="library" | "in-session" | "swap" />
```

| Block (top → bottom) | library | in-session | swap |
|---|---|---|---|
| Media + **Animation ⇄ Video** toggle | ✓ | ✓ | ✓ (of the previewed option) |
| `client_name` headline | ✓ | ✓ | ✓ |
| Muscle map (primary/secondary) + chips | ✓ | ✓ | ✓ |
| Meta chips (equipment · resistance · unilateral) | ✓ | ✓ | ✓ |
| Setup (per-exercise) / Execution (per-movement), segmented | ✓ | ✓ | (collapsed) |
| **"Your last set / stats"** | — | ✓ | — |
| Primary CTA | "Find similar" | "Swap" | "Swap this in" |

**Content states to support (this is what the data workstream asked for):** media = `animation | video |
none("demo filming soon")`; setup = `present | pending`; execution = `present | pending`; stats =
`in-session only`. A **half-populated exercise still looks intentional** — pending slots show a quiet
"coming soon," never a broken empty. See mockup screens 1–2.

---

## 1b. Swap / replacement — cover the existing behavior (verified 2026-07-05)

The logger already has a **Swap** action (a dedicated icon on each exercise card, separate from the demo
thumbnail). Today's `SwapExercisePicker` is weak, and the redesign's swap sheet must replace it fully:

**What today does (the gap):** loads the whole library, filters by a **dumb text search** on
name/primary_muscle (sorted same-primary-muscle-first) — **ignores the substitute engine**
(`get_substitute_exercises`); shows the **dense coach name** ("Replace {name}"); **resets logged sets**
for the swapped exercise; is **blocked entirely in canonical/board_v2** ("deferred to P4"); and never
surfaces the coach's explicitly-attached slot **`replacements[]`**.

**What the redesign swap sheet shows (three tiers, in order):**
1. **Your coach's alternatives** — the exercises the coach explicitly attached to this slot
   (compute-not-store: coach's primary + added/removed deltas). First, because they're intentional.
2. **Similar (engine)** — `get_substitute_exercises`: same muscle → subdivision → movement → resistance
   class (with graded "close" fallback). This is the fix for the dumb text search.
3. **Search the whole library** — free search, as today, for full freedom.

Plus: render **`client_name`**; keep the **logs-reset-on-swap** behavior but tell the user; and — a real
build item — **enable swap under canonical/board_v2** (the current block, deferred to P4). Entry points:
the **card Swap icon** (quick) and the **"Find similar"** in the demo card (both open the same sheet).
Mockup: the swap screen in the demo-card row.

## 2. Muscle map — format decision (answers open Q1)

- **Front + back silhouette pair**, both always shown (Fitbod/Tonal/Peloton pattern). Fixed, stylized —
  not per-exercise artwork.
- **Fill:** `primary_muscle` → **crimson** (`--primary`); `secondary_muscles[]` → **dimmed crimson**
  (`--primary` @ ~32%); everything else → neutral (`--muted`). Plus **Primary / Secondary labeled chips**
  beside the figure.
- **Implementation the design owns:** a single `<MuscleMap primary secondary />` SVG with **named region
  shapes**. The design workstream owns the **muscle-slug → SVG-region map** (the 22 muscles collapse onto
  ~16 fillable body regions — e.g. all three delt heads map to the "shoulders" shape, pec subdivisions to
  "chest"). **What I need from data:** just the stable `primary_muscle` + `secondary_muscles[]` slugs
  (already promised in Section 9) — the shape mapping lives in the component, not the DB.
- Deliverable to the data side: none beyond the slugs. (If you'd rather store a `map_region` slug per
  muscle for stability, we can — but the component can own it.)

---

## 3. Extra per-exercise fields the design wants (answers open Q3)

Beyond Section 3, the design needs these — please add to the model:

1. **`animation_url`** — the Animation half of the toggle is a **loop/animation asset distinct from the
   filmed `default_video_url`.** Without a separate field, "Animation ⇄ Video" has nothing to bind the
   first (default) state to. (If animations come later too, design the same `none` state.)
2. **`is_unilateral`** (bool) — drives the "unilateral / single-arm" meta chip (the brief lists it under
   meta chips but there's no field for it).
3. **`thumbnail_url`** — browse rows + swap rows want a small still/loop thumb; can be derived from
   animation/video first-frame, but a dedicated field is cleaner and avoids fetching media to render a list.
4. **Confirm `difficulty`** (beginner/intermediate/advanced) — the current code references
   `getDifficultyColor`, so it may exist; the design wants it for row tags + Learn framing + an optional
   filter. Formalize it as a controlled value if it isn't already.

Not needed for v1 client surfaces: `tempo_default`, `contraindication_note` (coach/physio concerns, not
the client demo).

---

## 4. Browse & Learn (Sections 5–6 direction, designed)

- **Browse — By Muscle first.** A region-card grid with **live counts** (Chest 45 · Back 62 · Shoulders
  40 · Arms 66 · Legs 77 · Core 26 · Neck 7) → muscle → subdivision drill that mirrors the taxonomy, plus
  a category strip (Strength / Cardio / Mobility / Warmup / …) and "Browse all 348". Exercise rows =
  thumbnail · `client_name` · `muscle · equipment · resistance` mono metadata line · ⓘ → the demo card.
  This replaces today's dropdown-facet-first `ExercisesTab` layout with the validated anatomical grid.
- **Learn hub.** Exercises are one tab of **Learn** (with Videos + Pathways): a foundational/featured card,
  a "continue learning" horizontal row, then the library browse entry — exercises framed as **learning
  content**, not just a picker.
- Mockups: screens 3–5.

---

## 5b. Admin — "Add Exercise" cascade form (design workstream owns the form UX)

Handed to design by the data workstream (their spec `IGU_Admin_Add_Exercise_System_Spec.md` — **not
accessible to me; designed from the summary + `EXERCISE_LIBRARY_REDESIGN.md`**). Admins add any exercise —
especially new machines — through a guided cascade in-app, so nobody edits the DB by hand. Extends
`ExerciseLibraryManager.tsx`. Mockups: `docs/EXERCISE_LIBRARY_ADMIN_ADD_MOCKUP.html`.

**Status: design FINALIZED 2026-07-05** (pending the data-side confirmations at the end of this section).

**Every dropdown reads the LIVE DB taxonomy** — no hardcoded lists. The form binds to the existing shared
lookups (`useExerciseTaxonomy`, already built), so it always reflects what's currently in the database
(regions/muscles/subdivisions/movements/equipment/positioning/machine-brands) and grows as admins add.

**The cascade (each step constrains the next):** Category → Region → Muscle → Subdivision → Movement →
Equipment → Positioning (multiselect) → Resistance (multiselect) → Machine → Setup. Region/Muscle/
Subdivision are the strength branch; other categories swap in their facet fields. **Movement is a
controlled dropdown** (writes `movement_pattern_id` — the linchpin that also links execution cues), and
**Execution auto-inherits** from the chosen movement node (shown read-only with an "edit at movement"
link); **Setup** is entered per-exercise (leaf).

**Three key interactions (design owns):**
1. **"+ Add new" on EVERY growable lookup** — region, muscle, subdivision, movement, equipment,
   positioning, machine-brand (glossary-as-data; all grow over time). Two patterns, both saving to the DB
   and instantly selectable without leaving the Add-Exercise flow: **inline** input at the bottom of the
   dropdown for single-field lookups (machine brand, positioning term, equipment); a **compact popup** for
   lookups that need a parent/relationship (muscle→region, subdivision→muscle). Category + resistance are
   fixed sets (no "+ Add new"). See mockup screens 1 (inline) + 3 (popup).
2. **Live auto-generated name preview** — a sticky rail shows both the **client** name and the **coach**
   label composing live as fields fill (per the naming grammar), so the admin sees exactly what will be
   stored before saving.
3. **Machine picker (generic vs named brand)** — only when Equipment = Machine: `○ Generic machine` vs
   `● Named brand → [brand ▾] + Add machine brand`. Brand affects **setup + name only, never the swap
   key**. Smith Machine is its own equipment code `SM`, not a brand.

**Multiselect variant-batching (design assumption — CONFIRM with data):** Positioning + Resistance being
multiselect implies the form can **batch-create one exercise per (positioning × resistance) combination**
in a single save (the preview shows "will create N exercises"). If instead it's one row with multiple
tags, tell me and I'll drop the batch affordance.

**Flags to the data workstream (blocking for a faithful build):** (a) confirm the **exact cascade order**
(the summary puts Equipment before Positioning/Resistance; the redesign doc had resistance→positioning→
equipment — I used the summary); (b) the **name-generation** function + which axes it reads (so the
preview matches the stored value exactly); (c) **positioning applicability** per muscle/subdivision (which
terms to offer); (d) the **machine-brands** lookup; (e) which lookups accept inline **"+ Add new"**;
(f) whether multiselect **batch-creates** rows. I couldn't open the attached spec — these resolve it.

## 5. Interface contract back to the data workstream

I rely on (Section 9): `client_name` populated, atomic equipment + `SM`, controlled `movement` (execution
inherits per-movement), reliable `primary_muscle` + `secondary_muscles`, progressively-filled
`setup_points` / execution / video slots (I designed the pending states). **New asks:** `animation_url`,
`is_unilateral`, `thumbnail_url`, confirm `difficulty` (§3). Everything the mockups show maps to a real
field — no invented data.
