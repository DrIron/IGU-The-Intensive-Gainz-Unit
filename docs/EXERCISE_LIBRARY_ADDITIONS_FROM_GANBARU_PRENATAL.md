# Exercise Library — Additions Requested (from Ganbaru Prenatal T1 import)

**Purpose:** Handoff for the exercise-database workstream. These are exercises used in the
Ganbaru Prenatal Trimester 1 program that IGU's `exercise_library` does **not** currently have.
During the T1 import they were substituted with the closest existing entry (noted below).
Hasan has greenlit adding them.

**How to use this list:** Descriptions are deliberately terminology-agnostic — please add each
using the library's own naming scheme, muscle/region placement, equipment codes, and size/(S/M/L)
conventions. The "Closest existing entry" column just shows the neighbourhood so you can place the
new one consistently. Once added, the imported program's substitutes can be swapped to the exact
exercise.

**Source program:** `program_templates.title = 'Prenatal Trimester 1 (3 Day)'`, owner
`92605b68-6f91-4f82-aa91-45b67efbf9c8` (dr.ironofficial). Substituted exercises are flagged in each
`module_exercises.instructions`.

---

## Equipment to add first

| Equipment | Notes |
|---|---|
| **Trap Bar** (hex bar) | New equipment type. Needed for Trap Bar Deadlift below. Hasan: "add trap bar equipment in our equipment." |

---

## Exercises to add (all confirmed by Hasan)

| # | Exercise (common name) | What it is | Equipment | Unilateral | Primary region | Closest existing entry (substitute used) | Hasan's note |
|---|---|---|---|---|---|---|---|
| 1 | **Trap Bar Deadlift** | Deadlift performed inside a trap/hex bar; more upright torso than conventional. | Trap Bar (new) | No | Glutes / hams / quads / back | `Glute Max BB Conventional Deadlift (M)` | "You'll have the conventional deadlift — just add trap bar as equipment." |
| 2 | **Suitcase Carry** | Loaded carry with the weight held at **one** side only; heavy anti-lateral-flexion core demand. | DB / KB | **Yes** | Core / obliques / grip | `Abs DB Farmer's Walk (M)` (bilateral) | "Sure, we can add it." Distinct from the bilateral Farmer's Walk. |
| 3 | **Unilateral Overhead Carry** | Walk while holding **one** DB/KB locked out overhead; shoulder + trunk stability. | DB / KB | **Yes** | Shoulders / core stability | `Spinal Extensors DB Farmer's Walk (M)` | "I think we can add as well." No overhead-carry entry exists today. |
| 4 | **Deficit Single-Leg Hip Thrust** | Single-leg hip thrust with the working foot on a raised surface (deficit) for extra ROM; loadable. | BW / DB / BB | **Yes** | Glutes | `Glute Max BW Single-Leg Hip Thrust (S)` | "We can add that as well." Add the deficit + loadable variant. |
| 5 | **Single-Arm Lat Pulldown (vertical)** | True single-arm **vertical** pulldown on cable/machine. | Cable / machine | **Yes** | Lats | `Iliac Lat C-AA Single Arm Vertical Pull Around (L)` | "We should have single-arm **vertical pulldowns** — don't replace it with a pull-around." Add as its own vertical-pull entry. |
| 6 | **Reverse Lunge (Smith + DB)** | Reverse-stepping lunge. Library currently has a barbell reverse lunge but not Smith-machine or DB variants. | Smith machine, DB | Yes (alternating) | Quads / glutes | `Quads M Smith Lunge (M)` / `Quads BB Reverse Lunge (M)` | "We can add reverse lunges to our database." Add Smith-machine and DB reverse-lunge variants. |
| 7 | **Contralateral Deficit DB Reverse Lunge** | DB reverse lunge with the **front foot elevated** (deficit) and the DB held on the **opposite** side to the working leg (contralateral load) → anti-rotation demand. | DB | **Yes** | Quads / glutes + anti-rotation core | `Quads DB Walking Lunge (M)` | Hasan: "front-foot-elevated / contralateral-foot-elevated reverse lunge — same family." Add as a DB reverse-lunge variant with contralateral-load + deficit notes. |

---

## Lower priority / not explicitly requested

| # | Exercise | What it is | Substitute used | Note |
|---|---|---|---|---|
| 8 | **Cable Step Up** | Step-up with cable (rather than DB) resistance. | `Quads DB Step-Up (M)` | Not called out by Hasan in the add list. DB Step-Up substitute is acceptable; include only if the library wants cable step-up parity. |

---

## Near-matches already covered (no action needed)

These Ganbaru exercises mapped cleanly enough to existing entries and are **not** additions:

- Copenhagen Adductor Lift → `Adductors BW Copenhagen Plank (M)`
- Side-Lying Straight-Leg Abduction → `Glute Med DB Side-Lying Abduction (S)`
- Seated Cable Row (generic) → `Lumbar Lat C-FT Narrow Grip Seated Row (M)`
- Lat Pulldown (neutral / mid grip) → `Iliac Lat M Close Neutral/Semi Supinated Pulldown (L)`
- Barbell Bent-Over Row → `Thoracic Lat BB Wide Overhand Row (M)`

---

## Follow-up once added

Swap these `module_exercises.exercise_id`s in the **Prenatal Trimester 1 (3 Day)** template from the
substitute to the new exact exercise:

- Phase 1 Lower: Single-Leg Hip Thrust (→ Deficit Single-Leg Hip Thrust), Step-Up (→ Cable Step Up, if added)
- Phase 1 Whole Body: Smith Lunge (→ Smith Reverse Lunge), Farmer's Walk (→ Suitcase Carry)
- Phase 2 Lower: Conventional Deadlift (→ Trap Bar Deadlift), Step-Up (→ Cable Step Up, if added)
- Phase 2 Upper: Single-Arm Vertical Pull-Around (→ Single-Arm Lat Pulldown)
- Phase 2 Whole Body: DB Walking Lunge (→ Contralateral Deficit DB Reverse Lunge), Farmer's Walk (→ Unilateral Overhead Carry)
