# B5 — Coach Client-Overview Calendar (week/month, view-only, status + recap)

**Status:** Build handoff (2026-06-30, Cowork). **Owner:** terminal. Cowork verifies on prod/preview.
**Pure frontend — no migration, no RPC, no DB writes. Safe to build during the Supabase outage** (only live-verify waits for the DB). `board_v2`-aware via the existing canonical adapter; flag-off falls back to the legacy hooks. Read-only.

## What B5 is (and isn't)
- **Is:** the **coach-facing** week/month calendar of a single client's training schedule, inside **Client Overview → Workouts → Calendar sub-tab**. Per `docs/COACH_CLIENT_REDESIGN.md`: *"B5 — Calendar. Week/month view-only with status + recap."*
- **Today it's a placeholder:** `src/components/client-overview/tabs/WorkoutsTab.tsx:304–329` — the `calendar` `TabsContent` renders an empty card: *"The week / month schedule view lands in B5."* The "inject one-off session" button above it stays.
- **Isn't:** the client's own calendar. That already exists and is canonical-aware: `src/pages/client/WorkoutCalendar.tsx` (499 lines, week/month toggle, deload-aware, `loadCanonicalSchedule` + `useClientWorkoutsMonth/Week`). **Do not rebuild or refactor the client page** — B5 is the staff read-only sibling.
- **Isn't:** an editor. Coaches edit schedules in Programs / the planning board, not here. No drag, no add (except the existing inject-session button which already lives above the placeholder).

## The data layer is already client-scoped (the key fact)
- `useClientWorkoutsWeek(userId, weekAnchor)` and `useClientWorkoutsMonth(userId, monthAnchor)` (`src/hooks/useClientWorkouts.ts:66, 264`) **take a `userId` param** and query `client_day_modules` joined through `client_programs.user_id = userId`. A coach passes `context.clientUserId`. **Coach RLS already allows reading an assigned client's `client_day_modules`** (legacy) and canonical logs (the Slice-2 coach-select policy `20260630061546` on `exercise_set_logs`). So no new access work.
- Canonical path: `resolveActiveAssignment(clientUserId)` → `loadCanonicalSchedule(assignmentId)` (`src/lib/canonicalScheduleAdapter.ts`) returns `CanonicalSchedule` (date → sessions, deload-aware). Same primitives the client calendar uses under `board_v2`.

## Build — a new read-only component, not an extraction
Mirror the client calendar's **grid + status derivation**, but as a **new** `src/components/client-overview/workouts/ClientScheduleCalendar.tsx` taking `{ clientUserId: string }`. Rationale: read-only + simpler (no `TakeDeloadCard`, no logging nav, no "take a deload") and **keeps the shipped client calendar untouched** (lower risk than extracting a shared grid). If grid duplication later bites, extract a shared presentational grid in a follow-up — not now.

### Data resolution (mirror `WorkoutCalendar.tsx`'s dual path)
```
if (isBoardV2Enabled()) {
  assignment = await resolveActiveAssignment(clientUserId)
  if (assignment) schedule = await loadCanonicalSchedule(assignment.id)   // canonical days
}
// flag-off OR no assignment OR null schedule → legacy:
weekData  = useClientWorkoutsWeek(clientUserId, weekAnchor)
monthData = useClientWorkoutsMonth(clientUserId, monthAnchor)
```
Normalize both shapes into one internal `DayCell[]` ( `{ date, sessions: { id, title, type, status, exerciseCount, isDeload }[] }` ) so the render is source-agnostic. The client page already does this normalization — copy its mapping (canonical `CanonicalScheduleDay.modules` → cells; legacy rows grouped by `client_program_days.date`).

### Status per session (done / missed / upcoming)
- **done:** canonical → the session's date has ≥1 `exercise_set_logs` for this assignment (or reuse `canonicalLastWorkoutAt` / a per-date log lookup); legacy → `client_day_modules.status === 'completed'` or `completed_at != null`.
- **missed:** `date < today` (client tz) AND not done.
- **upcoming:** `date >= today` AND not done.
- Reuse the client calendar's existing status logic + `deriveModuleBrief` for exercise counts. A deload session shows the ❄ Recovery treatment (same Snowflake icon already imported in the client page).

### Render
- **Week / Month toggle** + prev/next nav (copy the client page's `date-fns` week/month scaffolding, `weekStartsOn: 1`). Mobile = the same responsive treatment the client page uses (`useIsMobile`).
- Each day cell: date, session chips colored by status (done=emerald/check, missed=muted/destructive, upcoming=neutral), deload chip distinct. `isToday` highlight.
- **Recap strip** (the "+ recap" in the spec): for the visible week (and a month summary in month view) show `X / Y sessions completed`, e.g. `3 / 4 done this week` — count done vs scheduled across the visible range.
- **View-only interaction:** clicking a **past** session opens the **existing** read-only session-log viewer that WorkoutsTab already mounts (the Programs drill-down → session log). Reuse that component/handler rather than building a new viewer; upcoming sessions are static (no-op or a tooltip). If wiring into the existing viewer is non-trivial, a session chip may instead deep-link to the Programs sub-tab drill-down — flag which you chose.
- Empty states: no active program → "No active program for this client" (not a raw empty grid); search/empty handled per the CLAUDE.md empty-state rule.

### Wire-in
Replace the placeholder card in `WorkoutsTab.tsx`'s `calendar` `TabsContent` (lines ~322–328) with `<ClientScheduleCalendar clientUserId={context.clientUserId} />`. Keep the inject-one-off-session button above it. The `context` is `ClientOverviewTabProps` — `clientUserId` is already there; **do not refetch identity** (CLAUDE.md Client Overview contract).

## Guardrails
- Read-only. No writes, no RLS changes, no migration.
- `board_v2`-aware: canonical when flag on + assignment exists, legacy hooks otherwise (so it works today with the flag OFF, reading legacy `client_day_modules` — which is how you can live-verify before the flip).
- Don't touch `src/pages/client/WorkoutCalendar.tsx`.
- Don't refetch profile/subscription/role in the component — consume `context`.
- Reuse `deriveModuleBrief`, `canonicalSessionTitle`, the Snowflake/deload treatment, and the existing session-log viewer. No duplicate pickers/viewers.
- `useIsMobile` branch for the grid density on mobile; respect the `pb-24` rule if it adds any standalone scroll area.
- `tsc -p tsconfig.app.json` (308 baseline, zero new) + build clean; CI green.

## Verify (Cowork)
- **Offline now:** code review — dual-path resolution, status derivation correctness (esp. missed vs upcoming boundary uses the client tz), no identity refetch, flag-off reads legacy.
- **Live (flag OFF, works today):** as a coach, open a client with a legacy active program → Client Overview → Workouts → Calendar: week/month grid renders that client's real sessions with correct done/missed/upcoming status + recap count; past session click opens the read-only log viewer; no console/RLS errors.
- **Live (board_v2 ON, post-flip):** same client reads the canonical schedule (deload weeks show Recovery), recap matches.
- Mobile layout sane; empty-program client shows the empty state, not a blank grid.

## Why this is safe to do during the outage
It's frontend-only, reuses already-shipped, already-RLS'd, already-userId-parameterized data hooks + the canonical adapter. Nothing here applies a migration or writes data. It even works with `board_v2` OFF (legacy read), so it's independently verifiable the moment the DB is back — it does **not** depend on the flip.
