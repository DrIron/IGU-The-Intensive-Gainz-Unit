# IGU Launch-Readiness Triage — 2026-04-17

Based on a full click-through audit of every admin / coach / client page on theigu.com, desktop + mobile. Full findings: `AUDIT_FINDINGS.md`.

The question isn't "should we fix everything?" — it's "what blocks launch?"

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

| File | Change |
|------|--------|
| `src/pages/admin/SystemHealth.tsx` | `/admin/health` banner contrast fix |
| `src/components/marketing/ComparisonTable.tsx` | Added 1:1 Complete column + Dedicated Dietitian row |
| `src/components/ClientList.tsx` | Removed aggressive 1:1 abbreviations |
| `src/pages/BillingPayment.tsx` | Guard for payment-exempt clients |
| `src/App.tsx` | `/teams` wrapped in `WaitlistGuard` |
| `src/components/coach/teams/AssignTeamProgramDialog.tsx` | Pluralize "1 Member" / "N Members" |
| `src/components/Navigation.tsx` | Menu dropdown has full nav for all 3 roles; "Services" link hidden for signed-in clients |
| `src/components/coach/programs/SessionEditorSheet.tsx` | Added `<SheetTitle>` (a11y) + title aria-label |
| `src/components/coach/CoachMyClientsPage.tsx` | Query unions team-plan subs so coaches see team members |
| `src/components/coach/CoachDashboardOverview.tsx` | Dashboard metrics + Compensation counts union team-plan subs |
| `src/components/CoachManagement.tsx` | `/admin/coaches` Total Clients column attributes team subs to head coach |
| `src/components/coach/programs/muscle-builder/ConvertToProgram.tsx` | Auto-fill errors now throw + toast instead of silent `console.warn` |
| `supabase/migrations/20260501_deactivate_legacy_team_services.sql` | Deactivate team_fe_squad + team_bunz |

---

## WHAT I COULDN'T TEST (needs a human)

- **Drag-and-drop** on Planning Board (palette → day, slot reorder) — Playwright can't reliably simulate HTML5 DnD against @hello-pangea/dnd. Need a human to drag a muscle chip and confirm the slot popover + volume chart light up.
- **Mobile drawer slot editor** on Planning Board (Drawer/vaul) — needs real touch events.
- **Actual workout session** (`/client/workout/session/:moduleId`) — requires an assigned program which this test client doesn't have because of the coach-sees-0-clients bug.
- **TAP payment flow** — only reachable from /billing/pay, and exempt-client guard I just added blocks the test account.
- **Coach → Client assignment** — needs visible clients, which circles back to the coach query bug.
- **Email sends** (welcome, renewal reminder, etc.) — the drip rows are configured correctly in /admin/email-manager but real triggers depend on data states I can't produce without creating / modifying real client records.

If you want me to drill any of those deeper, say which one and I'll set up the minimum data prerequisites via admin panels.
