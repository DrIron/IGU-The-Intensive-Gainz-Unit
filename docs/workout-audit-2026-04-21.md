# Workout Audit — 2026-04-21

Full-surface QA pass of every workout-related page across admin, coach, and client roles on **production** (theigu.com). Driven live through all three roles using user-supplied accounts (admin pass partially — admin login not reached in time).

## Legend

| Severity | Meaning |
|---|---|
| **Critical** | Data loss, security boundary violation, role-inappropriate access, launch-blocking. |
| **High** | Flow-breaking UX (can't complete a primary task), silent failures, broken empty states on happy-path surfaces. |
| **Medium** | Visible rough edge, inconsistent state, confusing copy, missing expected feature. |
| **Low** | Polish: truncation, spacing, minor i18n gap, verbose copy. |
| **Missing** | Feature gap the audit surfaces (coach/client expected it, not a bug). |

---

## Executive summary

**Critical — fix before touching anything else:**

1. **Client workout set logs do NOT persist.** Live-verified on prod: client logs 2 sets (weights + reps + RIR visible, green checks, rest timer fires, progress bar moves from 0/11 → 2/11), clicks Save (shows "Progress saved" toast), navigates to History → "No exercise history yet". Reopen session → 0/11 sets, all inputs empty. `exercise_set_logs` is not receiving the inserts. Root cause: `saveProgress` in `src/pages/client/WorkoutSessionV2.tsx:1340-1344` calls `.upsert(...)` **without destructuring `{ error }`** — per CLAUDE.md the silent-RLS-failure-on-200 pattern. Actual cause of the failure still unknown (likely RLS misfire or the `onConflict` hitting the `UPDATE` policy which has only `USING` / no `WITH CHECK`), but the surface bug is identical to what CLAUDE.md specifically warns about. **Launch-blocking.**

**High:**

2. **Session-runner UI implies per-set save but nothing writes until Save button.** Clicking a set's check → green, rest timer, progress counter all update — but the DB write only happens on explicit top-bar "Save" click or on "Complete Workout". Closing the tab / navigating away loses everything. This is a separate UX defect on top of the save-actually-failing bug: even if the upsert worked, the pattern invites data loss. `WorkoutSessionV2.tsx:1311` — `saveProgress` is the only writer, invoked from line 1456 (Save button) and 1368 (completeWorkout). Per-set checks do not auto-save.

3. **Session runner queries dead table `programs`.** Console on `/client/workout/session/:id` shows `GET /rest/v1/programs?select=name&id=eq.<uuid>` returning **404 (table doesn't exist)**. Header shows generic "by Coach" placeholder instead of the actual program title. Likely a stale query referencing the old table name — current table is `program_templates`. Needs a file grep.

4. **Client day label uses template weekday ordinals, not the actual scheduled weekday.** Program assigned with `start_date = Tuesday April 21` (today), `day_index = 1` → dashboard + calendar show "Mon — Strength". Template was built in Planning Board as Mon/Wed/Fri; the `day_title` baked in at conversion time doesn't re-compute to the actual Tue/Thu/Sat that day_index now maps to relative to start_date. Confusing for the client.

5. **Empty-state CTA buttons render as 32×40 empty red boxes on all 3 Programs-hub tabs.** `EmptyState` contract expects `{ label, onClick }`; `ProgramLibrary.tsx:559`, `MacrocycleLibrary.tsx:123`, `MusclePlanLibrary.tsx:213` pass a `<Button>` JSX element. Three-line fix.

6. **No bulk "Publish modules" action.** After Convert, every module lands as `draft`. Per `assign_program_to_client` RPC: only `published` modules propagate to the client. A coach who forgets to publish individually has their program silently deliver zero sessions. No affordance on Programs Page / Calendar Builder to publish all at once. Live-verified: I converted a 6-day program; assigning with only Day 1 published resulted in the client seeing exactly 1 scheduled module and 5 empty weekdays.

**Medium:**

7. Planning Board session headers + muscle slot labels still truncate in 140px day columns ("Strength"→"Stre...", "Pecs"→"P..."). Apr 20 fix helped but is insufficient.
8. Coach's `My Clients` rows are not row-clickable — coaches must use the 3-dot kebab to drill into a client.
9. Coach Exercise Library has no detail drill-down — 340 cards with tags but no way to see setup/execution cues, video, or machine brand.
10. **"Edit in Planning Board"** action is missing from the fresh program's 3-dot menu, even though the program has a source muscle plan. Reverse-lookup on `muscle_program_templates.converted_program_id` likely fires after first paint and the menu renders before the data is hydrated.
11. Team Plan clients (Othman Al Hasan) not listed in `AssignFromLibraryDialog` picker. May be intentional (team assignments go through team flow), but the picker gives no signal that they're filtered out.
12. Assign dialog shows only `firstName` ("Hasan"), not `"Hasan Dashti"`. `profiles_public.last_name` is likely null on this record; code falls back gracefully but ambiguous for coaches with multiple same-first-name clients.

**Low/Polish:**

13. Duplicate "Programs" heading on `/coach/programs`.
14. Plan title input visibly truncates mid-word in Planning Board header ("AUDIT — 2026-04-21 — PPL W1" shows as "AUDIT — 2026-04-21 — P").
15. Google Fonts fail to load on prod (ERR_FAILED, repeatedly) — typography silently degrades.
16. Sentry envelope posts return 403 — error telemetry is broken, which means the critical set-log bug above hasn't been captured in Sentry.
17. `DialogContent` requires `DialogTitle` for a11y (Radix warning logged).
18. "Sessions" sidebar label ambiguous (time-slot booking vs. Day>Session>Activity).
19. Dashboard stat "0 Programs Created" / "0 Workouts This Week" — verify the counter query matches its label.
20. Rest timer countdown appears to start from <90s on set 2 (observed 1:16, then 0:32 on set 3 start). Consistency check needed.

**What works well:**

- Create Program dialog preview (counts + per-day breakdown + amber "unfilled slots" warning + footer explaining "each session becomes a day module").
- Planning Board → Convert → Program Calendar Builder flow is smooth; session editor right-sheet has good session type + preferred time + exercise list + rest timer layout.
- Auto-fill from the exercise library picked plausible exercises for each muscle.
- `assign_program_to_client` RPC correctly created the client-side hierarchy with the right start_date, and "Only published modules will be delivered" copy in the assign dialog is explicit.
- Client dashboard `TodaysWorkoutHero` correctly picked up the Day 1 module, with "3 exercises · ~20 min" summary and Start Workout CTA.
- Session runner distraction-free mode (no mobile dock) works on prod.

---

## Findings — by role

### Coach

#### [High] Empty-state CTA buttons broken on Programs hub
**Surface:** `/coach/programs` → any of (Macrocycles / Mesocycles / Drafts) when no items exist.
**Observation:** The "Create Program" / "New Macrocycle" / "New Plan" CTA under "No programs yet" is a 32×40 empty red blob.
**Root cause:** `src/components/ui/empty-state.tsx:14-17` types `action` as `{ label: string; onClick: () => void }`. Three call sites pass a `<Button>` JSX element instead:
- `src/components/coach/programs/ProgramLibrary.tsx:559–565`
- `src/components/coach/programs/macrocycles/MacrocycleLibrary.tsx:123–130`
- `src/components/coach/programs/muscle-builder/MusclePlanLibrary.tsx:213–220`
**Fix:** Change the three call sites to `action={{ label: "Create Program", onClick: onCreateProgram }}`.
**Screenshots:** `.playwright-mcp/audit-01-coach-programs-hub.png`, `audit-03-macrocycles-tab.png`.

#### [High] No bulk publish after conversion
**Surface:** `/coach/programs` → Drafts → Create Program → lands on ProgramCalendarBuilder.
**Observation:** All 6 days' modules show status `draft`. Each module must be opened individually and toggled to "Published" via the eye-icon toggle in the session editor sheet. There's no "Publish all" / "Publish week" action on the calendar or the session editor.
**Impact:** `assign_program_to_client` RPC only copies `published` modules to the client (verified by the "Only published modules will be delivered" copy in the assign dialog). A coach who forgets publishes zero modules → client sees no workouts.
**Verified:** I assigned with only Day 1 published. Client saw exactly 1 "Strength" module on the calendar.
**Fix direction:** Add a "Publish all modules" button on the program calendar header with a confirmation toast showing the count, or auto-publish on assignment with a confirmation dialog.

#### [Medium] "Edit in Planning Board" 3-dot action missing on fresh programs
**Surface:** `/coach/programs` → Mesocycles tab → newly-created program (from Convert) → 3-dot kebab.
**Observation:** Menu items: Edit, Duplicate, Assign to Client, Assign to Team, Add to macrocycle ›, Delete. **No "Edit in Planning Board"** entry even though the program does have a source muscle plan.
**Why:** `ProgramLibrary.tsx` reverse-lookups `muscle_program_templates.converted_program_id` on load to hydrate `source_muscle_plan_id`. For a just-created program, the lookup may race the render, or the menu is memoized before the value arrives. Or the convert RPC isn't setting `converted_program_id` on `muscle_program_templates` — worth checking migration file.
**Screenshot:** `.playwright-mcp/audit-26-kebab-opened.png`.

#### [Medium] Team Plan clients missing from AssignFromLibraryDialog
**Surface:** Mesocycles tab → 3-dot → "Assign to Client" → "Select Client" dropdown.
**Observation:** Shows 5 clients (Deema, Hasan, Mubarak, Reem, Wahab). Othman Al Hasan (Team Plan) is missing.
**Why:** `AssignFromLibraryDialog.loadClients` filters `subscriptions.coach_id = coachUserId AND status = 'active'`. Team-plan clients have `team_id` set, which may route them through a different `coach_id` relationship.
**Fix direction:** Either surface team-plan clients with a "via team" label, or add copy explaining that team-plan assignments go through the team flow.
**Screenshot:** `.playwright-mcp/audit-28-assign-hasan.png`.

#### [Medium] Assign dialog uses firstName only
**Surface:** Same assign dialog.
**Observation:** Picker shows "Hasan" — not "Hasan Dashti". `AssignFromLibraryDialog` builds label as `{firstName}{lastName ? ' ' + lastName : ''}`, but `profiles_public.last_name` is null for this record, so the concatenation falls back to just firstName.
**Fix direction:** Fall back to `profiles_public.display_name` or email prefix if `last_name` is null. Or require `last_name` on profile.

#### [Medium] Planning Board session header truncates to "Stre..." at 140px columns
**Surface:** `/coach/programs` → Drafts → open plan → any day column with a session.
**Observation:** Default "Strength" renders as "Stre..." in narrow columns. Apr 20 fix (dropped `uppercase tracking-wider`) insufficient.
**Screenshot:** `.playwright-mcp/audit-06-ppl-loaded.png`.

#### [Medium] Muscle slot labels in Planning Board truncate to single letter inside sessions
**Surface:** Same.
**Observation:** "Pecs" → "P...", "Delts" → "D...", "Quads" → "Q...". Inside session subcards, available width for label ~40px even though short labels are ≤5 chars.
**Fix direction:** Wrap to two lines, or move the sets/reps badge to a sibling row.

#### [Medium] Coach's My Clients list not row-clickable
**Surface:** `/coach/clients` → Active Clients list.
**Observation:** Each row has a name + service badge + kebab. Clicking the row body does nothing; only the 3-dot kebab opens actions.
**Fix direction:** Wrap row in `ClickableCard` with onClick that mirrors the kebab's "View" action. Universal pattern — clients expect row = open detail.

#### [Medium] Coach Exercise Library has no drill-down
**Surface:** `/coach/exercises`.
**Observation:** 340 cards shown with tags + "Also targets:". Clicking does nothing. No video, no setup/execution cues from `movement_patterns`, no equipment/resistance profile/machine brand details.
**Fix direction:** Sheet/Dialog on card click with full exercise detail. Pulls `exercise_library` + joined `movement_patterns` rows.

#### [Low] Duplicate "Programs" heading on /coach/programs
`CoachProgramsPage.tsx:111` inner heading duplicates the outer layout's "Programs" title.

#### [Low] Plan title input truncates mid-word in Planning Board header
Longer names get cut without ellipsis; breadcrumb below shows full name fine. Add `w-full min-w-0` to the input wrapper.

#### [Low] "Sessions" sidebar label is ambiguous
"/coach/sessions" is the time-slot booking page. "Sessions" is also the new Day>Session>Activity terminology. Consider renaming to "Bookings" or "Time Slots".

#### [Low] Dashboard stat "0 Programs Created" may not match coach reality
Head Coach with active clients + a Drafts-tab plan shows "0 Programs Created". Could be "converted programs only", could be stale query — label is ambiguous.

#### [Low] Google Fonts fail to load (ERR_FAILED)
Typography falls back to system fonts silently. Verify CSP `font-src` + `style-src`; consider self-hosting.

#### [Low] Sentry envelope posts return 403
Error telemetry broken on prod. Blocks exception visibility for the critical set-log bug (and any others). Needs DSN / auth check.

#### [Observation] Create Program dialog (good — keep)
Clear per-day breakdown, exercise counts, amber unfilled-slots warning, footer explaining session→module mapping. `.playwright-mcp/audit-09-convert-dialog.png`.

---

### Client

#### [Critical] Set logs do not persist to `exercise_set_logs`
**Surface:** `/client/workout/session/:moduleId`.
**Live repro:** Logged 2 sets with weight 60kg / 62.5kg, 10 reps, RIR 2 each. Green checks appeared, rest timer fired, progress 0/11 → 2/11. Clicked "Save" (top-right) → toast not visible but dialog assumed to have succeeded. Navigated to `/client/workout/history` → "No exercise history yet" empty state. Reopened `/client/workout/session/:moduleId` → progress 0/11, all inputs empty, "First time — no history" banner still shown.
**Root cause per code:** `WorkoutSessionV2.tsx:1339-1345` calls `.upsert(log, { onConflict: "client_module_exercise_id,set_index" })` with **no `{ error }` destructuring** — per CLAUDE.md, the exact silent-200-RLS-failure pattern.
**Likely underlying cause:**
- Migration `20260126102728_*.sql:563-567` defines the UPDATE policy with only `USING (created_by_user_id = auth.uid())` — **no `WITH CHECK`**. Upsert hitting the UPDATE path may fail the missing-WITH-CHECK branch.
- Or the upsert inserts hit the INSERT policy at line 531-543 which does a 4-table EXISTS join. If any join fails (RLS on `client_programs`, for instance), the insert is silently rejected.
**Fix direction (immediate):**
1. Destructure `{ error }` in the upsert loop; throw on error; surface toast.
2. Per-set auto-save on check-click instead of batching till Save click.
3. Once visible errors surface, investigate the RLS issue — likely the missing `WITH CHECK` on UPDATE policy, or a join in the INSERT policy not matching.
**Screenshots:** `audit-32-session-runner.png`, `audit-33-set1-logged.png`, `audit-34-sets-logged.png`, `audit-35-client-history.png`, `audit-36-session-reopened.png`, `audit-37-history-after-save.png`.

#### [High] Set-check UI implies per-set save; actual save deferred
**Surface:** Same.
**Observation:** Clicking a set's green check toggles UI state `completed: true`, starts rest timer, advances progress counter. The DB write is batched in `saveProgress` (line 1311) which runs only from the top-bar Save button or on Complete Workout. Navigate away between a check-click and a Save-click and the log is lost.
**Fix direction:** On set-check, upsert just that one set immediately (with visible error if it fails). Keep the top-bar Save for notes-only edits and final "Complete".

#### [High] Session runner queries dead table `programs`
**Surface:** Same.
**Console:** `GET /rest/v1/programs?select=name&id=eq.<uuid>` → 404.
**Impact:** Session header shows generic "by Coach" placeholder instead of the actual program title. `programs` is not a current table; the correct reference is `program_templates` (or go via `client_programs.source_template_id → program_templates`).
**Fix direction:** Grep `from("programs")` in `src/pages/client/WorkoutSessionV2.tsx` (and anywhere else) and swap to `program_templates`. 3-query pattern required.

#### [High] Day labels use template weekday ordinals, not actual scheduled weekday
**Surface:** Client dashboard + `/client/workout/calendar`.
**Observation:** Program built in Planning Board with Mon/Wed/Fri sessions (day_index 1, 3, 5). Assigned with `start_date = Tuesday April 21`. The dashboard's Today's Workout card shows "Mon — Strength" on Tuesday.
**Why:** `convert_muscle_plan_to_program_v2` bakes the template weekday name into `program_template_days.day_title` at conversion time. `assign_program_to_client` copies the title verbatim into `client_program_days.title` along with a date = `start_date + (day_index - 1)`. Client UI just displays `day_title` as-is.
**Fix direction:** Either (a) strip the weekday prefix from `day_title` at assignment time and let the client UI compute from `date`, or (b) rewrite `day_title` to use the actual scheduled weekday when copying into `client_program_days`.
**Screenshot:** `.playwright-mcp/audit-31-client-dashboard.png`.

#### [Low] `DialogContent` requires `DialogTitle` for accessibility
Console warning on the session runner's dialog. Wrap title in `VisuallyHidden` or add a proper `DialogTitle`.

#### [Low] Rest timer countdown inconsistent across sets
Observed 1:16 on set 2 rest, then 0:32 on set 3 rest. Prescription says 90s. Likely timer starts late or resets on UI update. Not a bug per se; worth a small trace.

#### [Observation] Distraction-free mode works (keep)
`/client/workout/session/*` correctly hides the mobile dock. Session UI is focused and clean. `audit-32-session-runner.png`.

#### [Observation] Client dashboard: Today's Workout hero + Weekly Adherence show correctly
`/dashboard` renders: 0/1 workout complete, 0% Weekly Adherence, correct service badge. `audit-31-client-dashboard.png`.

---

### Admin

Driven live as admin.

#### [Observation] Admin dashboard (keep)
**Surface:** `/admin/dashboard`.
**What's there:** 4 KPI cards (Active Clients, Active Coaches, Monthly Revenue, Pending Approvals), Subscriptions breakdown (1:1 Online 5, Team Plan 1), Coach Workload (Hasan Dashti 17% capacity), System Health (Payment failures / Stuck in medical review / Stuck waiting for coach / Stuck pending payment — all 0), Client Pipeline with stage-by-stage counts and action links (View onboarding, Review medical cases, etc.), Stuck Clients (none).
**Notable:** Clean, scannable, actionable. Good execution. Screenshot: `.playwright-mcp/audit-38-admin-dashboard.png`.

#### [Observation] Admin Content Library (keep — much richer than coach-side)
**Surface:** `/admin/exercises`.
**What's there:** Content Library with tabs: Exercise Library / Educational Videos. Sub-tabs: Exercises / Movement Patterns / Catalog View / Library Stats. Dense table view with 340 exercises, columns: #, Name, Muscle, Subdivision, Movement, Equipment, Brand, Profile(s) [L/M/S], video indicator, Active toggle. Filters: Muscle Group / Subdivision / Movement / Equipment / Profile / Category. "Add Exercise" CTA (real, functional).
**Row click → Edit Exercise sheet:** Editable fields for Name, Muscle Group, Subdivision, Movement Pattern, Equipment, Resistance Profiles (L/M/S toggle), Category, Primary Muscle ("Legacy field — auto-populated but editable"), Secondary Muscles, more below.
**Contrast:** Coach-side `/coach/exercises` has ZERO drill-down. Admin has full edit. Consider surfacing a read-only detail view on the coach side by reusing the admin Edit sheet with all fields disabled.
**Screenshots:** `.playwright-mcp/audit-39-admin-exercises.png`, `audit-40-admin-exercise-detail.png`.

#### [Medium] Admin Client Directory rows also not clickable
**Surface:** `/admin/clients`.
**Observation:** Same bug as coach-side: clicking a client row body does nothing. Only the 3-dot kebab opens actions. Admin sees all 6 clients (including Othman Al Hasan Team Plan, which is filtered from the coach assign dialog).
**Fix direction:** Same pattern — wrap rows in `ClickableCard`.
**Screenshot:** `.playwright-mcp/audit-41-admin-clients.png`.

#### [Medium / Missing] No admin-side workout analytics
**Observation:** Admin dashboard has no platform-wide workout metrics (Workouts This Week across coaches, Most-assigned program, Exercises never used, Log-rate by coach). Would be useful for capacity planning, content-quality reviews, and spotting the kind of silent bug the client pass surfaced (if logs aren't persisting, admin should see "0 workouts logged in the past 24h across 6 clients" as an anomaly).

#### [Low] `/admin/workout-builder-qa` route doesn't exist
**Surface:** Navigated directly; silently redirected to `/admin/dashboard`.
**Observation:** CLAUDE.md + data-model doc reference this as an RLS seed/smoke rig, but the route isn't live. Either the rig was removed or never shipped. Low priority unless the rig is needed for QA.

#### [Low] Admin sidebar is sparse (visible items: Home, Clients, Coaches, Billing)
**Observation:** Admin Content Library (`/admin/exercises`) is reachable via direct URL but not surfaced in the sidebar nav I enumerated. Admins finding the library for the first time would have to know the URL. Consider surfacing it.

---

### Cross-role / RLS

#### [Observation] Coach-role access to client routes correctly redirects
Coach visiting `/workout-library`, `/educational-videos` silently redirects to `/coach/dashboard`. No toast — a coach clicking a shared link might not realize. Low severity but worth a one-line toast.

#### [Pending] Coach view of the test client's just-assigned program
Requires re-login as coach after the client's logs actually persist. Blocked by the critical set-log bug.

#### [Pending] Admin view of all coaches' workout data
Requires admin login (not reached).

---

### Data model / performance

#### [Medium] `exercise_set_logs` UPDATE policy is missing `WITH CHECK`
**Migration:** `20260126102728_*.sql:563-567`.
**Risk:** `.upsert()` operations hitting an existing row take the UPDATE path. Without `WITH CHECK`, Postgres may reject the row change if the RLS runtime context can't re-verify ownership. Strongly suspected contributor to the Critical set-log bug above.
**Fix direction:** Add `WITH CHECK (created_by_user_id = auth.uid())` to the UPDATE policy.

#### [Medium] `saveProgress` upsert loop lacks error handling
**File:** `src/pages/client/WorkoutSessionV2.tsx:1339-1345`.
```ts
for (const log of allLogs) {
  await supabase
    .from("exercise_set_logs")
    .upsert(log, { onConflict: "client_module_exercise_id,set_index" });
}
```
**Issues:** No `{ error }` destructure. No `throw`. Sequential awaits instead of `Promise.all`. Per CLAUDE.md this is the silent-RLS-failure pattern.

---

## Test artifacts created during this audit

| Kind | Name | DB table | Notes |
|---|---|---|---|
| Muscle plan | `AUDIT - 2026-04-21 - PPL` | `muscle_program_templates` | Created in Drafts, converted. |
| Program template | `AUDIT - 2026-04-21 - PPL` | `program_templates` | Converted from above. Day 1 published, Days 2–7 draft. |
| `client_programs` row | — | `client_programs` | Assigned to Hasan Dashti with `start_date = 2026-04-21`. |
| Set logs | — | `exercise_set_logs` | **None persisted** (critical bug). |

**Cleanup SQL:**

```sql
-- Run after audit accepted. Deletes ONLY artifacts labelled with the audit stamp.
delete from client_programs where source_template_id in (
  select id from program_templates where title like 'AUDIT - 2026-04-21%'
);
delete from program_templates where title like 'AUDIT - 2026-04-21%';
delete from muscle_program_templates where name like 'AUDIT - 2026-04-21%';
-- exercise_set_logs cascade via client_module_exercises FK
```

---

## Recommended fix order

1. **Fix set-log persistence** (Critical). Destructure `{ error }` + surface toast + investigate RLS cause (likely UPDATE-policy missing `WITH CHECK`). Add `WITH CHECK` to UPDATE policy.
2. **Auto-save per-set** instead of batching until Save. UX honesty.
3. **Fix session runner querying dead `programs` table** (404).
4. **Fix day_title weekday drift** on assignment. Either strip or recompute.
5. **Fix empty-state CTA buttons** across 3 call sites.
6. **Add bulk publish** on ProgramCalendarBuilder.
7. Everything below Medium batched as polish pass.

The first four are pre-launch blockers for a working workout flow. 5–6 are high-traffic surface defects that burn coach trust within minutes of their first session. 7+ can land in a weekly polish branch.

---

## Follow-ups not attempted

- Admin-side live verification (user wasn't logged in as admin before drive ended).
- Mobile breakpoint pass across all surfaces.
- i18n audit (Arabic).
- Team fan-out flow (macrocycle assign, team-plan assign).
- Direct calendar session live flow.
- Module threads / coach-client communication per session.

The scripted test plan in `/Users/HasDash/.claude/plans/steady-hopping-floyd.md` Appendix A lists the remaining steps.
