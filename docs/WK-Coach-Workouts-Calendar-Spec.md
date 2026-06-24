# WK — Coach client Workouts tab: calendar-forward + per-day add menu + program history

**Status:** Drop-in spec (2026-06-23, Cowork). **Priority / effort:** P1 / L. Recomposition of existing components + one new "create program" entry. Approved off the mock (TrueCoach / Runna-grounded). File: `src/components/client-overview/tabs/WorkoutsTab.tsx` (+ sub-components under `client-overview/workouts/**`).

## The problem (verified live)
Today's Workouts tab is status-cards + two buttons: **"Assign program"** *navigates away* to `/coach/programs?tab=mesocycles` (leaves the client entirely), and **"Inject session"** hides the calendar (`DirectClientCalendar`) behind a right-side Sheet. There's no at-a-glance week view, and building a custom program means abandoning the client page. The pieces exist — they're just buried.

## Target (approved mock)
1. **Calendar-forward.** A **weekly training calendar** is the primary content: 7 day columns (Mon–Sun) with a week nav (‹ Jun 22–28 ›), each day showing its scheduled sessions (color-coded by type), drag-to-move between days. Surface `DirectClientCalendar`'s data inline (not in a Sheet) — and it must show BOTH ad-hoc `direct_calendar_sessions` AND program-scheduled workouts for the visible week.
2. **Per-day "+" add menu** (replaces the two-button action bar). Clicking a day's "+" opens a menu, top-down by commitment:
   - **Blank session** → the existing `DirectClientCalendar` ad-hoc add, pre-targeted to that day (`direct_calendar_sessions`).
   - **Saved session** → pick from saved/template sessions → place on the day.
   - **Assign program** → an **in-context program picker** → `AssignFromLibraryDialog` (mode="client"). **Do NOT navigate to `/coach/programs`** — the whole point is staying on the client. (`AssignFromLibraryDialog` needs a `programId`, so add a small library picker step in front of it.)
   - **Create program** → launch the **planning board / muscle builder scoped to THIS client** so the built program saves straight into the client's `client_programs` (and history). Confirm the builder's client-scoped entry — likely a `?clientUserId=` param on the muscle-builder route, or open it in a sheet; flag in the PR which path you used. This is the one genuinely new wiring.
3. **Program history strip** (under the calendar) = the existing `ClientProgramList`, relabeled "Program history": the active program + completed ones, each with **View** (→ `ClientProgramDrilldown`) and **Duplicate / re-run** (reuse `handleReassignSource`'s template path, or duplicate the program). Keep `VolumeChart` + `WorkoutAdherencePulse`.

## Build notes
- **Reuse, don't rebuild** (the file's own ownership note): `DirectClientCalendar`, `AssignFromLibraryDialog`, `ClientProgramList`, `ClientProgramDrilldown`, `SessionLogViewer`, `useClientPrograms`, `VolumeChart`. The work is composition + the calendar-forward layout + the 4-option menu + the create-program entry.
- **Calendar data:** confirm whether `DirectClientCalendar` already renders a week grid and whether program-scheduled `day_modules` appear on it; if it's ad-hoc-only today, the week view must union ad-hoc `direct_calendar_sessions` + the active program's scheduled days for the week. (This is the biggest unknown — scope it first.)
- **Keep** the drill-down, session-log viewer, adherence pulse, and the subscription guard on session injection (`disabled when !subscription`).
- Layout: desktop 7-col week grid; **mobile** collapses to a vertical day-list (Runna-style: each day a row + its sessions + a "+ Add"). Use `useIsMobile()`.

## Non-goals / guardrails
- Don't rebuild the program builder or the assign/calendar dialogs — wire the existing ones.
- Keep the `ClientContext` contract (coach id resolved from auth as today, not on context).
- Macro/program data model unchanged (`client_programs` / `day_modules` / `direct_calendar_sessions`); no migration unless the create-program client-scoped entry genuinely needs one (flag if so).

## Verify
- `npx tsc --noEmit` + `npm run build` clean.
- Workouts tab leads with the week calendar; each day's "+" opens Blank / Saved / Assign program / Create program; **Assign program and Create program both stay on the client page** (dialog / sheet / scoped builder — no jump to `/coach/programs`). Program history strip lists current + past programs with View + Duplicate.
- Scheduled sessions (ad-hoc + program) appear on the correct days; drag-to-move works; mobile shows the day-list.
- Smoke via the coach test session (the +online client has the Summer Cut nutrition phase but no program yet — good for testing Create/Assign from empty; seed a program if needed to see the populated calendar + history).
