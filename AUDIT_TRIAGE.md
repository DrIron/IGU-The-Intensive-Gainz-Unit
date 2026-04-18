# IGU Launch-Readiness Triage — 2026-04-17 (updated 2026-04-18)

Based on a full click-through audit of every admin / coach / client page on theigu.com, desktop + mobile. Full findings: `AUDIT_FINDINGS.md`.

The question isn't "should we fix everything?" — it's "what blocks launch?"

---

## 2026-04-18 FOLLOW-UP — bugs the coach hit in real use (all fixed)

Apr 18: coach (dr.ironofficial@gmail.com) sat down to build a new program and assign it to a test client. Every one of these surfaced during that single session — the same pattern as launch day will look like.

### A. Coach dashboard didn't scroll on desktop [FIXED — `7d7619b`]
All three layouts (coach / admin / client + the AdminPageLayout) had `<main class="flex-1 overflow-auto">`. That made `<main>` a scroll container that absorbed mouse-wheel events even when its content fit exactly inside it, so the outer body/html never got a chance to scroll. Replaced with `flex-1 min-w-0` across all 10 occurrences. Wheel now bubbles to the body.

### B. Could not delete the Upper / Lower program [FIXED — `7d7619b` + `f8b2a8c`]
Delete hit Postgres 409 from two different FKs in sequence:
1. `muscle_program_templates.converted_program_id` (the muscle plan that generated the program).
2. `coach_teams.current_program_template_id` (the Fe Squad team had Upper/Lower as its current program).

Single-delete + bulk-delete now null out both references in parallel before the DELETE. The error toast also now surfaces the actual Postgres detail so future FK blockers are obvious instead of "Something went wrong".

### C. Planning Board crashed the moment any preset was picked [FIXED — `c8429a3`]
`ReferenceError: weekCount is not defined` from `MuscleSlotCard`. Phase 38 mesocycle work added `weekCount` and `onApplyToRemaining` to the props interface and used them in JSX at lines 223–224, but forgot to destructure them from the function parameters. Bug only surfaced when a MuscleSlotCard actually rendered — i.e. the instant the coach picked any preset or dropped any muscle on a day. Empty plan looked fine.

### D. Save button flickered on/off with no confirmation toast [FIXED — `837e70c`]
`MARK_SAVED` reducer was doing `isDirty: state.isDirty` — a no-op that preserved whatever isDirty was before the save. The auto-save effect then saw dirty=true, isSaving=false immediately after each save and scheduled another save in 2s. Infinite loop. The "Muscle plan saved" toast still fired but got buried in the churn of Save enable/disable cycles. Now clears `isDirty: false` on MARK_SAVED.

### E. Slot popover clipped the per-set table (Rest column off-screen) [FIXED — `837e70c`]
`PopoverContent className="w-80 p-0"` (320px) too narrow for the 5-column per-set table (# + Reps + Tempo + RIR + Rest). Widened to `w-[420px] max-w-[calc(100vw-2rem)]` with `collisionPadding={16}`, raised `max-h` 70vh → 85vh.

### F. Muscle names invisible in week view slot rows [FIXED — `5e4bb58`]
The slot row was a single flex line: `[color dot][name flex-1 min-w-0 truncate][sets badge][tempo][icons]`. At 140px-wide day columns, the shrink-0 badges + icons took all the horizontal space and the truncating name collapsed to zero width — every row just showed `● [4s] [2010] [🔗]` with no muscle or exercise name. Restructured to two lines: line 1 = full-width name, line 2 = metadata row. Color dot became a thin vertical strip.

### G. DnD felt laggy [FIXED — `5e4bb58`]
Both the slot card and the DayColumn wrapper had `transition-all`. @hello-pangea/dnd updates position many times per second during a drag, and the catch-all transition was animating each micro-update. Narrowed to `transition-colors` for hover only so drag motion is immediate. Also bumped day column min-width 140 → 160px for more breathing room for the new two-line slot layout.

### H. Coach menu dropdown missing half the nav [FIXED — earlier `4f845f0`]
Already covered in the main triage section below. Mentioning here because it was a coach-hit annoyance too.

**Pattern from these 8 bugs:**
- 6 of 8 were introduced during Phase 30–38 feature work (team plans, mesocycle, multi-session, auto-save). Not one was caught in review.
- All 8 surfaced within the first 15 minutes a real coach sat down to use the system.
- This is the strongest argument for one more human QA pass after these fixes deploy — my Playwright-driven audit missed every single one of these because I wasn't doing what a real coach does (pick a preset, type in a name, hit save, delete the test program).

---

## BLOCKS LAUNCH — fix before first real signup

### 1. Coach cannot see their own clients
- Admin `/admin/billing` shows 5 active clients linked to Hasan. Coach dashboard `/coach` says 0 Active Clients, `/coach/clients` says "No active clients yet".
- Root cause: the coach query filters `subscriptions.coach_id = me`. Team-plan subscriptions have `team_id` set and `coach_id` = NULL; 1:1 subscriptions have 4 of 5 missing `coach_id` entirely (matches the System Health "1:1 Clients Without Coach — 4 critical" finding).
- **FIXED inline (code half):**
  - `src/components/coach/CoachMyClientsPage.tsx` — `fetchClients` now queries subs by `coach_id` AND `team_id IN (my teams)` in parallel, then merges + dedupes.
  - `src/components/coach/CoachDashboardOverview.tsx` — the main dashboard metrics query + the Compensation sub-count query both now union team-plan subs.
  - `src/components/CoachManagement.tsx` (admin view) — "Total Clients" column on `/admin/coaches` now attributes team-plan subs back to the head coach, so the column is no longer always 0.
- **Still needed (data half):** populate `subscriptions.coach_id` on the 4 orphaned 1:1 subs. Do it via `/admin/clients` (assign coach) or a backfill SQL. This is the cause of the System Health "1:1 Clients Without Coach" finding and the code fix alone won't solve it for non-team 1:1 subs.

### 2. Payment-exempt clients can still initiate TAP checkout
- On `/billing/pay`, exempt clients saw "Pay 40 KWD Now → Due Date: Immediately". Button would charge them.
- **FIXED inline:** `src/pages/BillingPayment.tsx` now guards on `profiles_public.payment_exempt` and shows a "You're Payment Exempt" card instead.
- Deploy to production.

### 3. Converted muscle plans have zero exercises
- "Upper / Lower" was converted from a muscle plan but every module shows "0 exercises" in the Session Editor Sheet.
- Auto-fill from Phase 34/35 (`ConvertToProgram.tsx` → exercise_library lookup) was wrapped in a try/catch that only `console.warn`-ed, hiding the real cause.
- **FIXED inline:** `src/components/coach/programs/muscle-builder/ConvertToProgram.tsx` — `module_exercises` + `exercise_prescriptions` inserts now destructure `{ error }` and throw, the catch now surfaces the failure via `toast` with a destructive variant, and `console.warn` → `console.error` so it's caught in Sentry.
- **Still needed:** convert one more muscle plan after deploy to see which specific error the user was actually hitting (RLS, FK, or `MUSCLE_TO_EXERCISE_FILTER` keys not matching `exercise_library.primary_muscle` values). Fix that root cause, then re-run on the existing empty Upper/Lower program.

### 4. /teams publicly lists deactivated services with "Sign Up" buttons
- **FIXED inline (two changes):**
  - `src/App.tsx`: wrapped `/teams` in `WaitlistGuard` so unauthed visitors don't leak the coming-soon product.
  - `supabase/migrations/20260501_deactivate_legacy_team_services.sql`: deactivates `team_fe_squad` and `team_bunz` service rows. Needs `supabase db push` to apply.
- After the migration, these two rows stop appearing in /admin/pricing-payouts, /admin/coaches capacity, /admin/discord-legal.

### 5. `/admin/health` banner is unreadable (white on pale yellow)
- **FIXED inline:** `src/pages/admin/SystemHealth.tsx` Alert now has `text-amber-900` / `text-green-900` / `text-destructive` so the banner text contrasts against its pale background.

### 6. 4 × legacy RLS violations on profiles_legacy / coaches base tables
- System Health page reports 4 critical. Security Checklist says 4/4 pass. Conflicting.
- Needs a DBA review — these pages look at different tables, but non-admin write access to a legacy table is a data-leak class bug. Can't fix without inspecting current `pg_policies`.

---

## FIX BEFORE MARKETING PUSH — visible polish problems for real visitors

### 7. Arabic language toggle only flips RTL — doesn't translate
- Clicking the globe shows Arabic speakers a garbled, backwards-English UI ("spots left 3", ".All caught up!", "KWD 0"). Per CLAUDE.md i18n is only scaffolded for nav+footer.
- **Recommend:** hide the toggle until translations ship. It's actively worse than leaving it English-only for RTL users right now.

### 8. Google Fonts CSS blocked for many visitors (CSP / ad-blockers / EU)
- Bebas Neue hero headings fall back to system sans on every page. The brand visual is silently broken for a non-trivial % of visitors.
- Install `@fontsource/dm-sans`, `@fontsource/bebas-neue`, `@fontsource/jetbrains-mono`. Import in `main.tsx`. Remove the `<link>` from `index.html`. No external dependency, no CSP issue.

### 9. Client navigation collapses after one click
- Desktop clients only have the sidebar on `/dashboard`. `/nutrition-client`, `/client/workout/calendar`, `/client/workout/history`, `/workout-library`, `/educational-videos`, `/account`, `/billing/pay` all render with only the top marketing nav. Clients have to go back to `/dashboard` or use the hamburger Menu to get anywhere.
- Fix: wrap these client routes in `ClientDashboardLayout` in `App.tsx`, or wire the sidebar into the pages directly. Not a 1-line fix — these pages aren't inside the Dashboard component currently.

### 10. /coach-signup redirects to /waitlist when waitlist is ON
- CLAUDE.md explicitly lists `/coach-signup` as one of the routes that must stay accessible. Something in the component is checking `waitlist_settings.is_enabled` and bouncing. Find and remove.

### 11. `/services` comparison table now includes 1:1 Complete
- **FIXED inline:** `src/components/marketing/ComparisonTable.tsx` — added the 1:1 Complete column (75 KWD/mo) and a new "Dedicated Dietitian" feature row.

### 12. Client Workout Library shows 97 more exercises than coach view
- Client `/workout-library` reads both `exercises` + `exercise_library` (437 total). Coach `/coach/exercises` reads only `exercise_library` (340). Unify.

### 13. Missing Weight Logs alert → dead-end
- Dashboard says "Tap to log now". Tap lands on `/nutrition-client` which says "No Active Nutrition Phase". Either the client HAS a phase (dashboard has real macros) and the nutrition page query is broken, or the macros on the dashboard are hardcoded and the alert shouldn't appear. Reconcile.

### 14. "Coach Coach" on /teams when unauthenticated
- Public `/teams` shows team cards with "Coach Coach" (the literal string "Coach" is prepended + "Coach" is the RLS-masked first_name fallback). Fix the fallback logic: if name is "Coach", skip the prefix.

### 15. `/admin/clients` Plan column no longer truncates
- **FIXED inline:** `src/components/ClientList.tsx` — removed aggressive "1:1 O" / "1:1 H" / "1:1 I" abbreviations. Plan names fit.

### 16. Session editor sheet a11y warning
- **FIXED inline:** `src/components/coach/programs/SessionEditorSheet.tsx` now includes an sr-only `<SheetTitle>` so the Radix accessibility warning is gone.

---

## NICE TO HAVE — polish after launch

- `/coach/pending-clients` redirects to dashboard when empty → show an empty-state page.
- Coach Menu dropdown now has all nav items — **FIXED inline** (`src/components/Navigation.tsx`, applied to admin, coach, client roles).
- "Assign to 1 Members" pluralization — **FIXED inline**.
- `/admin/diagnostics` and the linked diagnostic pages render without the admin sidebar — add a consistent "Back to Admin" header at minimum.
- Coach exercise detail modal — add video thumbnail + description, not just metadata.
- "Workouts This Week" card on coach dashboard points to `/coach/clients` — rename or repoint.
- Test account emails inconsistent across `/admin/pre-launch` (`test-*@theigu.com`) vs `/admin/launch-checklist` (`qa_*@theigu.com`).
- `/admin/educational-videos` URL → lands on Exercises tab.
- `/admin/email-log` URL → lands on Catalog tab.
- Both `/admin/client-diagnostics` and `/admin/debug/roles` show stale build timestamp `2025-12-13T10:30`.
- Top navbar shows "Services" to signed-in clients — confusing.
- `/account` Coach Assignment copy hard-codes "team plan" language for 1:1 clients.
- `/coach/clients` "All Plans" filter only has "All Plans" option.
- `/coach/teams` Payouts tab shows flat "26 KWD/client online · 80 KWD/client hybrid" — clarify vs hourly compensation model.
- Password field placeholders `•••••••` look pre-filled on auth / reset-password / account change.
- Muscle Plans empty-state has a stray red pill element.
- Coach Profile "Update Profile" with no changes produces no toast.
- Admin mobile: `/admin/coaches` tab strip overflows, `/admin/billing` table clips on mobile.
- Sentry ingest 403s — frontend error telemetry being dropped.

---

## APPLIED INLINE IN THIS AUDIT (uncommitted diff summary)

| File | Change | Commit |
|------|--------|--------|
| `src/pages/admin/SystemHealth.tsx` | `/admin/health` banner contrast fix | `4f845f0` |
| `src/components/marketing/ComparisonTable.tsx` | Added 1:1 Complete column + Dedicated Dietitian row | `4f845f0` |
| `src/components/ClientList.tsx` | Removed aggressive 1:1 abbreviations | `4f845f0` |
| `src/pages/BillingPayment.tsx` | Guard for payment-exempt clients | `4f845f0` |
| `src/App.tsx` | `/teams` wrapped in `WaitlistGuard` | `4f845f0` |
| `src/components/coach/teams/AssignTeamProgramDialog.tsx` | Pluralize "1 Member" / "N Members" | `4f845f0` |
| `src/components/Navigation.tsx` | Menu dropdown has full nav for all 3 roles; "Services" link hidden for signed-in clients | `4f845f0` |
| `src/components/coach/programs/SessionEditorSheet.tsx` | Added `<SheetTitle>` (a11y) + title aria-label | `4f845f0` |
| `src/components/coach/CoachMyClientsPage.tsx` | Query unions team-plan subs so coaches see team members | `4f845f0` |
| `src/components/coach/CoachDashboardOverview.tsx` | Dashboard metrics + Compensation counts union team-plan subs | `4f845f0` |
| `src/components/CoachManagement.tsx` | `/admin/coaches` Total Clients column attributes team subs to head coach | `4f845f0` |
| `src/components/coach/programs/muscle-builder/ConvertToProgram.tsx` | Auto-fill errors now throw + toast instead of silent `console.warn` | `4f845f0` |
| `supabase/migrations/20260501_deactivate_legacy_team_services.sql` | Deactivate team_fe_squad + team_bunz | `4f845f0` |
| `src/components/coach/CoachDashboardLayout.tsx` | Removed `overflow-auto` from `<main>` so wheel events bubble to body | `7d7619b` |
| `src/components/admin/AdminDashboardLayout.tsx` | Same scroll fix | `7d7619b` |
| `src/components/admin/AdminPageLayout.tsx` | Same scroll fix | `7d7619b` |
| `src/components/client/ClientDashboardLayout.tsx` | Same scroll fix (7 occurrences) | `7d7619b` |
| `src/components/coach/programs/ProgramLibrary.tsx` | Delete program now clears `muscle_program_templates.converted_program_id` and `coach_teams.current_program_template_id` FKs first; toasts the real Postgres error | `7d7619b` + `f8b2a8c` |
| `src/components/coach/programs/muscle-builder/MuscleSlotCard.tsx` | Destructure `weekCount` + `onApplyToRemaining` from props (Planning Board crash fix); widen popover 320 → 420px with viewport clamp + collisionPadding; 2-line slot layout (name + metadata); no transition during drag | `c8429a3` + `837e70c` + `5e4bb58` |
| `src/components/coach/programs/muscle-builder/hooks/useMuscleBuilderState.ts` | `MARK_SAVED` now clears `isDirty` — breaks the auto-save flicker loop | `837e70c` |
| `src/components/coach/programs/muscle-builder/DayColumn.tsx` | `transition-all` → `transition-colors`; min-width 140 → 160px | `5e4bb58` |

---

## WHAT I COULDN'T TEST (needs a human)

- **Drag-and-drop** on Planning Board (palette → day, slot reorder) — Playwright can't reliably simulate HTML5 DnD against @hello-pangea/dnd. Need a human to drag a muscle chip and confirm the slot popover + volume chart light up.
- **Mobile drawer slot editor** on Planning Board (Drawer/vaul) — needs real touch events.
- **Actual workout session** (`/client/workout/session/:moduleId`) — requires an assigned program which this test client doesn't have because of the coach-sees-0-clients bug.
- **TAP payment flow** — only reachable from /billing/pay, and exempt-client guard I just added blocks the test account.
- **Coach → Client assignment** — needs visible clients, which circles back to the coach query bug.
- **Email sends** (welcome, renewal reminder, etc.) — the drip rows are configured correctly in /admin/email-manager but real triggers depend on data states I can't produce without creating / modifying real client records.

If you want me to drill any of those deeper, say which one and I'll set up the minimum data prerequisites via admin panels.
