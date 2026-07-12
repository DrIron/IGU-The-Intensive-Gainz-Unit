# CT2 — Client program detail page (overview → structure → start)

**Status:** Build handoff (2026-07-07, Cowork). **Owner:** terminal CC. Cowork verifies on prod.
**Board:** CT2 (Content, P1). Net-new client-facing page. Frontend-only, no schema change (reads canonical `plan_*` via the existing adapter).

## The gap
A 1:1 client can see **today's workout** (`TodaysWorkoutHero`) and a **calendar of dates** (`WorkoutCalendar`, `/client/workout/calendar`), but there is **no view of the whole program structure** — the weeks, the sessions in each week, and what each session is. CT2 = a read-only **program overview**: plan name + progress → week-by-week list of sessions → tap-to-start. It's the "what's my program?" page, distinct from the calendar's "what day is it?".

## Route + entry
- New route `src/pages/client/ClientProgramDetail.tsx`, path **`/client/program/detail`** (optional `?assignment=<id>`; default to the active one). Wrap `<AuthGuard><OnboardingGuard>…` like the other client routes. Add to `routeConfig.ts` as `client-program-detail` (`showInNav: false` — do NOT add a dock item; the client dock is at its 5-tab max per CC4). Add its prefix to the client mobile-nav list in `App.tsx` so the dock stays visible on it. Use `ClientPageLayout` (pb-24).
- **Entry point:** add a "Program" / "View full program" button in the `WorkoutCalendar` header (next to the Schedule/History tabs) → `navigate('/client/program/detail')`. (Also fine to add a small link on `TodaysWorkoutHero`, optional.)

## Data (reuse the adapter — no new queries beyond what exists)
- `resolveActiveAssignment(userId)` (`src/lib/canonicalScheduleAdapter.ts`) → `{ id, plan_id, start_date }` | null. No assignment → empty state ("Your coach hasn't assigned a program yet").
- `loadCanonicalSchedule(assignmentId)` → `CanonicalSchedule { startDate, totalWeeks, weeks[{runningIndex,isDeload}], byDate: Map<iso, {runningIndex, isDeload, modules: CanonicalScheduleModule[]}> }`.
- `canonicalDrilldownDays(schedule)` → per-week/day modules (coach-side but context-neutral — reuse it) to group sessions by running week.
- `CanonicalScheduleModule` gives per session: `id` (= plan_session_id, the Start target), `title`, `module_type`, `status` (""/"completed"), `exerciseCount`, `muscles[]`, `isDeload`. Also grab the **plan name** for the header (`plan.name` via the assignment's plan_id).

## Render
Layout is a **vertical list of week sections** (NOT a 7-col date grid — the calendar already does dates; CT2 shows structure):
1. **Overview header:** plan name + "Week X of Y" (X = current running week from today's date vs `startDate`; Y = `totalWeeks`) + a progress line "N of M sessions completed" (count `status==='completed'` across all sessions). Optional goal/macrocycle label if available.
2. **Week sections** (`W1 … Wn`, in running order): each a labeled section; deload weeks get a "❄ Recovery" badge (match the calendar's Snowflake treatment). The current week is highlighted (emerald rail / marker, same vocabulary as the calendar).
3. **Session cards** under each week (reuse the `SessionBrief` card pattern from `WorkoutCalendar.tsx` — title via `canonicalSessionTitle(module)`, `module_type`, `exerciseCount`, up to 4 `muscles`, a status pill done/upcoming). Rest days render a muted "Rest" row.
4. **Start button per session** → `navigate(`/client/workout/session/canonical?assignment=${assignmentId}&session=${module.id}&date=${iso}`)` (the locked canonical URL; all 3 params required — assignment id, plan_session_id, the date key from `byDate`). Completed sessions can show "Review" (same link; the player shows logged history) instead of "Start".

### Optional (mark phase-2, don't block on it)
- **Tap-to-expand a session → its exercise list.** `loadCanonicalSchedule` gives `exerciseCount`+`muscles` but not exercise names; expanding would lazily load that session's `plan_slots` → `exercise_library` names (same read the session player does). Ship CT2 with count+muscles first; the exercise-name expand can be a follow-up.

## Reuse / don't
- **Reuse:** `loadCanonicalSchedule` / `canonicalDrilldownDays` / `canonicalSessionTitle`, the `SessionBrief` card + `StatusFor` helper from `WorkoutCalendar.tsx`, `Skeleton`/error UI from the calendar, the deload Snowflake treatment.
- **Don't reuse:** the coach `ClientProgramDrilldown` DayCell/ModuleChip (they take coach `DrilldownDay/Module` shapes, not the client canonical types) — mirror the pattern with the canonical types instead. Don't render `SessionLogViewer` (that's completed-log view, not program definition).

## Verify (Cowork, prod, +online 1:1 client with an active assignment)
- `/client/program/detail` shows: plan name + "Week X of Y" + "N of M sessions" progress; week sections W1..Wn in order with the current week marked and deload weeks badged; each week lists its sessions (title / type / exercise count / muscles / status); rest days muted.
- A session's **Start** opens the canonical session player at the right assignment+session+date (logs work from there); a completed session opens its history.
- Entry button in the WorkoutCalendar header navigates here; back returns cleanly.
- Empty state when the client has no active assignment.
- Mobile: week sections stack, cards reflow, no overflow behind the dock (pb-24); dock stays visible (prefix added).
- tsc (~306 baseline zero-new), ESLint 0, build clean.
