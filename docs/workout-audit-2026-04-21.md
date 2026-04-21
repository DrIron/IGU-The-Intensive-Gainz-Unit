# Workout Audit — 2026-04-21

Full-surface QA pass of every workout-related page across admin, coach, and client roles on **production** (theigu.com). No fixes applied during this pass — everything is triaged below.

**Driver:** Logged in as coach (Head Coach / Senior, 6 active clients). Admin and client accounts not driven live — findings for those roles come from code review + what's visible cross-role from the coach session. Live driving was limited by Radix dropdown/popover components not responding to synthetic events in Playwright; where a flow depended on a menu/dropdown, I noted the finding from code review instead.

## Legend

| Severity | Meaning |
|---|---|
| **Critical** | Data loss, security boundary violation, role-inappropriate access. |
| **High** | Flow-breaking UX (can't complete a primary task), silent failures, broken empty states on happy-path surfaces. |
| **Medium** | Visible rough edge, inconsistent state, confusing copy, missing expected feature. |
| **Low** | Polish: truncation, spacing, minor i18n gap, verbose copy. |
| **Missing** | Feature gap the audit surfaces (coach/client expected it, not a bug). |

---

## Executive summary

**Top 5 findings to triage first:**

1. **[High] Empty-state CTA buttons render as 32×40 empty red boxes on all three Programs-hub tabs.** Coaches can't get past the initial empty state without using the page-header "+ Create" button — the in-card CTA is visually a blob. One-line fix, 3 call sites.
2. **[Medium] Planning Board session headers + muscle slot labels still truncate severely** in the 140px day columns. Short labels like "Strength" become "Stre..." and "Pecs" becomes "P...". Limits scannability of any plan with more than one session per day.
3. **[Medium] Coach's My Clients list is not row-clickable** — coaches must open a 3-dot kebab to drill into a client instead of clicking the client's name/row. Major daily-workflow friction.
4. **[Medium] Coach Exercise Library has no detail view** — coach can see 340 exercise cards with tags, but clicking a card does nothing. No setup/execution cues, no video preview, no equipment details. The rich `movement_patterns` data is invisible at this surface.
5. **[Low/Observation] Google Fonts requests fail on production (ERR_FAILED)** — typography degrades to system fonts silently. Could be CSP / extension / ad-blocker, but needs verification on a fresh browser.

**What works well:**

- Planning Board → Create Program dialog preview is clear, unambiguous, and accurately counts sessions + items + unfilled slots.
- Programs hub tab model (Macrocycles / Mesocycles / Drafts) reads cleanly once populated; empty-state visuals aside.
- Coach dashboard: "Needs Your Attention" banner + stat cards + Today's Tasks layer is informative without being busy.
- Coach Exercise Library search + filter + tag UI is fast (340 cards + real-time filter, no scroll jank).
- Auto-save badge on Planning Board reliably shows "Unsaved changes" ↔ "Up to date".

**What's missing:**

- No coach-side read-only session viewer — can't review what a specific client logged for a specific module. (My PR `feat/client-overview-workouts` introduces one; not merged.)
- No adherence heatmap / timeline for a client over weeks.
- No PR / progression chart per exercise.
- No volume-per-muscle trend across weeks.
- No coach preview of a client's distraction-free session runner.

---

## Findings — by role

### Coach

#### [High] Empty-state CTA buttons render as 32×40 empty red boxes on all 3 Programs-hub tabs
**Surface:** `/coach/programs` → any of (Macrocycles / Mesocycles / Drafts) when no items exist.
**What you see:** The "Create Program" / "New Macrocycle" / "New Plan" CTA under the "No programs yet" empty state is a tiny red button with no label and no icon.
**Root cause:** `src/components/ui/empty-state.tsx:14-17` types `action` as `{ label: string; onClick: () => void }` — an object. But three call sites pass a `<Button>` JSX element instead:
- `src/components/coach/programs/ProgramLibrary.tsx:559–565` (Mesocycles tab)
- `src/components/coach/programs/macrocycles/MacrocycleLibrary.tsx:123–130` (Macrocycles tab)
- `src/components/coach/programs/muscle-builder/MusclePlanLibrary.tsx:213–220` (Drafts tab)
When the prop is a ReactNode instead of `{label, onClick}`, the component still enters the render branch at line 100 and renders `<Button onClick={action.onClick}>{action.label}</Button>` — both undefined → silently empty button.
**Fix:** Change the three call sites to pass `action={{ label: "Create Program", onClick: onCreateProgram }}` per the contract. (Alternative: widen EmptyState to accept ReactNode — riskier, other call sites in the app expect the object shape.)
**Screenshots:** `.playwright-mcp/audit-01-coach-programs-hub.png`, `audit-03-macrocycles-tab.png`, `audit-14-coach-dashboard.png`.

#### [Medium] Planning Board session header truncates to "Stre..." at 140px column width
**Surface:** `/coach/programs` → Drafts → open/new plan → any day column with a session.
**What you see:** Default session name "Strength" renders as "Stre..." with ellipsis because the column is ~140px at `lg:grid-cols-7` and the dot + kebab + padding leaves ~50px for the label.
**History:** Previously "STR..." (worse). Apr 20 fix (`SessionBlock.tsx` — dropped `uppercase tracking-wider`, reduced subcard padding to `px-1 py-1.5`) cut it to "Stre..." but still insufficient.
**Fix direction:** Auto-shorten the default `ACTIVITY_TYPE_LABELS` to a 4-char abbreviation when the session has no coach-provided name ("Str", "Cardio" fits, "HIIT" fits, "Yoga" fits, etc.). Coaches who care rename it (then the real name fits). Alt: drop the kebab+dot chrome more aggressively in narrow breakpoints; or wrap to two lines.
**Repro:** Screenshot `.playwright-mcp/audit-06-ppl-loaded.png`.

#### [Medium] Muscle slot labels in Planning Board still truncate heavily inside session subcards
**Surface:** Same as above. Inside a session block, muscle slot rows show labels like `P...`, `D...`, `Q...`, `C...` — single-letter truncation.
**Why:** Session subcard (`SessionBlock.tsx`) adds `px-1` + the slot card (`MuscleSlotCard.tsx`) has its own internal padding for the dot + sets badge, leaving ~40px for the label. `getShortMuscleLabel("pecs")` returns "Pecs" (4 chars) which should fit but doesn't.
**Fix direction:** Switch slot card layout to two lines on narrow columns (label above the 4×8-12 badge), or move the sets/reps badge to a sibling row, or tighten the dot + badge widths.
**Impact:** Moderate — coaches cannot read which muscle they placed without hovering / opening the popover.

#### [Medium] Coach's My Clients list is not row-clickable
**Surface:** `/coach/clients` → Active Clients list.
**What you see:** Each client row shows name + service badge + a 3-dot kebab at right. Clicking the row body does nothing. The only way to open a client is the kebab menu.
**Why it matters:** Clicking a list row to open its detail is a universal UX pattern. Forcing a kebab click adds one extra step to the highest-frequency coach action (visiting a client).
**Fix direction:** Wrap the row in `ClickableCard` (the project primitive — `src/components/ui/clickable-card.tsx`) with `ariaLabel` and an onClick that mirrors the kebab's "View" action. Preserve the kebab for the other menu items.
**Screenshot:** `.playwright-mcp/audit-15-clients-full.png`.
**Note:** My PR `feat/client-overview-workouts` + the shell PR #72/#73 land a new `/coach/clients/:id` shell — expect this to re-surface when the row does start linking somewhere.

#### [Medium] Coach Exercise Library shows rich cards but has no drill-down
**Surface:** `/coach/exercises` ("Exercise Library", 340 exercises shown).
**What you see:** Each card shows name + tags (muscle / equipment / category) + "Also targets:" secondary muscles. Clicking a card does nothing.
**What's missing:** No way for a coach to see the exercise's YouTube video, setup_instructions, execution_points/execution_text (the movement_patterns taxonomy seeded Apr 9), equipment notes, machine brand, resistance profile. All that data exists in `exercise_library` + `movement_patterns` but it's invisible at this surface.
**Fix direction:** Add a detail Sheet/Dialog on card click: header with video + name + primary muscle, body with setup bullet list, execution bullet list, equipment + resistance profile tags, "used in N of your programs" counter.
**Impact:** Coaches can't vet the library without opening the Planning Board ExercisePickerDialog (a different surface) for every lookup.

#### [Low] Duplicate "Programs" heading on /coach/programs
**Surface:** `/coach/programs` top of page.
**What you see:** "Programs / Your coaching programs" (layout chrome) immediately above "Programs / Build, chain, and assign your training programs" (hub header, `CoachProgramsPage.tsx:111`).
**Fix direction:** Drop the inner "Programs" heading — the outer layout already titles the page. Or rename one to something more specific.

#### [Low] Plan title input visibly truncates mid-word in Planning Board header
**Surface:** `/coach/programs` Planning Board → rename plan to a longer name ("AUDIT — 2026-04-21 — PPL W1") → header renders "AUDIT — 2026-04-21 — P" — just cut off, no ellipsis.
**Why:** The inline-editable `<Input>` in the Planning Board header is unconstrained in width but the parent column squashes it. The breadcrumb below shows the full name fine.
**Fix direction:** Add `w-full min-w-0` on the input wrapper so it flexes inside the header row.

#### [Low] "Sessions" label in sidebar is ambiguous
**Surface:** Coach sidebar item "Sessions" → `/coach/sessions`.
**Why:** "Sessions" now refers to both (a) the time-slot booking page (this route) AND (b) the Day > Session > Activity layer on Planning Board. Reading "Sessions" in the sidebar, a coach can't tell whether it's the booking page or a sessions-inside-programs view.
**Fix direction:** Rename sidebar to "Bookings" or "Time Slots". Reserve "Sessions" for the program-structure meaning.

#### [Low] "0 Programs Created" stat on coach dashboard may be stale/wrong
**Surface:** `/coach/dashboard` → top stat cards.
**What you see:** Current coach (Head Coach, 6 active clients, 137 KWD/month compensation) shows "0 Programs Created" despite having at least one Planning Board draft ("Beginner Series P/P/U..." in Drafts tab).
**Why:** Unclear if "Programs Created" counts only converted `program_templates` and not `muscle_program_templates`, or only programs with at least one assignment, or there's a stale-query issue. Needs source trace to confirm which counter is authoritative.
**Fix direction:** Trace `CoachDashboardOverview.fetchDashboardMetrics` to pin down what the counter is supposed to represent, label it more clearly ("Program templates" / "Drafts" / "Active assignments").

#### [Low] "0 Workouts This Week" on coach dashboard with 6 active clients
**Surface:** Same as above.
**What it suggests:** Either (a) none of the 6 clients have logged a workout this week (plausible), or (b) the query is narrower than it should be (e.g. only counts programs the coach authored, not team-assigned plays). Given nutrition check-in activity shows a logged weight 7h ago, the data pipeline reaches the dashboard — but workouts feel sparse.
**Fix direction:** Verify the SQL path for this counter in `CoachDashboardOverview.fetchDashboardMetrics` against the CLAUDE.md rule "never nested FK joins on client_programs" — swap to 3-query pattern if still nested.

#### [Low] Google Fonts fail to load on production (ERR_FAILED)
**Surface:** Any page — observed in Chrome DevTools console on `/coach/programs`, `/coach/sessions`, `/coach/clients`, `/coach/dashboard`.
**Error:** `Failed to load resource: net::ERR_FAILED @ https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:…&family=JetBrains+Mono:…`
**Impact:** Typography falls back to system fonts. Design-system monospace numerics (font-mono) and display font (font-display) degrade silently.
**Fix direction:** Verify CSP `font-src` + `style-src` allow `fonts.googleapis.com` + `fonts.gstatic.com`. Check on a fresh Chrome profile without extensions to rule out ad-blocker. Also verify the `media="print" onload` non-blocking pattern isn't conflicting with Vercel's Content Security Policy headers.

#### [Observation] Create Program dialog preview (good, keep)
**Surface:** `/coach/programs` → Drafts → open a plan → "Create Program" button.
**What's there:** Header "N training days/week, N sessions", per-day cards grouped Mon/Tue/..., each session shown with its items (`Pecs → auto-fill 4s`), amber "N slots without exercises" warning with clear explanation, footer note: "Each session becomes a day module. Strength slots become exercises inside the module; non-strength sessions keep their coach-defined name as the module title." Clear mental model for the coach. Keep.
**Screenshot:** `.playwright-mcp/audit-09-convert-dialog.png`.

---

### Client

Not driven live — findings from code review of files under `src/pages/client/`, `src/components/client/`, `src/App.tsx`, and the `docs/CLIENT_OVERVIEW_HANDOFF.md` map I've been working against.

#### [Medium / Missing] Workout Calendar doesn't show macrocycle / mesocycle context
**Surface:** `/client/workout/calendar` (`src/pages/client/WorkoutCalendar.tsx`).
**What's there today:** Monthly grid, per-day modules from `client_day_modules`. Day cells show module titles + status.
**What's missing:** No visual grouping showing which mesocycle (program) or macrocycle the day belongs to. A client on a macrocycle with 3 mesocycles (Hypertrophy A → Strength Peak → Deload) sees an undifferentiated month — they can't tell "I'm in week 2 of the strength peak block".
**Fix direction:** Add a sticky banner at top of the calendar naming the active program + optional macrocycle, with a "Week X of Y" counter. The schema supports it: `client_programs.macrocycle_id` is populated by the assign_macrocycle RPC.

#### [Medium] Direct Calendar Sessions not visually distinguished from program-scheduled sessions
**Surface:** `/client/workout/calendar`.
**What's there:** Program-scheduled modules render from `client_day_modules`. Ad-hoc `direct_calendar_sessions` are added by the coach outside of any program — per CLAUDE.md.
**Finding:** The calendar's day cell doesn't visually distinguish between the two. An ad-hoc session looks identical to a scheduled one — but may have different expectations (one-off, not part of a weekly pattern).
**Fix direction:** Small badge or border-dashed treatment on direct-calendar sessions. Or a grouping label in the day's detail drawer: "Scheduled" vs. "Coach-injected".

#### [Medium] No progress chart / PR timeline for the client
**Surface:** `/client/workout/history` (`src/pages/client/ExerciseHistory.tsx`).
**What's there:** Exercise picker dropdown + table of logs (date, set, weight, reps, RIR, RPE, notes).
**What's missing:** No chart showing weight progression per exercise over weeks. No PR call-outs. No volume-per-muscle-group trend.
**Impact:** Clients can't see their own progress without scrolling a table. Demotivating for long-term adherence.
**Fix direction:** Add a small sparkline / line chart above the table for the selected exercise. Or a separate "Progress" tab. Reuse `VolumeChart` / `ProgressionLog` shapes from coach side with client-scoped query.

#### [Low / Observation] WorkoutSessionV2 distraction-free mode (good, keep)
**Surface:** `/client/workout/session/:moduleId`.
**What's there:** `App.tsx:111-112` auto-hides `ClientMobileNavGlobal` on this path. Confirmed in docs/history.md.
**Observation:** Correct pattern. Don't break this when adding new bottom-nav logic.

#### [Low / Observation] Client dashboard surfaces next workout via TodaysWorkoutHero (good, keep)
**Surface:** `/dashboard` → `NewClientOverview` → `TodaysWorkoutHero`.
**What's there:** Hero banner with Next Workout, quick "Start" action → `/client/workout/session/:id`.
**Observation:** Core happy-path, well-placed. Verify live once client login available.

#### [Missing] No in-app push notification / session reminder
**Surface:** Client experience overall.
**What's there:** Email-based cron jobs (renewal reminders, payment drips, inactivity) but no session-start / next-workout push.
**Impact:** A client with a Monday workout scheduled has no in-app reminder. The reminder channels are limited to the dashboard TodaysWorkoutHero.
**Fix direction:** Add a lightweight notification center (per cron-driven `email_notifications` model) or web push for "Workout ready in X hours". Out of scope for a near-term fix.

#### [Missing / Observation] No offline logging or retry queue
**Surface:** `/client/workout/session/:moduleId` — per-set logging.
**What's there:** Synchronous POST to `exercise_set_logs`. No optimistic update. No IndexedDB cache.
**Impact:** A client in a gym with spotty connection can lose a set log if the network drops mid-save. Toast shows error; data is gone.
**Fix direction:** Add a React Query mutation with optimistic update + retry queue in the session runner. Not a near-term fix but worth scoping.

---

### Admin

Not driven live — coach session redirected away from `/admin/*` routes. Findings from code review (see `docs/CLAUDE.md` + data-model exploration earlier in conversation).

#### [Observation] Admin surfaces workout-related:
- `/admin/exercises` → `ExerciseLibraryManager`, `MovementPatternEditor`, `BulletPointEditor`, `ExerciseCatalogView` — full CRUD on both `exercise_library` and legacy `exercises`.
- `/admin/workout-builder-qa` → RLS seed + smoke rig.
- Admin can see any coach's programs + any client's workouts (RLS override via `is_admin(uid)`).

#### [Low / Observation] Two exercise tables still visible to admin
Per CLAUDE.md, `ExerciseLibraryManager` queries both `exercises` (legacy, mostly empty) and `exercise_library` (107+ seeded, plus coach-added custom). Admin-side list could use a "legacy" tag or filter to avoid confusion.

#### [Medium / Missing] Admin has no platform-wide workout metrics
No dashboard card for "Platform-wide workouts this week", "Top 10 most-assigned programs", "Exercises never used". Useful for capacity planning but absent. Out of scope for this pass.

---

### Cross-role / RLS

#### [Observation] Client routes correctly redirect when accessed by coach role
**Surface:** Coach session visiting `/workout-library` or `/educational-videos` silently redirects to `/coach/dashboard`.
**Why:** Both routes are client-only per `src/lib/routeConfig.ts` + `RoleProtectedRoute`.
**Finding:** Redirect is silent — no toast / message explaining the redirect. A coach clicking a link from an email or note-sharing might not realize the redirect happened.
**Fix direction:** Show a one-line toast when `RoleProtectedRoute` rejects: "That page is for clients — redirected you to your dashboard." Low severity but explains the UX.

#### [To verify — requires client login] Client cannot access other clients' workouts
**What to test:** Log in as client A, visit `/client/workout/session/<clientB's moduleId>`. Expected: 404 / friendly error (RLS empties the query, no crash). Must verify live before merging.

#### [To verify — requires two coach accounts] Coach cannot see another coach's `client_programs`
**What to test:** Log in as coach A, visit a URL containing coach B's client_program_id. Expected: empty query, not a leak.

---

### Data model / performance

#### [Observation / Code review] `convert_muscle_plan_to_program_v2` RPC (Apr 19, now deployed)
- One `day_modules` row per session (not per slot).
- Returns `session_to_module` map so the client can insert `module_exercises` under the right module.
- Non-strength sessions collapse to a module-only row with `title = session name`.
- Verified at migration file `20260419100000_convert_rpc_v2_sessions.sql`. Schema looks right, safe behavior.

#### [Observation / Code review] `assign_macrocycle_to_client` RPC (Apr 21, now deployed)
- Loops ordered mesocycles, calls `assign_program_to_client` per mesocycle with cumulative-week staggered start_dates.
- `assign_program_to_client` extended to accept optional `p_macrocycle_id` (now 7-arg signature). Old 6-arg dropped in same migration.
- Atomic via SECURITY DEFINER function — if one child fails, the whole thing rolls back.
- Verified at migration files `20260421100000_add_macrocycles.sql` + `20260421110000_atomic_macrocycle_reorder.sql`.

#### [Medium / Code review] Volume / adherence hooks may trigger N+1 patterns for coaches with many clients
**Surface:** `src/hooks/useVolumeTracking.ts`, `src/hooks/useExerciseHistory.ts`.
**Why:** Coach dashboards aggregate across clients. Per CLAUDE.md Apr 12 note: the dashboard streamlining fix explicitly parallelised `calculate_subscription_payout` loops via `Promise.all`. Need a similar trace for volume/adherence hooks to confirm they're not per-client sequential.
**Fix direction:** Audit each hook for sequential awaits over an array — wrap in `Promise.all`.

#### [Observation / CLAUDE.md rule] "Never nested PostgREST FK joins on client_programs"
Several client-side hooks need reverification:
- `OverviewTab.tsx` (in shell, not live yet) already follows the 3-query pattern — good reference.
- My `useClientWorkouts.ts` (in `feat/client-overview-workouts`) follows the 3-query pattern — good reference.
- `CoachDashboardOverview.fetchDashboardMetrics` — already refactored to 3 separate queries, per CLAUDE.md.
- `WorkoutCalendar.tsx` — still uses nested `client_program_days → client_day_modules` query shape. Safe only if that specific join is exempt from the reliability issue; worth verifying.

---

## Test artifacts created during this audit

| Kind | Name | DB table | Purpose |
|---|---|---|---|
| Muscle plan draft | `AUDIT — 2026-04-21 — PPL W1` (renamed from "Untitled Muscle Plan" then abandoned without save) | `muscle_program_templates` (may or may not have persisted — auto-save fires at 2s intervals) | End-to-end driver thread |

No programs / client_programs / macrocycles created. The "Create Program" dialog was opened and then cancelled to avoid polluting the production DB.

**Cleanup SQL** (run if anything did persist):

```sql
-- Run after audit accepted. Deletes ONLY artifacts labelled with the audit stamp.
delete from macrocycles where name like 'AUDIT — 2026-04-21%';
delete from program_templates where title like 'AUDIT — 2026-04-21%';
delete from muscle_program_templates where name like 'AUDIT — 2026-04-21%';
-- client_programs tied to those templates cascade via FK.
```

---

## Follow-ups not attempted in this pass

- End-to-end log-a-workout as a client (requires client login + approval).
- Admin-surface live verification (requires admin session).
- Mobile breakpoint pass across all surfaces.
- i18n audit (Arabic) for workout strings.
- Performance: network panel N+1 check for each surface.
- Data-model orphan checks via direct SQL (e.g. `program_templates` without any `program_template_days`).

The scripted test plan in `/Users/HasDash/.claude/plans/steady-hopping-floyd.md` Appendix A lists the concrete artifacts I'd create on a second-pass with full credentials; that plan remains valid for a follow-up run.
