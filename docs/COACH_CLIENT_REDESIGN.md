# Coach ↔ Client experience redesign

Design spec agreed 2026-06-26. Fixes the "cramped, card-stacked" coach client view by moving to a **lightweight section rail · decision/pulse-first main · persistent vitals rail** model. Mocks approved in-session. Build in increments (B1–B6 below).

## Core information architecture

A coach viewing one client (`/coach/clients/:clientUserId`) gets three zones:

1. **Section rail** (left, desktop) / pill scroller (mobile) — Overview · Nutrition · Workouts · Sessions · Messages · Care team · Profile. Unread/attention badges per section.
2. **Main area** — leads with the *decision* or *pulse*, not config. Config (goal forms, reassign phase, program structure) is tucked behind a secondary "Edit …" affordance, never stacked in the body.
3. **Client vitals rail** (right on desktop, top on mobile) — always visible, answers "is this client on track?" at a glance:
   - **Next check-in** countdown
   - **Weight → target** with a sparkline
   - **Adherence %** + a "needs attention" line (pending adjustments, unread, deload requests)
   - **Last workout** + recent PRs
   - Quick actions: Adjust nutrition · Assign program · Message
   - (Plan / tenure / payment live on the Profile tab — not a daily glance.)

Reference patterns: Copilot, Jobber (persistent right info rail), Time2book (pinned key facts), MacroFactor "Strategy" (decision-first nutrition, check-in countdown), Future "Summary" (consistency calendar).

## Nutrition (decision-first)

- Top of the tab = the **recommended adjustment** when one is due: a single "Adjustment recommended · week N — suggest −150 kcal (P0 · F−5 · C−30)" card with **Approve / Adjust / Diet break**. This is the 1:1 coaching loop surfaced, not buried in a sub-tab.
- Adjustment engine (existing): compares **expected vs actual** weight change for the phase (`expected − actual = delta`, sign-aware for cut vs bulk); `AdjustmentCalculator` recommends the calorie/macro change → `nutrition_adjustments` (Approve/Reject + macro delta) + diet-break / refeed options.
- Below: the **phase hero** (macros, on-track status, weight-rate strip).
- Inner tabs lightened to **This week · History · Edit phase**. The goal form / reassign-phase config moves into "Edit phase" so it's not in the daily path.
- Check-in data (the current 3-level check-in system — kept, it's good) surfaced in "This week".

## Workouts (pulse + session review)

Tabs: **Pulse · Programs · Calendar · History.**

### Pulse
- Metric row: **Adherence · Tonnage (volume) · Time under tension · PRs**. (e1RM dropped as a headline — not universal; stays as a per-lift detail in History.)
- **"Needs your eyes" digest** — auto-flags rolled up across this week's sessions.
- **This week's sessions vs last** — each session lists its exercises with a progression flag:
  - 🟢 **Up** — load, reps, or effort-quality improved
  - 🟡 **Stale** — identical numbers 2+ sessions in a row
  - 🔴 **Down** — load/reps/quality regressed
  - ⚠️ **Off-prescription** — logged reps outside the prescribed range, or RIR/RPE significantly off (Rx 3 RIR, logged 1 = too hard; Rx 1, logged 4 = sandbagging)
- Flag logic compares this session's working sets to the same exercise's previous session(s) in that program.

### PR system (broadened, activity-appropriate)
A PR = any form of growth, per the activity:
- Strength: higher weight · same weight×reps at higher RIR (or lower RPE) · same weight, more reps
- Cardio: longer distance same time · same distance faster · new distance
- (Generalizes the 3-type detector shipped in workout-logging A3; ties to the locked milestone matrix.)

## Programs vs Calendar (clean split)

- **Programs** = the *plan* + the *edit* surface. Each program assigned to / built for the client shows separately. Open one → **edit in place**:
  - Drag sessions to reorder within a day or move across days.
  - On a day change, prompt **"apply to following weeks?"** so a Tue→Wed shift cascades.
  - Per-exercise progression rules editable inline; **Copy rule → Paste** onto other exercises, or "apply to all in session".
  - Edits write to the client's program **instance** (`client_program_days` / `client_day_modules` / `client_module_exercises`), never the shared template.
- **Calendar** = the *schedule + did-they-do-it* view. Read-mostly: every scheduled session across programs + ad-hoc sessions on dates with completion status; tap a day → recap. Light scheduling only (drag to another day, inject a one-off).
  - Default view: **week on mobile, month on desktop** (Week/Month toggle).
  - Status colours: emerald done · amber due · red missed · dashed upcoming.

## Communication

- **General thread** (client ↔ coach): WhatsApp primary (meet clients where they are; existing WhatsApp coach button).
- **Contextual comments** (new, in-app): a coach leaves a note *on* a specific session / check-in / adjustment ("great pressing", "cut OHP volume"). Attached to the object, lives where it's relevant. Distinct from general chat. Care-team messages stay in-app as today.

## Build sequence (increments)

- **B1 — Client-detail shell + vitals rail.** Restructure the overview into rail-aware layout; build the persistent vitals rail. Foundation everything hangs off.
- **B2 — Nutrition decision-first.** Promote recommended adjustment to top; tuck config behind "Edit phase"; surface check-in.
- **B3 — Workouts pulse + session review.** Adherence/tonnage/TUT/PRs + "needs your eyes" + per-exercise progression flags (needs the flag/PR engine).
- **B4 — Programs editor.** In-place edit: drag sessions, day-sync, progression rules + copy-paste. (Largest.)
- **B5 — Calendar.** Week/month view-only with status + recap.
- **B6 — Communication.** In-app contextual comments on sessions/check-ins/adjustments.
