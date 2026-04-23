# IGU Project History

Dated phase narratives and fix writeups. CLAUDE.md references this file for background context — grep it when you need detail on why something exists the way it does.

See `CLAUDE.md` for the current architecture, load-bearing rules, and gotchas.

---

## Completed Phases

- Phase 0: Build stability, ESLint fixes
- Phase 1: Access control consolidation
- Phase 2: Database RLS alignment
- Phase 3: Navigation and responsive UI
- Phase 4: Client onboarding flows
- Phase 5: Payment integration (Tap)
- Phase 6: Observability (Sentry, error logging)
- Phase 7: CI/CD pipeline (GitHub Actions)
- Phase 8: Auth session persistence fix (Feb 2, 2026)
- Phase 9: Dashboard UX redesign — all 3 roles (Feb 3, 2026)
- Phase 10: Exercise Quick-Add tool (Feb 3, 2026)
- Phase 11: Auth regression fix after dashboard merge conflicts (Feb 3, 2026)
- Phase 12: Admin dashboard QA — all 10 pages assessed (Feb 3, 2026)
- Phase 13: Specialization tags — admin-managed multi-select (Feb 3, 2026)
- Phase 14: Coach application email fix — CORS, JWT, Resend domain (Feb 4, 2026)
- Phase 15: Coach approval flow complete — DB fixes, email flow, validation (Feb 4, 2026)
- Phase 16: Coach dashboard QA — infinite loop fixes, My Clients crash fix (Feb 5, 2026)
- Phase 17: Workout Builder Phase 1 — dynamic columns, calendar builder, direct client calendar, enhanced logger (Feb 5, 2026)
- Phase 18: Exercise Editor V2 — per-set row-based layout, dual column categories, video thumbnails, collapsible warmup (Feb 5, 2026)
- Phase 19: Column header drag-to-reorder — direct header dragging with category separation (Feb 5, 2026)
- Phase 20: Session copy/paste — clipboard-based deep copy of sessions between days, copyWeek V2 field fix (Feb 5, 2026)
- Phase 21: WorkoutSessionV2 integration — per-set prescriptions, history blocks, rest timer, video thumbnails, client route wired (Feb 5, 2026)
- Phase 22: Nutrition System Enhancement — dietitian role, step/body-fat tracking, diet breaks, refeed days, care team messages (Feb 7, 2026)
- Phase 23: Full Site UI/UX Redesign — dark theme, CMS-driven content, new fonts, admin content editor (Feb 7, 2026)
- Phase 24: IGU Marketing System — auth gate removal, FAQ, comparison table, leads/UTM tracking, referrals (Feb 7, 2026)
- Phase 25: Client Onboarding & Coach Matching QA — polling pages, audit logging, gender collection, coach matching dedup (Feb 7, 2026)
- Phase 26: Roles, Subroles & Tags System — subrole definitions, permission functions, admin approval queue (Feb 7, 2026)
- Fix: Supabase getSession() hang — custom lock timeout prevents infinite lock waits (Feb 8, 2026)
- Phase 29: Scheduled Automations — 10 Vercel Cron Jobs calling Supabase edge functions (Feb 9, 2026)
- Fix: Workout Builder INP Performance — memoization across 7 component files (Feb 9, 2026)
- i18n Scaffolding — react-i18next, en/ar locales, Navigation + Footer converted (Feb 10, 2026)
- Phase 30: Compensation Model Schema — hourly-rate compensation, professional levels, add-on services (Feb 11, 2026)
- Phase 30b: Compensation UI — admin level manager, payout preview, add-on services manager (Feb 11, 2026)
- Phase 31: Planning Board (Muscle Workout Builder) — muscle-first planning, DnD calendar, volume analytics (Feb 12, 2026)
- Phase 32: Team Plan Builder — team CRUD, fan-out program assignment, readOnly calendar (Feb 12, 2026)
- Phase 32b: Team Model Redesign — removed service_id, added tags, unified "Team Plan" service (Feb 12, 2026)
- Phase 32c: Team Migration, Team Selection Prompt & Team Change — backfill old subs, choose-team prompt (Feb 12, 2026)
- Phase 33: Planning Board → Program Conversion — source_muscle_id on day_modules, auto-filter exercise picker (Feb 13, 2026)
- Pre-Launch QA Sweep — 15 bugs found across 3 roles, 8 code fixes + 1 DB migration (Feb 13, 2026)
- Planning Board Architecture Improvements — undo/redo, auto-save, plan library, batch RPCs (Feb 15, 2026)
- Phase 34: Muscle Subdivisions + Exercise Auto-Fill — 42 anatomical subdivisions, hierarchical palette (Feb 16, 2026)
- Pre-Launch Waitlist System — waitlist_settings table, WaitlistGuard, admin toggle + invite emails (Feb 18, 2026)
- Phase 35: Planning Board Exercise Selection — exercise assignment integrated into Planning Board (Mar 29, 2026)
- Planning Board as sole program creation path — removed direct "Create Program" dialog (Mar 29, 2026)
- Phase 36: Planning Board Full Program Builder — per-set customization, coach instructions, client input config (Mar 29, 2026)
- Phase 37: Multi-Session Planning Board — Activity Palette with Cardio, HIIT, Yoga/Mobility, Recovery, Sport-Specific (Mar 30, 2026)
- Bug Fix: Payment Exempt Toggle — Supabase update errors silently swallowed (Mar 31, 2026)
- Bug Fix: Workout Builder Mobile Portrait — replaced Popover with Drawer in MobileDayDetail.tsx (Mar 31, 2026)
- Bug Fix: Payment Exempt Emails — deployed edge functions with --no-verify-jwt (Apr 1, 2026)
- Mobile Experience Improvements — Coach/Admin bottom nav, button active states, 44px touch targets (Apr 8, 2026)
- Dashboard Streamlining — all 3 roles, removed redundant components, promoted useful dead code (Apr 12, 2026)
- Dashboard Post-Streamlining Polish — bug fixes, perf regressions, accessibility systemic fix (Apr 12, 2026)
- Mobile workout builder fixes — ExercisePickerDialog uses Drawer on mobile, MobileSetEditor (Apr 15, 2026)
- Phase 38: Mesocycle Support for Planning Board — multi-week mesocycles, WeekTabStrip, deload auto-trim (Apr 16, 2026)
- Performance optimization — main bundle 593KB → 437KB: lazy components, vendor chunk, non-blocking fonts (Apr 16, 2026)
- Planning Board sessions — Day > Session > Activity layer, v2 conversion RPC (Apr 19, 2026)
- Coach nutrition redesign — demographics reuse via 3 SECURITY DEFINER RPCs, Planning-Board-style hero card + week-card grid, 6 tabs → 3 (Apr 20, 2026)
- Client Overview shell — one URL per client at `/coach/clients/:clientUserId`, tabbed (Overview / Nutrition / Workouts), locked `ClientContext` contract (Apr 21, 2026)
- Client Overview — PR B entry-point rewire + Workouts tab + admin sibling route + production walk-through (Apr 22, 2026)

---

## Client Overview shell — PR A (Apr 21, 2026)

Coaches were fragmented across `/coach-client-nutrition?client=…`, `/client-submission/:userId`, and an inline `CoachClientDetail` panel inside the coach dashboard. Consolidated into one URL per client: `/coach/clients/:clientUserId?tab=overview|nutrition|workouts`. PR A is the shell + Overview tab + route wiring; Workouts tab and entry-point rewire land later. (Original handoff spec `docs/CLIENT_OVERVIEW_HANDOFF.md` retired after the shell was fully expanded — see § "Client Overview expansion — 8 sections + Messages".)

**The contract (`src/components/client-overview/types.ts`, locked):**

```ts
interface ClientContext {
  clientUserId: string;
  profile: { id, firstName, lastName, displayName, avatarUrl, status };
  subscription: { id, status, serviceType, serviceName } | null;
  viewerRole: "coach" | "admin" | "dietitian";
}
interface ClientOverviewTabProps { context: ClientContext; }
```

The shell is the only place that resolves identity. Tabs get one `context` prop and must not refetch profile / subscription / roles. Tab-scoped data (phase, programs, etc.) stays the tab's responsibility.

**Shell (`src/pages/CoachClientOverview.tsx`):**
- `useParams` reads `clientUserId` from the route.
- Parallel `Promise.all`: `profiles_public` by id, `subscriptions` + `services!inner` most recent, `user_roles`, `user_subroles` (approved) for viewer role resolution.
- `lastName` deliberately stays `null` in the context — `profiles_public` doesn't carry it, and coaches can't read `profiles_private`. Tabs needing PII gate themselves.
- `viewerRole` precedence: `admin` → `dietitian` (subrole) → `coach`. Admin branch currently unreachable because the route is wrapped in `RoleProtectedRoute requiredRole="coach"`; kept in the resolver so the contract stays honest when admin access lands.
- Four load states: `loading | not-found | error | ready`. RLS-empty profile rows fall through to a friendly not-found card (no crash, no leak).

**Header (`ClientOverviewHeader.tsx`):**
- Echoes the `NutritionPhaseCard` vocabulary: thin colored status rail on the left edge, avatar + name, subscription/service badges, monospace demographics micro-line (`age | gender | height | weight (last logged Xd ago)`) via `useClientDemographics`.
- Rail color keyed to subscription status (or profile status when no subscription): `active → emerald`, `pending* → amber`, `suspended/payment_failed → destructive`, `cancelled/inactive → muted`.
- One quick action for PR A: `Submission` → `/client-submission/:userId`. More actions land with PR B/C.

**Tab strip (`ClientOverviewTabs.tsx`):**
- `?tab=overview|nutrition|workouts`, defaults to `overview`, unknown values fall back safely.
- `setSearchParams({ replace: true })` on change so tab clicks don't spam history.
- `sticky top-16` under the navbar so mobile users keep the strip in view while scrolling a long tab.

**Overview tab (`tabs/OverviewTab.tsx`):**
- At-a-glance "is this client OK?": three stat tiles (nutrition phase week, last workout, last weigh-in) with status-colored rails matching the header vocabulary.
- Last workout obeys CLAUDE.md's rule: no nested PostgREST FK joins on `client_programs`. Three separate queries — `client_programs` by user id → `client_program_days` by program ids → `client_day_modules` with `completed_at NOT NULL`, ordered desc, limit 1.
- Pending-adjustments nudge at the top: amber-rail card if `nutrition_adjustments.status = 'pending'` for the active phase, with an inline `Review` button that deep-links to `?tab=nutrition`.

**Nutrition tab slot:** drops in the pre-scaffolded `NutritionTab.tsx` (different owner) unchanged. Feature parity with `/coach-client-nutrition` minus the client picker (shell owns selection). The old `/coach-client-nutrition` page stays live until PR B soaks.

**Workouts tab:** placeholder empty-state card. PR C (separate Claude) replaces it with program list + drill-down.

**Route + mobile nav (`src/App.tsx`):**
- `<Route path="/coach/clients/:clientUserId" element={<RoleProtectedRoute requiredRole="coach"><CoachClientOverview /></RoleProtectedRoute>} />` placed above `/coach/:section` so `:section` doesn't swallow it.
- `/coach/clients` appended to `coachPrefixes` (harmless duplicate of `/coach` prefix, but matches the spec and keeps the mobile dock explicit if `/coach` is ever tightened).

**Build delta:** +1 chunk `CoachClientOverview-*.js` at ~21 KB gzipped 7 KB. tsc / lint / build all clean; 0 new lint warnings.

**Deferred to follow-up PRs:**
- PR B — entry-point rewire per §10a of the handoff. **Shipped Apr 22 (#80); see next section.**
- PR C — Workouts tab proper. **Shipped Apr 22 (#78).**
- Admin access to the shell. **Sibling route `/admin/clients/:id` open as #81; see next section.**
- `/coach-client-nutrition` route removal. Still pending — one more day of soak on the rewire before it goes.

---

## Client Overview — PR B entry-point rewire + admin access + walk-through (Apr 22, 2026)

Day after PR A landed, closed out the handover in three moves.

**PR B — entry-point rewire (merged as `97e1db1`, PR #80).** Every coach surface that previously dropped into the filtered list view, the legacy nutrition route, or the inline `CoachClientDetail` panel now navigates to the unified shell:
- `CoachDashboardLayout.handleViewClientDetail`: `setSelectedClientId(...)` → `navigate(`/coach/clients/${id}`)`. The inline render branch stays temporarily; deletion lives in PR C once this soaks.
- `CoachMyClientsPage.handleViewNutrition`: `/coach-client-nutrition?client=X` → `/coach/clients/X?tab=nutrition`.
- `CoachMyClientsPage` Quick Actions: removed the context-free "Manage Nutrition" card (the shell only makes sense with a specific client). Grid tightens 3 → 2 cols; unused `Utensils` import dropped.
- `CoachClientDetail` nutrition button: `window.open(..., '_blank')` → `navigate('/coach/clients/:id?tab=nutrition')` (same tab).
- `ClientActivityFeed`: row click navigates directly to the detail view (`/coach/clients/:id`) instead of the filtered list (`/coach/clients?client=X`).
- **Intentionally untouched:** `NeedsAttentionAlerts:101` and `CoachTodaysTasks:37` still point at `/coach/clients?filter=pending` — those are list links, not detail links.
- `MyAssignmentsPanel` inherits the new behaviour through its `onClientSelect` prop (wired to `handleViewClientDetail`), no local change needed.

**Walk-through on production.** After merge + Vercel deploy (prod is on `e5a9c3d` + `97e1db1`):
- All three tabs render with correct content for an active client (header demographics ribbon, phase tile, last-workout tile, last-weigh-in tile; Nutrition hero card + inner tabs; Workouts pulse + active program list).
- Deep links `?tab=nutrition` and `?tab=workouts` work; `setSearchParams({ replace: true })` keeps history clean.
- `/coach/clients/<bogus-uuid>` → friendly `NotFoundState` card, not the router catch-all.
- Mobile viewport (390×844): header stacks, tab strip sticky under the navbar, 3 tiles stack full-width with status rails intact, coach bottom dock visible (`/coach/clients` is in `coachPrefixes`).
- Network audit: client-identity fetches fire 1x each as the contract promises (profile, subscription, user_roles for the client). Nit — the coach's own `user_roles` / `user_subroles` fetch 3x from unrelated components (Navigation, `useNutritionPermissions`, `RoleProtectedRoute`); pre-existing, out of scope for the shell.
- First diagnosis was wrong: initial "production is stale" call was off because `CoachClientOverview` is a lazy chunk (not in `index-*.js`). Bundle grep missed it; the route was deployed the whole time. Re-testing after logging in showed the shell rendering correctly.

**PR #81 — admin sibling route (open).** CLAUDE.md's Route Protection note is explicit that `requiredRole="coach"` excludes admins by design, and warns against generalizing the shared `hasRequiredRole()` switch. Rather than loosen, added a sibling route:
```tsx
<Route path="/admin/clients/:clientUserId" element={<RoleProtectedRoute requiredRole="admin"><CoachClientOverview /></RoleProtectedRoute>} />
```
One line under the admin block. Admins get their own URL; the admin mobile dock already matches anything under `/admin/`, so dock rendering is automatic. The shell's `viewerRole` resolver already returned `"admin"` for admin users — the branch just wasn't reachable before. `/admin/:section` and `/admin/clients/:clientUserId` have different depths so they don't collide.

**Still outstanding:**
- **PR C** — remove `/coach-client-nutrition` route + the inline `CoachClientDetail` render branch in `CoachDashboardLayout`. Soak for a day first.
- **Audit SQL cleanup** — `supabase/migrations/20260422110000_cleanup_audit_artifacts.sql` (one-shot prod cleanup for AUDIT 2026-04-21 test rows).
- **Local tree hygiene** on the main working copy — leftover staged reverts from the three-Claude parallel cycle; `git reset --hard origin/main` drops them once the user OKs.
- **Design polish pass** — user flagged potential palette / consistency gaps vs. the rest of the site. Not yet scoped.

**Process note — macOS quarantine + `gh api` bypass.** PR B was composed in a worktree off `origin/main` (non-destructive to the user's messy main tree). Worktree git was clean for PR B. PR #81 hit the CLAUDE.md macOS quarantine issue — `git checkout` hung on xattr stats, and the documented `xattr -cr .` remedy fails on `.git/objects` (read-only blobs, `Permission denied`). Workaround: composed the change off the fetched raw file, created the branch via `gh api -X POST /repos/:owner/:repo/git/refs`, and pushed the updated content via `gh api -X PUT /repos/:owner/:repo/contents/:path` (commits server-side, no local git). Worth capturing as a pattern for small surgical PRs when local git is uncooperative — though relocating the project off Desktop or recreating the worktree from a clean clone is still the better long-term fix.

---

## Coach nutrition redesign — demographics reuse + Planning-Board-style card (Apr 20, 2026)

Coach nutrition page was a form-heavy 6-tab view that re-asked for age / gender / height / weight on every phase creation, lost the top navbar on desktop, and (silently) never saved successfully because the form enum was out of sync with the DB CHECK constraint. Rebuilt end-to-end in three landed PRs (#49, #50, #51) plus a lint fix.

**Data layer (PR #49, migration `20260420120000_client_demographics_access.sql`):**
- New column `profiles_private.height_cm INT` (`BETWEEN 100 AND 250`).
- Two new RPCs matching `get_client_age` auth pattern: `get_client_gender(p_client_id) RETURNS TEXT` and `get_client_height_cm(p_client_id) RETURNS INTEGER`. Caller must be the client themselves, admin, primary coach, or active care-team member. DOB still deliberately not exposed — only derived age.
- `submit-onboarding` Zod schema accepts `height_cm` and writes to `profiles_private.height_cm`.

**Hook + permission gate (PR #49):**
- `src/hooks/useClientDemographics.ts` — parallel-fires the 3 RPCs + a latest `weight_logs` lookup. Returns `{ age, gender, heightCm, latestWeightKg, latestWeightLoggedAt, isLoading }`.
- Earlier commit `eab2096` (Apr 20) fixed two bugs that masked everything else: `useNutritionPermissions` was calling `can_edit_nutrition` and `client_has_dietitian` with wrong param names (`p_actor_id` / `p_client_id` vs the SQL signature `p_actor_uid` / `p_client_uid`) — silently returned null → `canEdit` always false. Second, `CoachNutritionGoal` wasn't destructuring `{ error }` on the "deactivate old phases" mutation, so RLS denials produced phantom success toasts.

**Pre-fill UX (PR #49, `CoachNutritionGoal`):**
- Age / Gender / Height / Starting Weight pre-fill from the hook. Each field flips a per-field `overrides.X` flag on touch, so further demographic refreshes don't clobber the coach's value.
- `"from profile"` hint under the pre-filled fields; `"last logged 2d ago"` under starting weight via `formatDistanceToNow`.
- Inline macro math dropped — now calls the exported `calculateNutritionGoals()` from `src/utils/nutritionCalculations.ts` (the same function powering the self-service calculator). Partial-data fallback preserved.

**Nav fix (PR #49, `CoachClientNutrition`):**
- Page was rendering a bare `<div>` with no layout wrapper, so the desktop IGU navbar never mounted. Now wraps in `<Navigation user={user} userRole="coach" />` + `ChevronLeft` breadcrumb to `/coach` + `max-w-7xl mx-auto`. Mobile dock was already fine via `CoachMobileNavGlobal`.

**Planning-Board vocabulary (PR #50):**
- `MacroDistributionRibbon.tsx` — horizontal stacked bar for protein / fat / carb energy split, self-normalizes to displayed grams so it stays stable while the coach is still typing.
- `NutritionPhaseCard.tsx` — hero card above the tabs when an active phase exists. Phase name + goal badge, 3xl-4xl `kcal` number, macro ribbon, `expected vs actual` rate strip in monospace, status badge (`On Track` / `Ahead` / `Behind` / `No data yet`), status-colored left rail. `normalizeGoalType()` helper so logic works with both `fat_loss|loss` vocabularies.
- `NutritionAdjustmentWeekCard.tsx` — replaces the old Accordion-per-week. 2-up grid on desktop, 1-up on mobile. Colored status rail (pending amber / approved green / rejected red / diet-break amber / delayed grey), avg weight as 22px hero, deviation strip in monospace. Inline pill row `↑ Increase / ↓ Decrease / Diet break / Delay` when no adjustment. Increase/Decrease open a small `Popover` (not modal) for amount + notes. Existing adjustment shows a 4-cell macro delta grid + Approve/Reject buttons.

**Page refactor (PR #50, `CoachClientNutrition`):**
- 6 tabs → 3:
  - **Overview**: `CoachNutritionGoal` phase form + Step progress + Step recommendations.
  - **Adjustments**: `CoachNutritionProgress` (week-card grid) + `DietBreakManager` + `RefeedDayScheduler` side-by-side.
  - **History**: `CoachNutritionGraphs` + `CoachNutritionNotes`.
- Dropped the hardcoded `canEdit={true}` on `DietBreakManager / RefeedDayScheduler / StepRecommendationCard`. All now consume `canEdit` from `useNutritionPermissions` via `NutritionPermissionGate`, so coaches with a dietitian assigned automatically see read-only UI.

**Enum mismatch fix (PR #51):**
- Form Select has always used the short form (`loss` / `gain` / `maintenance`) but `nutrition_phases.goal_type` CHECK constraint is `('fat_loss', 'maintenance', 'muscle_gain')`. Every new-phase save was returning 400 silently. `CoachNutritionGoal` now round-trips through `FORM_TO_DB_GOAL` / `DB_TO_FORM_GOAL` lookups; `NutritionPhaseCard` and `CoachNutritionProgress` normalize both vocabularies. No DB change — the filter query in `CoachClientNutrition` has always used the DB values correctly.

**Live-verified on prod:** new phase saves cleanly → hero card renders with correct `kcal` + macro ribbon + status badge → client-side `/dashboard` Daily Targets and `/nutrition-client` Week Progress header pull the exact same macros → `expected -0.75% / wk` + `actual --` strip shows correct "No data yet" state before any weigh-ins.

**Deferred follow-ups:**
- `ScheduledEventsCalendar` — merge of DietBreakManager + RefeedDayScheduler into one mini-calendar with color-coded days. Both work side-by-side in Adjustments for now.
- Mobile drawer pass — convert DietBreakManager / RefeedDayScheduler / CoachNutritionGoal editor from `Dialog` to vaul `Drawer` on mobile, matching the planning-board `MobileDayDetail` pattern.
- Onboarding form height input — column + RPC live, but the intake form doesn't collect height yet. Client can set via `/account` for now.

**Files:**
- New (6): `supabase/migrations/20260420120000_client_demographics_access.sql`, `src/hooks/useClientDemographics.ts`, `src/components/nutrition/MacroDistributionRibbon.tsx`, `NutritionPhaseCard.tsx`, `NutritionAdjustmentWeekCard.tsx`, plus a `fix/nutrition-goal-type-enum` commit.
- Modified (6): `supabase/functions/submit-onboarding/index.ts`, `src/components/nutrition/CoachNutritionGoal.tsx`, `CoachNutritionProgress.tsx`, `src/hooks/useNutritionPermissions.ts`, `src/pages/CoachClientNutrition.tsx`.

Commits: `eab2096` (permission gate + silent save fix), `7466e8e` (#49), `d15089a` (#50), `896e232` (#51).

---

## Planning Board sessions — Day > Session > Activity (Apr 19, 2026)

Introduced a coach-defined **session** layer between Day and Activity. Each day can hold multiple sessions (e.g. "Push" + "Z2 Cardio"); slots belong to a session; conversion produces **one `day_modules` row per session** instead of per slot. Fixes the fragmented client workout view where a single training day rendered as 5+ unrelated modules.

**Data model (no DB migration on `muscle_program_templates`):**
- `SessionData = { id, dayIndex, name?, type: ActivityType, sortOrder }` — new type in `src/types/muscle-builder.ts`
- `WeekData` gains `sessions?: SessionData[]`
- `MuscleSlotData` gains `sessionId?: string`
- `slot_config` JSONB now writes `{ weeks: [{ slots, sessions, label?, isDeload? }], globalClientInputs, globalPrescriptionColumns }` — backward compat reads the v3 shape and auto-migrates missing sessions on load via `migrateSlotsToSessions()` (groups legacy slots by `(dayIndex, activityType)`).

**New reducer actions (8):** `ADD_SESSION`, `REMOVE_SESSION` (drops session + its slots), `RENAME_SESSION`, `SET_SESSION_TYPE`, `REORDER_SESSION`, `DUPLICATE_SESSION_TO_DAY`, `REORDER_IN_SESSION`, `MOVE_SLOT_TO_SESSION`. `ADD_MUSCLE` / `ADD_ACTIVITY` now take optional `sessionId`; `ensureSessionForDay()` find-or-creates when omitted. `deepCloneWeek()` regenerates session ids and remaps `slot.sessionId` so cloned weeks don't share identity. `getCurrentSessions(state)` exported.

**Drag-drop:** Droppable ids changed from `day-${n}` to `session-${uuid}`. `handleDragEnd` in `MuscleBuilderPage.tsx` dispatches `REORDER_IN_SESSION` (same session) or `MOVE_SLOT_TO_SESSION` (across sessions, including cross-day). Legacy `REORDER` / `MOVE_MUSCLE` preserved in the reducer but no longer triggered by the UI.

**UI:**
- `SessionBlock.tsx` (new) — desktop subcard: colored dot + inline-editable name + kebab menu (rename / change type / duplicate to day / move up-down / delete) + own Droppable + "+Add muscle|activity" scoped to session type.
- `DayColumn.tsx` rewritten to render one `SessionBlock` per session; "+ Session" type picker replaces the old "+ Muscle" popover.
- `MobileDayDetail.tsx` rewritten — sessions as labeled sections with per-session inline picker. Strength sessions → muscle picker; non-strength → activities scoped to session type (no mixing types within a session).
- `WeeklyCalendar.tsx` threads sessions + handlers through to both desktop and mobile.

**Conversion (v2 RPC) — one module per session:**
- Migration `20260419100000_convert_rpc_v2_sessions.sql` — new RPC `convert_muscle_plan_to_program_v2(p_coach_id, p_plan_name, p_plan_description, p_muscle_template_id, p_sessions)`.
- Input `p_sessions`: `[{ id, dayIndex (absolute, week-offset applied), name?, type, sortOrder }]`. Session `type` maps to `day_modules.session_type` (`yoga_mobility` → `'mobility'`, others pass through).
- Output: `{ program_id, total_days, total_modules, session_to_module: { client_session_id → day_module_id } }`.
- `ConvertToProgram.tsx` calls v2 then inserts `module_exercises` (one per strength slot) under the right module via the returned map, with exercise auto-fill from `exercise_library` for slots missing `slot.exercise`. Non-strength sessions stay module-only (title = session name). Per-slot activity details like duration/pace are lost on conversion — same as legacy behavior.
- Legacy `convert_muscle_plan_to_program` (v1) preserved but no longer called.

**Files:**
- New (2): `SessionBlock.tsx`, `supabase/migrations/20260419100000_convert_rpc_v2_sessions.sql`.
- Modified (7): `muscle-builder.ts`, `useMuscleBuilderState.ts`, `DayColumn.tsx`, `MobileDayDetail.tsx`, `WeeklyCalendar.tsx`, `MuscleBuilderPage.tsx`, `ConvertToProgram.tsx`.

Commit: `60942af`.

---

## Phase 38: Mesocycle Support for Planning Board (Apr 16, 2026)

Planning Board now designs full mesocycles (multi-week blocks). Each week is an independent snapshot — coaches build Week 1, add weeks as deep clones, then edit per-week exercise instructions for progression. "Apply to remaining weeks" propagates changes forward via positional matching (dayIndex + sortOrder).

**Data Model Change:**
- `MusclePlanState.slots` → `MusclePlanState.weeks: WeekData[]` + `currentWeekIndex`
- `WeekData = { slots: MuscleSlotData[], label?: string, isDeload?: boolean }`
- `slot_config` JSONB now writes `{ weeks: [...], globalClientInputs, globalPrescriptionColumns }`
- Full backward compat: old `{ slots: [...] }` and bare array formats auto-wrapped in `weeks: [{ slots }]` on load

**New Reducer Actions (7):**
- `ADD_WEEK` — deep clones last week (new UUIDs for all slots)
- `REMOVE_WEEK` — removes a week (min 1)
- `SELECT_WEEK` — switches viewed week (non-undoable, like SELECT_DAY)
- `DUPLICATE_WEEK` — clones specific week, inserts after it
- `SET_WEEK_LABEL` — custom week name (e.g. "Deload")
- `TOGGLE_DELOAD` — marks week as deload, auto-trims sets × 0.6 (use undo to reverse)
- `APPLY_SLOT_TO_REMAINING` — copies slot fields to matching slots in all weeks > currentWeekIndex (matched by dayIndex + sortOrder)

All existing slot actions scoped to `state.weeks[state.currentWeekIndex].slots` via `withUpdatedCurrentWeek()` helper. `getCurrentSlots(state)` exported for external consumers.

**Conversion:** Offsets dayIndex per week — W1 = days 1-7, W2 = 8-14, W3 = 15-21. RPC updated: `((day_index - 1) % 7) + 1` for day name lookup. Day titles include week prefix in muscle labels (e.g. "W2 Pecs").

**New Files (3):**
- `src/components/coach/programs/muscle-builder/WeekTabStrip.tsx` — week navigation with dropdown (Duplicate, Rename, Mark Deload, Remove)
- `src/components/coach/programs/muscle-builder/ProgressionOverview.tsx` — per-slot instruction arc across all weeks, editable inline, apply-forward button
- `supabase/migrations/20260416100000_update_convert_rpc_multiweek.sql`

**Modified Files (9):** `muscle-builder.ts` (types), `useMuscleBuilderState.ts`, `MuscleBuilderPage.tsx`, `ConvertToProgram.tsx`, `WeeklyCalendar.tsx`, `DayColumn.tsx`, `MuscleSlotCard.tsx`, `MobileDayDetail.tsx`, `MusclePlanLibrary.tsx`.

---

## Performance Optimization — Initial Load (Apr 16, 2026)

Main bundle reduced from 593KB to 437KB (26% reduction).

- Lazy-loaded `CoachApplicationForm` + `RoutesDebugPanel`
- Google Fonts made non-blocking (`media="print" onload="this.media='all'"` with `<noscript>` fallback)
- React Query configured with `staleTime: 5min`, `gcTime: 30min`, `refetchOnWindowFocus: false`
- `AuthGuard` safety timeout reduced 12s → 8s with spinner instead of "Loading..." text
- Dead deps (jspdf) removed
- Vendor chunk added for i18n

**Sentry lazy-loading was attempted but reverted** — `@sentry/react` crashes with `Cannot assign to property '10.37.0' of [object Module]` when dynamically imported (frozen ESM module namespace, Sentry's version registration tries to mutate it). Must remain a static import in `main.tsx`. Do NOT put `@sentry/react` in `manualChunks` either (same crash).

**Files modified (8):** `index.html`, `src/App.tsx`, `src/main.tsx`, `src/lib/errorLogging.ts`, `src/components/Footer.tsx`, `src/components/AuthGuard.tsx`, `vite.config.ts`, `package.json`.

---

## Dashboard Streamlining — All 3 Roles (Apr 12, 2026)

Assessed and streamlined all three role dashboards. Design principle: each card should show a clickable number linking to its detail page, or show an actionable alert — no display-only filler.

**Coach (8 sections → 4):** Removed `CoachKPIRow` (redundant), `CoachQuickActions` (sidebar duplicate), `CoachStatsCards` (replaced), legacy `CoachActivityFeed` (merged into `ClientActivityFeed`). Added `CoachOverviewStats` (3 clickable cards) + `CoachCompensationSummary` (total + level badge). New layout: Alerts → Stats → Tasks+Activity → Capacity+Teams+Compensation.

**Admin:** Replaced `AdminQuickActions` (6 static sidebar-duplicate links) with `SystemHealthCard` + `ClientPipelineSection` (promoted from dead `RefinedAdminDashboard.tsx`). Fixed pipeline nav bug (`/dashboard/clients` → `/admin/clients`). Deleted `RefinedAdminDashboard.tsx` (839 lines dead code with hardcoded fake data).

**Client:** Removed `ProgressSummaryCard` (duplicate of `NutritionTargetsCard`), `PaymentDueCard` (redundant with `PaymentAttentionBanner`), duplicate payment alert in `AlertsCard`. Made `WeeklyProgressCard` clickable (→ `/client/workout/history`) and `AdherenceSummaryCard` clickable (→ `/client/workout/calendar`).

**Mobile:** Moved Sign Out button from fixed shrink-0 bottom into scrollable overflow-y-auto container in `Navigation.tsx` hamburger menu.

9 files changed, +311 / -1,103 lines.

### Dashboard Post-Streamlining Polish — 4 Commits (Apr 12, 2026)

Four follow-up commits after the initial streamlining addressed bugs, performance, silent failures, and accessibility — validated by `web-design-guidelines` skill + `pr-review-toolkit:code-reviewer` agent.

**Commit 1 — Cancel subscription bug + dead code cleanup:**
- `PlanBillingCard.tsx`: "Confirm Cancellation" button was a no-op (no onClick). Now calls `cancel-subscription` edge function with loading state, error sanitization, success toast, page reload. Edge function contract: `{ userId, reason, cancelledBy }`, enforces `caller.id !== userId` → 403 for non-admins.
- Deleted 7 unused component files + barrel exports.

**Commit 2 — CoachWorkloadPanel N+1 + CoachCard clickable:**
- `CoachWorkloadPanel.tsx`: replaced N+1 with 2 parallel queries aggregated via `Map<coach_id, count>`. Added `hasFetched` ref guard. Changed "Manage coaches" `<button>` → `<Link>`.
- `CoachCard.tsx`: made entire card clickable → `/meet-our-team`.

**Commit 3 — Audit findings (critical):**
- Bug: `ClientPipelineSection.tsx:272` — second occurrence of `/dashboard/clients` → `/admin/clients` nav bug missed in first pass.
- Data correctness: `CoachDashboardOverview` replaced nested PostgREST FK join on `client_programs` (unreliable) with 3 separate queries. Added `{ error }` destructuring, `hasFetched` ref, `error: any` → `unknown`, `useCallback` for `handleNavigate`.
- Performance: `CoachCompensationSummary` `for` loop making N sequential `calculate_subscription_payout` RPC calls → `Promise.all`. N+1 introduced by the streamlining itself.
- Silent failures: Added `{ error }` destructuring across `CoachDashboardOverview`, `SystemHealthCard` (5 count queries), `CoachWorkloadPanel`. `SystemHealthCard` runs all 5 count queries in parallel via `Promise.all` with first-error surfacing.
- `.single()` → `.maybeSingle()`: `NewClientOverview.tsx` optional coach fetch.

**Commit 4 — Accessibility systemic fix:**
- New primitive `src/components/ui/clickable-card.tsx` — `ClickableCard` with `role="button"`, `tabIndex={0}`, Enter/Space keyboard handler, required `ariaLabel` prop, `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`, proper `disabled`, `forwardRef`. Wraps shadcn `Card`.
- Applied to 5 components: `WeeklyProgressCard`, `AdherenceSummaryCard`, `CoachCard`, `CoachOverviewStats`, `CoachTeamsSummaryCard`.
- `aria-hidden="true"` on decorative icons across affected files.
- `PlanBillingCard`: added `aria-label="Plan options"` to icon-only `MoreVertical` button. "..." → "…".
- Navigation mobile menu: Escape key handler, `aria-labelledby`, `[overscroll-behavior:contain]`, `focus-visible` ring on close button.
- `tabular-nums` on numeric stat card displays.

**Rule going forward:** Never add `onClick` to `<Card>` directly. Always use `<ClickableCard>` from `@/components/ui/clickable-card` with a required `ariaLabel`.

**Total combined with streamlining: ~2,500 lines removed.**

---

## Mobile workout builder fixes (Apr 15, 2026)

- `ExercisePickerDialog` uses `Drawer` on mobile (clears bottom nav) — `max-h-92vh`, flex-column scroll, safe-area padding. Dialog on desktop. Branch on `useIsMobile()`.
- New `MobileSetEditor` renders stacked card-per-set with `h-10 text-base` inputs instead of the cramped table row.
- Planning Board slot rows on mobile now have up/down reorder arrows threaded via new `onReorderSlot` callback → existing `REORDER` reducer action (native DnD doesn't work on touch).

---

## Mobile Experience Improvements — App-Ready Foundation (Apr 8, 2026)

Comprehensive mobile UX improvements for app-quality foundation.

**Coach & Admin Bottom Navigation:**
- `MobileBottomNav` for Coach (Dashboard, Clients, Programs, Profile + 4 overflow in "More")
- `MobileBottomNav` for Admin (Overview, Clients, Coaches, Billing + 11 overflow in "More")
- Follows existing Client pattern: `memo` wrapper checking route prefix, `lazy` import, rendered globally in `App.tsx`
- Export functions: `getCoachMobileNavItems()` in `CoachSidebar.tsx`, `getAdminMobileNavItems()` in `AdminSidebar.tsx`

**Bottom Padding Fix:** All dashboard layouts changed from `pb-8` to `pb-24 md:pb-8` — 96px on mobile (clears bottom nav), 32px on desktop.

**Button Active States (`button.tsx`):** `active:scale-[0.98] touch-manipulation` base. Per-variant: `active:bg-primary/80`, etc. Mobile touch targets: `min-h-[44px] md:min-h-0` on `default`, `sm`, `icon` (Apple HIG 44px minimum).

**Responsive Card (`card.tsx`):** `CardHeader/Content/Footer`: `p-4 md:p-6`. `CardTitle`: `text-xl md:text-2xl`.

**Global Mobile CSS:** `.touch-feedback` utility, `overscroll-behavior-y: none` in `display-mode: standalone` (prevents pull-to-refresh in installed PWA).

**PWA Enhancements:** iOS splash screen `apple-touch-startup-image` meta tags for 4 iPhone sizes. `orientation: "portrait"` added to PWA manifest.

12 files modified, zero new deps, zero desktop visual changes.

---

## Bug Fix: Payment Exempt Email Notifications (Apr 1, 2026)

**Root cause (Flow 1 - manual client creation):** `create-manual-client` edge function calls `send-signup-confirmation` via `supabaseAdmin.functions.invoke()`. Neither was deployed with `--no-verify-jwt`. Gateway rejected ES256 JWT with 401 before function code ran. Error was silently caught. Same bug pattern as Phase 14 (`send-coach-invitation`).

**Fix:** Deployed both with `--no-verify-jwt`. Zero code changes needed.

**New feature (Flow 2 - exempt toggle):** When admin toggles client to payment exempt, client now receives "Your IGU Account Has Been Activated" email with dashboard CTA. Added `isExemptActivation` branch to `send-signup-confirmation`.

---

## Bug Fixes: Payment Exempt & Mobile Workout Builder (Mar 31, 2026)

**Payment Exempt Toggle (`AdminBillingManager.tsx`):** All three `supabase.from().update()` calls used `await` without destructuring `{ error }`. RLS failures silently swallowed → success toast despite nothing changing. Fix: destructure `{ error }`, throw on error, surface actual message.

**Workout Builder Mobile Portrait (`MobileDayDetail.tsx`):** `MobileSlotRow` used a `Popover` (`w-64`, `side="bottom"`) — no max-height, no scroll containment, tiny inputs (`h-8 text-sm`). Replaced with vaul `Drawer` (bottom sheet): full-width bottom sheet with drag-to-dismiss, `ScrollArea` with `max-h-[85vh]`, `h-10 text-base` inputs, 2-col grid (Sets + Rep Range) + 3-col grid (Tempo/RIR/RPE), "Done" button in header.

---

## Phase 37: Multi-Session Planning Board (Mar 30, 2026)

Each day can now have multiple session types (Strength, Cardio, HIIT, Yoga/Mobility, Recovery, Sport-Specific).

- `ActivityType`: strength/cardio/hiit/yoga_mobility/recovery/sport_specific
- `ACTIVITY_CATEGORIES` — 36 activities total (9 cardio, 5 HIIT, 10 yoga/mobility, 6 recovery, 6 sport-specific)
- `ActivitySlotCard` with type-specific editors
- MusclePalette renamed to Activity Palette with 5 new sections
- `DayColumn` groups by activity type with headers when mixed
- Volume analytics filter non-strength
- Conversion creates `day_modules` with correct `session_type` per module

---

## Phase 36: Planning Board Full Program Builder (Mar 29, 2026)

Planning Board is now the complete program builder — coaches design muscles, pick exercises, configure per-set prescriptions, write instructions, and define client inputs all in one flow. `ProgramCalendarBuilder` is the post-conversion fine-tuning view.

**Per-Set Customization:**
- Toggle "Customize each set" (when sets > 1) → compact table with dynamic columns
- "Choose columns" button reveals multiselect chips from `AVAILABLE_PRESCRIPTION_COLUMNS` (Rep Range, Reps, Weight, Tempo, RIR, RPE, %1RM, Rest, Time, Distance, Notes)
- Selected columns stored in `MuscleSlotData.prescriptionColumns?: string[]`
- Uses existing `SetPrescription` type from `workout-builder.ts`
- `MuscleSlotData.setsDetail?: SetPrescription[]` — per-set overrides, stored in JSONB
- When toggling OFF, flat values restored from first row
- Sets count changes auto-grow/shrink the detail array

**Coach Instructions:** `SlotExercise.instructions?: string` — textarea in exercise section of slot popover, passed to `module_exercises.instructions` on conversion.

**Client Input Configuration:**
- `MusclePlanState.globalClientInputs: string[]` — plan-wide defaults (default: Weight, Reps, RPE)
- `MuscleSlotData.clientInputColumns?: string[]` — per-slot override (undefined = use global)
- "Client Inputs" button in header with chip toggles from `AVAILABLE_CLIENT_COLUMNS`
- Per-slot: inline section with "Plan defaults" / "Custom" toggle + chip selection

**State Management:** 6 new reducer actions: `TOGGLE_PER_SET`, `UPDATE_SET_DETAIL`, `SET_SLOT_COLUMNS`, `SET_EXERCISE_INSTRUCTIONS`, `SET_GLOBAL_CLIENT_INPUTS`, `SET_SLOT_CLIENT_INPUTS`.

**slot_config format:** `{ weeks, globalClientInputs, globalPrescriptionColumns }` (mesocycle, Apr 2026). Backward compat reads `{ slots }` (Phase 36) and bare array (Phase 31) formats.

**Analytics:** `useMusclePlanVolume.ts` uses `setsDetail` for per-set TUST/volume when available.

**Conversion:** `buildPrescription()` uses `slot.setsDetail` directly as `sets_json` when available. Falls back to expanding flat values. Instructions passed to `module_exercises`.

9 files modified.

---

## Phase 35: Planning Board Exercise Selection (Mar 29, 2026)

Exercise selection integrated into Planning Board as final planning phase. Coaches assign one primary exercise + optional replacements per muscle slot.

**Data Model (`src/types/muscle-builder.ts`):**
- `SlotExercise`: `{ exerciseId: string; name: string }` — denormalized name for display
- `MuscleSlotData.exercise?: SlotExercise` — ONE primary exercise per slot (optional)
- `MuscleSlotData.replacements?: SlotExercise[]` — alternatives client can swap to
- No DB migration — stored in existing JSONB `slot_config`.

**State:** 4 new reducer actions: `SET_EXERCISE`, `CLEAR_EXERCISE`, `ADD_REPLACEMENT`, `REMOVE_REPLACEMENT`. All undoable.

**UI:** Card face shows exercise name (replaces muscle label) + dumbbell icon + replacement count when assigned. Popover "Choose Exercise" button opens `ExercisePickerDialog` (auto-filtered by muscle). Dialog opened from `MuscleBuilderPage` level (not inside popover) to avoid Radix popover dismissal.

**Conversion Enhancement (`ConvertToProgram.tsx`):**
- Pre-selected exercises used directly as module exercises (1 per slot)
- Replacement exercises added as accessory section exercises
- Auto-fill only runs for slots WITHOUT pre-selected exercises (fallback)
- Preview: green "→ Bench Press" or grey italic "→ auto-fill"

9 files modified.

### Planning Board as sole program creation path (Mar 29, 2026)

"Create Program" in ProgramLibrary routes to Planning Board. Direct program creation dialog removed. Every program goes through muscle planning first. `CoachProgramsPage` no longer has create dialog state.

---

## Phase 34: Muscle Subdivisions + Exercise Auto-Fill (Feb 16, 2026)

Added 42 anatomically specific muscle subdivisions to Planning Board's 17 coarse muscle groups, plus automatic exercise population when converting muscle plans. No DB migration — subdivision IDs stored in existing JSONB (`slot_config`) and TEXT (`source_muscle_id`) columns.

**Type System:** `SubdivisionDef { id, label, parentId }`, `SUBDIVISIONS` (42 entries across 13 parents), `SUBDIVISION_MAP`, `SUBDIVISIONS_BY_PARENT`, `resolveParentMuscleId()`, `getMuscleDisplay()` — unified lookup (checks MUSCLE_MAP first, then SUBDIVISION_MAP inheriting parent color). `MUSCLE_TO_EXERCISE_FILTER` extended with ~42 subdivision entries mapping to `exercise_library.primary_muscle` values.

**Volume Aggregation:** All metrics aggregate subdivisions to parent level. `placementCounts` tracks both exact IDs and parent IDs (for palette badges). `subdivisionBreakdown` on each `MuscleVolumeEntry` for tooltip detail.

**UI Changes:**
- `MusclePalette.tsx` — two-level hierarchy: parent chips + indented subdivision chips (smaller, dashed border)
- `DraggableMuscleChip.tsx` — `isSubdivision` prop
- `DayColumn.tsx` — expandable chevron in "Add Muscle" popover
- `MobileDayDetail.tsx` — inline subdivision picker with search
- `VolumeOverview.tsx` — tooltip shows subdivision breakdown

**Exercise Auto-Fill on Conversion (`ConvertToProgram.tsx`):**
1. Pre-selected exercises (Phase 35): slots with `exercise` use that directly; `replacements` added as accessory
2. Auto-fill fallback: slots without exercises get auto-filled — queries `MUSCLE_TO_EXERCISE_FILTER[source_muscle_id]` → `exercise_library`, picks up to 3 per module (3×8-12, RIR 2, 90s rest)
3. Auto-fill failure doesn't block program creation (try/catch)

Replaced `MUSCLE_MAP.get()` with `getMuscleDisplay()` across 10 files.

---

## Pre-Launch QA Sweep (Feb 13, 2026)

15 bugs found across Coach, Client, Admin roles and public pages. 8 code fixes + 1 DB migration.

**Code Fixes (8):**
| Bug | File | Fix |
|-----|------|-----|
| Sign out hangs (GoTrueClient deadlock) | `Navigation.tsx` | 2s timeout + pre-clear caches |
| day_number → day_index | `TodaysWorkoutHero.tsx` | Correct column for workout matching |
| .single() crash on empty | `AccountManagement.tsx` | `.maybeSingle()` for coach_change_requests |
| Missing discount_percentage col | `CoachCompensationCard.tsx` | Removed from SELECT |
| Missing discount_percentage col | `SubscriptionPayoutPreview.tsx` | Removed from interface + SELECT |
| Admin tabs reset loop | `ClientList.tsx` | `hasAutoSwitchedTab` ref guard |
| Exercise library empty | `WorkoutLibraryManager.tsx` | Query both `exercises` + `exercise_library` tables |
| CMS prices mismatch | Migration | UPDATE site_content (online 50→40, hybrid 175→150) |

**Migration `20260213110000_fix_data_and_rls_indexes.sql`:**
- 6 indexes on RLS-critical columns (fixes module_exercises timeout): `program_templates(owner_coach_id)`, `program_templates(visibility)` partial, `program_template_days(program_template_id)`, `client_program_days(client_program_id)`, `subscriptions(coach_id, status)` composite, `care_team_assignments(staff_user_id, client_id)` partial WHERE active
- Team Plan price: 0 → 12 KWD
- Deactivate old Bunz/Fe Squad services
- CMS price corrections

---

## Phase 33: Team Migration, Selection Prompt & Team Change (Feb 12, 2026)

Backfilled old Fe Squad/Bunz subscriptions to Team Plan service (team_id left NULL so clients get prompted). Added dashboard prompt for team selection, dialog for once-per-cycle team switching, team display in subscription management.

**Schema:** `subscriptions.last_team_change_at TIMESTAMPTZ` (once-per-cycle enforcement). Backfill: old Fe Squad/Bunz subs updated to Team Plan service_id, team_id stays NULL.

**New RLS Policies (2):**
- `subscriptions`: Coaches can read subscriptions for teams they own (`team_id IN (SELECT id FROM coach_teams WHERE coach_id = auth.uid())`)
- `profiles_public`: Coaches can read profiles of members in their teams (via `subscriptions.team_id → coach_teams.coach_id` join)

**Migrations:** `20260212160000_team_change_tracking.sql`, `20260212170000_team_subscriptions_rls.sql`, `20260212180000_team_profiles_rls.sql`.

**New Files:**
- `src/components/client/ChooseTeamPrompt.tsx` — Full-width prompt for active team clients with NULL team_id. Updates `subscriptions.team_id` on join.
- `src/components/client/ChangeTeamDialog.tsx` — Dialog to switch teams once per billing cycle. Updates `team_id` + `last_team_change_at`.

**RLS lesson:** Team-based queries need dedicated policies — existing coach RLS only checks `coach_id` on subscriptions and `is_primary_coach_for_user` on profiles. Team coaches need separate paths via `coach_teams.coach_id → subscriptions.team_id` join.

---

## Limited Dashboard for Incomplete Onboarding (Feb 12, 2026)

`OnboardingGuard` no longer force-redirects clients to onboarding pages. Dashboard paths (`/dashboard`, `/client`, `/client/dashboard`) are allowed through so `ClientDashboardLayout`'s limited-state UI renders (registration alerts, medical review, coach approval, payment status). Non-dashboard paths redirect to `/dashboard` instead of onboarding. The `paymentVerified` state bypass still works.

---

## Phase 32b: Team Model Redesign (Feb 12, 2026)

Removed `service_id` from `coach_teams` — teams are now service-agnostic. All teams share one "Team Plan" service (12 KWD). Added `tags TEXT[]` for client discovery. Added `subscriptions.team_id` for direct team membership. Clients selecting "Team Plan" during onboarding now see available teams and pick one. Old Fe Squad/Bunz services deactivated.

**Schema:** `coach_teams`: Removed `service_id`, added `tags TEXT[]`. `subscriptions`: Added `team_id UUID`. `form_submissions`: Added `selected_team_id UUID`. New service: "Team Plan" (12 KWD, slug `team_plan`, type `team`). Old services deactivated: `team_fe_squad`, `team_bunz`.

**New File:** `src/components/onboarding/TeamSelectionSection.tsx` — RadioGroup of team cards.

---

## Phase 32: Team Plan Builder (Feb 12, 2026)

Head coaches manage teams freely (no service picker). Teams have tags for client discovery. Assign program templates to all members at once (fan-out), preview in read-only calendar.

**New Table `coach_teams`:** `coach_id` (owner, must be head coach), `name`, `description`, `tags TEXT[]`, `current_program_template_id`, `max_members` (default 30), `is_active`.

**Altered Tables:** `client_programs.team_id`, `subscriptions.team_id`, `form_submissions.selected_team_id`.

**Migration:** `supabase/migrations/20260212_team_plan_builder.sql` — RLS (auth SELECT active teams, INSERT with `coaches_public.is_head_coach` check, UPDATE/DELETE own, admin ALL), indexes on `subscriptions(team_id)` WHERE status IN ('pending','active') and `client_programs(team_id)`.

**Shared Utility:** `src/lib/assignProgram.ts` — `assignProgramToClient()` extracted from `AssignProgramDialog.tsx`. Used by `AssignProgramDialog` (1:1) and `AssignTeamProgramDialog` (fan-out).

**Component Tree:** `src/components/coach/teams/{CoachTeamsPage, TeamCard, TeamDetailView, AssignTeamProgramDialog, CreateTeamDialog}.tsx`.

**Key Design Decisions:**
- Team membership via `subscriptions.team_id` — members tracked by `subscriptions WHERE team_id = X AND status IN ('pending','active')`
- Max 3 teams per coach — application-enforced
- Fan-out assignment — loops `assignProgramToClient()` for each active subscriber, sets `team_id` on created `client_programs`
- Head coach gate — non-head-coaches see a message instead of teams UI

**ProgramCalendarBuilder readOnly Mode:** `readOnly?: boolean` and `onBack?: () => void` props. When `readOnly`: hides Add Week, Copy Week, paste buttons, session dropdown menus, clipboard banner. Used by TeamDetailView.

---

## Phase 31: Planning Board — Muscle Workout Builder (Feb 12, 2026)

Coaches plan workouts starting from muscles instead of exercises. Drag muscle groups onto a 7-day calendar, configure sets per slot, view real-time volume analytics (MV/MEV/MAV/MRV landmarks), then convert muscle template into a program scaffold. UI label: "Planning Board". Supports multi-week mesocycles (Phase 38).

**New Table `muscle_program_templates`:** `coach_id`, `name`, `description`, `slot_config JSONB` (`{ weeks, globalClientInputs, globalPrescriptionColumns }`), `is_preset`, `is_system`, `converted_program_id`.

**Migration:** `supabase/migrations/20260212_muscle_program_templates.sql`.

**Types (`src/types/muscle-builder.ts`):** 17 muscle groups with evidence-based volume landmarks, 42 anatomical subdivisions, 4 body regions, 4 built-in presets (PPL, Upper/Lower, Full Body 3x, Bro Split), landmark zone helpers.

**Component Tree:** `src/components/coach/programs/muscle-builder/` — `MuscleBuilderPage`, `WeekTabStrip`, `MusclePalette` (+ `DraggableMuscleChip`), `WeeklyCalendar` (+ `DayColumn`, `MuscleSlotCard`, `MobileDayDetail`), `VolumeOverview`, `FrequencyHeatmap`, `ProgressionOverview`, `PresetSelector`, `ConvertToProgram`, `MusclePlanLibrary`, hooks (`useMuscleBuilderState`, `useMusclePlanVolume`).

**DnD (via @hello-pangea/dnd):** Palette → Day: copy muscle (palette stays). Day → Same Day: reorder. Day → Different Day: move. No per-day muscle limit — each slot has unique `id`.

**Program Creation Flow:** Planning Board is the only way to create a program. Flow: Planning Board (muscles + exercises) → Convert → ProgramCalendarBuilder.

**Conversion:** Creates `program_templates` + `program_template_days` + `day_modules` (one per muscle slot, with `source_muscle_id`). Pre-selected exercises used directly; slots without exercises auto-filled from `exercise_library` (up to 3 per module, defaults 3×8-12, RIR 2, 90s rest).

**DnD Fix (Feb 12, 2026):** Palette `Droppable` was missing `type="MUSCLE_SLOT"` — drops from palette to day columns were silently rejected. `@hello-pangea/dnd` requires matching types between source and destination.

**Muscle Limit Removal (Feb 12, 2026):** Removed per-day muscle dedup. Added unique `id: string` (UUID) to `MuscleSlotData`. Reducer actions use `slotId`. Backward-compatible: `hydrateSlotIds()` adds UUIDs to saved data without ids.

---

## Phase 30 / 30b: Compensation Model (Feb 11, 2026)

Restructured compensation from percentage-based splits (70/30) to hourly-rate system with professional levels, per-service hour estimates, IGU operations costs.

**New Enums:** `professional_role`, `professional_level`, `work_type_category`, `addon_service_type`.

**New Tables:** `professional_levels` (hourly rates by role × level × work_type, 9 seeded), `service_hour_estimates`, `igu_operations_costs`, `staff_professional_info`, `addon_services` (12 seeded), `addon_purchases`, `addon_session_logs`.

**Modified Tables:**
- `coaches_public`: Added `coach_level` (default junior), `is_head_coach`, `head_coach_specialisation`
- `services`: Added `slug` (unique) — 6 slugs set
- `service_pricing`: Online 50→40, Hybrid 175→150, added Complete at 75
- New Service: "1:1 Complete" 75 KWD, slug `one_to_one_complete`

**Frontend (`src/auth/roles.ts`):** `ProfessionalLevel`, `ProfessionalRole`, `WorkTypeCategory`, `ServiceSlug` types. `COACH_RATES`, `DIETITIAN_RATES`, `LEVEL_ELIGIBILITY`, `MIN_IGU_PROFIT_KWD`, `MAX_DISCOUNT_PERCENT`, `HEAD_COACH_TEAM_PAYOUT_KWD`.

**Migrations (5):** `20260211073154_add_compensation_reference_tables.sql`, `_add_professional_level_tracking`, `_add_addon_services_system`, `_update_service_tiers`, `_add_payout_calculation_function`.

**Views Recreated:** `coaches_full`, `coaches_directory_admin`, `coaches_directory` — all with `security_invoker = on`.

**Phase 30b — Compensation UI:**
- `ProfessionalLevelManager.tsx` — Admin: manage coach/specialist levels and head coach flags
- `SubscriptionPayoutPreview.tsx` — Admin: per-subscription payout via `calculate_subscription_payout()` RPC
- `AddonServicesManager.tsx` — Admin: CRUD for `addon_services` catalog
- `CoachCompensationCard.tsx` — Coach: level badge, hourly rates, per-client payout

---

## Phase 26: Roles, Subroles & Tags System (Feb 7, 2026)

Three-layer permission system:
- **Core Roles** (admin/coach/client) — route access gates
- **Subroles** (coach/dietitian/physiotherapist/sports_psychologist/mobility_coach) — admin-approved credentials
- **Tags** — self-service expertise labels, zero permission implications

All practitioners are "coaches" (core role). Subrole = credential type. No FK changes needed.

**New Tables:** `subrole_definitions` (5 seed rows), `user_subroles` (user_id + subrole_id UNIQUE, status enum pending/approved/rejected/revoked).

**New Functions:** `has_approved_subrole(user_id, slug)`, `can_build_programs(user_id)` (coach/physio/mobility + backward-compat fallback), `can_assign_workouts()`, `can_write_injury_notes()` (physiotherapist only), `can_write_psych_notes()` (sports_psychologist only), `get_user_subroles(user_id)`. Updated `is_dietitian()` — checks subroles first, fallback to user_roles. Updated `can_edit_nutrition()` — adds mobility_coach support.

**Backward Compatibility:** `can_build_programs()` includes fallback for existing coaches without ANY subrole records — still get access.

**Self-Service Re-Request:** Rejected users can UPDATE own record back to `pending`. Revoked users cannot re-request.

**Migrations (7):** Tables + RLS, permission functions, backfill, workout RLS shared calendar, cleanup specialization tags, coach apps requested subroles, care team subrole validation.

**Frontend:** `useUserSubroles.ts`, `useSubrolePermissions.ts`, `SubroleApprovalQueue.tsx`, `SubroleRequestForm.tsx`. `SUBROLE_CAPABILITIES`, `hasCapability()` in `roles.ts`.

**Feature Gating:**
- Program builder → `canBuildPrograms` (coach, physiotherapist, mobility_coach)
- Direct Calendar → primary coach, care team, admin
- Assign Program → `canBuildPrograms` OR primary coach
- Injury notes → `canWriteInjuryNotes` (physiotherapist only, UI not yet built)
- Psych notes → `canWritePsychNotes` (sports_psychologist only, UI not yet built)

---

## Phase 25: Client Onboarding & Coach Matching QA (Feb 7, 2026)

12-item fix across two phases.

**Phase A — Critical Fixes (6):**
1. `AwaitingApproval` — fetches subscription+coach data, 30s polling, auto-redirect
2. `MedicalReview` — 30s polling, auto-redirect when cleared
3. Audit logging — `onboarding_status` AuditEntityType, `logOnboardingStatusChange()` helper. `logStatusChange()` writes to `admin_audit_log`
4. Gender collection — `showGender={true}` in ServiceStep, `gender: z.enum(["male", "female"]).optional()` in client+server schemas, stored in `profiles_private.gender`
5. **Coach matching dedup** — Critical bug: client-side only counted `active` subs while server counted `pending+active`. Now both use `.in('status', ['pending', 'active'])` (3 locations: `CoachPreferenceSection`, `coachMatching.ts:autoMatchCoachForClient`, `validateCoachSelection`)
6. Direct redirect — `OnboardingForm.tsx` uses `getOnboardingRedirect(data.status)` to navigate directly (no dashboard flash)

**Phase B — High-Impact UX (6):** Save & Exit button, clickable step indicator, payment deadline countdown, discount code UI, post-payment welcome modal, expanded referral sources (YouTube, Google Search, Twitter/X, Gym/Flyer, Returning Client).

---

## Phase 24: IGU Marketing System (Feb 7, 2026)

Increased conversions via marketing improvements. Critical fix: pricing was hidden from unauthenticated visitors.

**Phase 1: Auth Gate Removal (Highest Impact)**
- Removed auth gates from `Index.tsx` and `Services.tsx`
- `services_public_read.sql` — allows anonymous users to view active services
- "Get Started" redirects to `/auth?service=...&tab=signup`

**Phase 2: Quick Win Components** (`src/components/marketing/`): `FAQSection`, `WhatsAppButton` (floating, bottom-24 right-6, z-40, only shows if CMS has number), `ComparisonTable`, `HowItWorksSection` (4-step process).

**SEO:** `react-helmet-async` (~3KB), `SEOHead.tsx`, `HelmetProvider` in `main.tsx`.

**Phase 4: Leads & UTM Tracking** — `leads` table (email UNIQUE, source DEFAULT 'website', utm_* columns, converted_to_user_id). `src/lib/utm.ts`: `captureUTMParams()`, `getUTMParams()`, `clearUTMParams()`. Newsletter signup in Footer.

**Phase 6: Testimonials Enhancement** — `weight_change_kg`, `duration_weeks`, `goal_type` (fat_loss, muscle_gain, strength, performance, recomp, general_health). RLS policy: `Anyone can view approved testimonials`.

**Phase 7: Referral System** — `referrals` table (referral_code format `IGU-NAME-XXXX`, status enum pending/signed_up/converted/rewarded/expired). `generate_referral_code(first_name)` SQL function — sanitizes name, generates unique code, fallback to UUID prefix after 10 collision attempts.

**Migrations (9):** services_public_read, seed_faq, seed_whatsapp, seed_meta, seed_how_it_works, create_leads, testimonials_stats, testimonials_public, create_referrals.

---

## Phase 23: Full Site UI/UX Redesign (Feb 7, 2026)

Unified dark theme with CMS-driven public content and admin content editor.

**Design System:**
- **Fonts:** DM Sans (body), Bebas Neue (display/headings), JetBrains Mono (code/prices)
- **Dark Theme:** `class="dark"` on `<html>`
- Colors: `--background: 240 10% 3.7%`, `--card: 240 6% 8.4%`, `--muted: 240 4% 11.8%`, `--border: 240 4% 16.5%`, `--foreground: 0 0% 98%`. Primary kept at 355 78% 56% (IGU red).

**New Table `site_content`:** `page`, `section`, `key`, `value`, `value_type` (text/richtext/number/url/json), `sort_order`, `is_active`. UNIQUE (page, section, key). Public read for active, admin-only write.

**New Hooks:** `useSiteContent(page)` returns grouped `{ section: { key: value } }`, `useAllSiteContent()`, `useFadeUp()` (IntersectionObserver), `useFadeUpList()`. Helpers: `getUniquePages`, `getSectionsForPage`, `getItemsForSection`, `parseJsonField`, `getNumericValue`.

**New Admin Component:** `SiteContentManager.tsx` — Page tabs, section accordions, per-field save with dirty tracking, JSON array editor for list fields, "View Live" button.

**Migrations:** `20260207200000_create_site_content.sql`, `20260207200001_seed_site_content.sql`.

---

## Phase 22: Nutrition System Enhancement (Feb 7, 2026)

Dietitian role support, additional tracking tables, care team communication.

**New Tables:** `dietitians`, `step_logs` (observational NEAT, not TDEE), `body_fat_logs`, `diet_breaks`, `refeed_days`, `step_recommendations`, `care_team_messages` (coach/dietitian internal, client cannot see).

**New Functions:** `is_dietitian(uuid)`, `is_dietitian_for_client(uuid, uuid)`, `is_care_team_member_for_client(uuid, uuid)`, `client_has_dietitian(uuid)`, `can_edit_nutrition(uuid, uuid)` (Admin → Dietitian → Coach → Self).

**Extended Tables:** `nutrition_phases` (+ fiber_grams, steps_target), `nutrition_goals` (+ coach_id_at_creation), `nutrition_adjustments` (+ is_flagged, flag_reason, reviewed_by_dietitian_id for >20% adjustment reviews).

**Enums Extended:** `app_role` + `'dietitian'`. `staff_specialty` + `'dietitian'`.

**Key Design Decisions:**
1. Steps observational only — NEAT coaching tool, not TDEE modifier
2. ±100 kcal tolerance band — Not a cap. Within = `no_change`, outside = full adjustment. >20% = `flag_review` (flagged but allowed)
3. Diet break maintenance from actual data — `recent_avg_intake + (weekly_weight_change × 7700 / 7)`
4. Dietitian assignment via `care_team_assignments` with `specialty = 'dietitian'`
5. When dietitian assigned: coach becomes read-only for nutrition, retains full training program control

**Migrations (10 files):** dietitian_role enum additions, dietitian_tables_functions, step_logs, body_fat_logs, diet_breaks, refeed_days, step_recommendations, care_team_messages, extend_existing_tables, dietitian_policies.

---

## Phase 17–21: Workout Builder (Feb 5, 2026)

### Phase 17: Workout Builder Phase 1

New dep: `@hello-pangea/dnd`.

**Migration `20260205_workout_builder_phase1.sql`:** `column_config JSONB` on `exercise_prescriptions`, `session_type TEXT`, `session_timing TEXT` on `day_modules` and `client_day_modules`. New tables: `coach_column_presets`, `direct_calendar_sessions`, `direct_session_exercises`. `get_default_column_config()` SQL function.

**Types (`src/types/workout-builder.ts`):** `PrescriptionColumnType` (incl. `band_resistance`), `ClientInputColumnType` (incl. `performed_hr`, `performed_calories`), `ColumnConfig`, `ColumnPreset`, `SessionType` (strength, cardio, hiit, mobility, recovery, sport_specific, other), `SessionTiming` (morning, afternoon, evening, anytime), `CalendarWeek`/`Day`/`Session`, `DirectCalendarSession`, `ExercisePrescription`, `SetLog`, `SetPrescription` (V2 per-set), `EnhancedExerciseDisplayV2`, `DEFAULT_INPUT_COLUMNS`.

**New Hooks:** `useColumnConfig`, `useProgramCalendar`, `useExerciseHistory`.

**New Components:** `ColumnConfigDropdown`, `SessionTypeSelector`, `ExerciseCardV2` (video thumbnail, per-set table, instructions textarea), `SetRowEditor`, `ColumnCategoryHeader` (dual-category "Exercise Instructions" / "Client Inputs"), `AddColumnDropdown`, `VideoThumbnail`, `WarmupSection`, `EnhancedModuleExerciseEditor`, `ProgramCalendarBuilder` (Week × Day grid), `DirectClientCalendar` (month calendar), `EnhancedWorkoutLogger` (mobile-optimized).

### Phase 18: Exercise Editor V2

Per-set row-based layout. Each set is a `SetPrescription` object stored in `sets_json` JSONB array.

**Migration `20260206_exercise_editor_v2.sql`:** Added `sets_json JSONB DEFAULT NULL` to `exercise_prescriptions`. When NULL, legacy scalar fields are used (backward compat).

**Helpers:** `splitColumnsByCategory`, `legacyPrescriptionToSets`, `getSetColumnValue`, `setSetColumnValue`, `getYouTubeThumbnailUrl`.

**Backward Compat:**
- Load: if `sets_json` is NULL → `legacyPrescriptionToSets()` expands legacy scalar fields into per-set array
- Save: always writes both `sets_json` (V2) + legacy scalar fields from first set

### Phase 19: Column Header Drag-to-Reorder

Direct drag-to-reorder on column headers. Each category (Exercise Instructions / Client Inputs) is an independent reorder zone.

Uses native HTML5 drag events on `<th>` elements (avoids invalid HTML from nesting `@hello-pangea/dnd` `<div>` droppables inside `<tr>`).

### Phase 20: Session Copy/Paste

Clipboard-based copy/paste for individual sessions on `ProgramCalendarBuilder`. Deep-copies module + exercises + prescriptions (including `sets_json`, `custom_fields_json`). Pasted session always has status "draft".

**Bug Fix:** `copyWeek` in both `ProgramCalendarBuilder.tsx` and `useProgramCalendar.ts` was not copying `sets_json` or `custom_fields_json` — fixed to include V2 per-set data.

### Phase 21: WorkoutSessionV2 Integration

Replaced client workout session route with enhanced logger featuring per-set prescriptions, history blocks, rest timer, video thumbnails.

**Data Flow:**
```
client_day_modules → client_module_exercises → exercise_set_logs
                     ↓
                     prescription_snapshot_json.sets_json (V2) OR legacy scalar (backward compat)
```

**Fixes Applied vs original draft:**
1. `useDocumentTitle` — changed `{ suffix }` to `{ description }`
2. `Navigation` — added `user={user} userRole="client"` props
3. `sets_json` — reads from `prescription_snapshot_json.sets_json`
4. Coach name — `coaches_client_safe` view with `.maybeSingle()`
5. History/PB queries — filter through `client_module_exercises` by `exercise_id`
6. Rest timer `onComplete` — uses ref to avoid stale closure in setInterval

---

## Phase 16: Coach Dashboard QA & Infinite Loop Fixes (Feb 5, 2026)

**Problems:** Infinite polling (1000+ Supabase requests per minute), My Clients page crash, `coaches_public` confusion.

**Root Cause — Infinite Loop:** React `useEffect` dependency arrays containing `useCallback` functions that depended on state setters/callbacks changing every render.

```typescript
// BROKEN
const fetchData = useCallback(async () => {
  // ...calls setCachedRoles() or onMetricsLoaded()
}, [toast, onMetricsLoaded]); // onMetricsLoaded changes every render

useEffect(() => {
  fetchData();
}, [fetchData]); // fetchData changes → useEffect runs → state changes → repeat
```

**Solution Pattern** (use for ALL data-fetching useEffects):
```typescript
const hasFetchedData = useRef(false);

useEffect(() => {
  if (hasFetchedData.current) return;
  hasFetchedData.current = true;
  fetchData();
}, [fetchData]);
```

**CoachMyClientsPage Crash (Temporal Dead Zone):** `useEffect` referenced `fetchClients` in dep array before the `useCallback` was defined later in file. Fix: Move `useCallback` declarations BEFORE the `useEffect` that uses them.

**Key Discovery — `coaches_public` is a VIEW:** `CREATE VIEW coaches_public AS SELECT ... FROM coaches WHERE status IN ('approved', 'active');`. Cannot INSERT directly. View auto-updates when `coaches.status` changes.

---

## Phase 15: Coach Approval Flow (Feb 4, 2026)

Fixed complete coach approval pipeline.

1. `profiles_legacy` FK constraint — Coach approval edge function failed because `profiles_legacy` had FK to `profiles.id` but coaches aren't in profiles. Fixed by making the insert conditional.
2. Duplicate `coach_applications` — Cleaned up: `DELETE FROM coach_applications WHERE id NOT IN (SELECT MIN(id) FROM coach_applications GROUP BY email);`
3. Zod validation — `phoneNumber` expecting string but receiving null. Fix: `phoneNumber: z.string().nullable().optional()`
4. Missing password setup email — `send-coach-invitation` had JWT verification enabled, blocking edge-function-to-edge-function calls. Fix: `supabase functions deploy send-coach-invitation --no-verify-jwt`

---

## Phase 14: Coach Application Email Fix (Feb 4, 2026)

3 layered bugs.

1. **CORS preflight crash:** `req.json()` was called at the top before checking for OPTIONS. OPTIONS has no body, `JSON.parse("")` threw SyntaxError, returning 500 before CORS headers could be set → preflight killed.
2. **JWT verification blocking anonymous users:** Coach applicants are anonymous. Gateway's `verify_jwt: true` rejected them with 401.
3. **Resend domain mismatch:** `from` used `noreply@theigu.com` but only `mail.theigu.com` was verified.

**Fix:**
- Added `corsHeaders` constant and OPTIONS preflight handler before `req.json()`
- Deployed with `--no-verify-jwt`
- Changed `from` address to `noreply@mail.theigu.com`
- All Response objects include `...corsHeaders`

---

## Phase 13: Specialization Tags (Feb 3, 2026)

Converted coach specializations from free-text comma-separated to standardized admin-managed multi-select tags.

**New Table:** `specialization_tags` (id, name, display_order, is_active, created_at).

**New Files:**
- `useSpecializationTags.ts` — React Query hook with 5min stale
- `SpecializationTagPicker.tsx` — Reusable multi-select pills
- `SpecializationTagManager.tsx` — Admin CRUD

**Coach matching:** Exact Set-based matching in `CoachPreferenceSection.tsx` and `coachMatching.ts`.

---

## Phase 9 / Dashboard UX Redesign (streamlined Apr 12 2026)

Design principle: each dashboard card either (a) shows a clickable number linking to its detail page, or (b) shows an actionable alert. No display-only filler.

**Admin Overview (`OverviewSection` in `AdminDashboardLayout.tsx`):** `AdminRequiresAttention` → `AdminMetricsCards` → two-column (`SubscriptionBreakdown` + `SystemHealthCard` | `CoachWorkloadPanel`) → `ClientPipelineSection` (full width).

**Coach Overview (`CoachDashboardOverview.tsx`):** `NeedsAttentionAlerts` → `CoachOverviewStats` (3 clickable cards) → two-column (`CoachTodaysTasks` | `ClientActivityFeed`) → two-column (`EnhancedCapacityCard` | `CoachTeamsSummaryCard` + `CoachCompensationSummary`).

**Client Overview (`NewClientOverview.tsx`):** `PaymentAttentionBanner` → `AlertsCard` → `TodaysWorkoutHero` → two-column (`NutritionTargetsCard` + `CoachCard` | `WeeklyProgressCard` + `QuickActionsGrid`) → `AdherenceSummaryCard` → two-column (`PlanBillingCard` | `MyCareTeamCard`).

---

## Auth Session Persistence Fix (Feb 2026)

**Problem:** Page refresh caused auth failures — `getSession()` hung, auth headers didn't attach, RLS blocked queries, users locked out.

**Solution (four layers):**

1. **Cache-first role management** (Phase 8): Authorization checks use cached roles, not `getSession()`
2. **Navigator lock bypass** (Feb 8): Custom `lockWithTimeout()` in `client.ts` bypasses Navigator LockManager entirely — runs `fn()` directly without a lock
3. **initializePromise timeout** (Feb 8): Races `initializePromise` against 5s timeout + resets internal `lockAcquired`/`pendingInLock` state to break the deadlock queue
4. **Full session recovery from localStorage** (Mar 29): After initializePromise timeout, `getSession()` returns null but valid session exists in localStorage. Now calls `supabase.auth.setSession()` with stored access_token + refresh_token to restore the full session — fixes `supabase.from()` queries that were silently using anon key

**Root cause — circular deadlock in GoTrueClient:**
1. `initialize()` → `_recoverAndRefresh()` → `_notifyAllSubscribers('SIGNED_IN')`
2. `_notifyAllSubscribers` awaits all `onAuthStateChange` listener callbacks
3. If any listener calls `getSession()`, it does `await this.initializePromise`
4. `initializePromise` is waiting for step 1 to finish → circular deadlock
5. Navigator LockManager lock never released → blocks ALL subsequent operations

The lock bypass + initializePromise timeout break both lock-level and Promise-level deadlocks. Trade-off: no cross-tab token refresh coordination (concurrent refreshes are idempotent on server).

**Critical gotcha (Layer 4):** After initializePromise timeout resolves, Supabase client's in-memory session is empty. `RoleProtectedRoute` bypasses this via raw `fetch()` with stored JWT, but ALL `supabase.from()` calls in dashboard components silently use the anon key. RLS blocks queries → empty results → infinite loading spinners. Fix: `client.ts` now calls `supabase.auth.setSession()` to restore the full session, which also fires `onAuthStateChange('SIGNED_IN')` to unblock `AuthGuard` and `useAuthSession`.

**Key Files:**
- `src/integrations/supabase/client.ts` — Custom `lockWithTimeout()` + `sessionReady` promise + full session recovery
- `src/lib/constants.ts` — Cache keys, timeouts
- `src/hooks/useRoleCache.ts` — localStorage role caching
- `src/hooks/useAuthSession.ts` — Session management with 5s safety timeout
- `src/hooks/useAuthCleanup.ts` — Sign-out with cache cleanup
- `src/components/RoleProtectedRoute.tsx` — Cache-first auth guard with `isAuthorizedRef` + raw fetch()
- `src/components/AuthGuard.tsx` — 8s getSession timeout + 8s safety timeout

**Cache-first pattern:**
```typescript
const cachedRoles = getCachedRoles(userId);
if (cachedRoles && hasRequiredRole(cachedRoles, requiredRole)) {
  setAuthState('authorized');
  verifyRolesWithServer(userId); // background, non-blocking
}
```

**Phase 11 Regression Note:** Dashboard UX merge conflicts removed role caching from Auth.tsx sign-in flow, causing infinite redirect loops. Two-part fix: (1) Auth.tsx: query and cache roles immediately after `signInWithPassword`, BEFORE redirect. (2) Dashboard components: remove independent `getSession()` calls, trust `RoleProtectedRoute` cache.

---

## Edge Function DB Query Fix (Feb 9, 2026)

Fixed 7 scheduled edge functions returning HTTP 500. 6 of 10 workflows failing in production.

**Root Causes:**

1. **`profiles` is a VIEW, not a table.** The `profiles` view joins `profiles_public` + `profiles_private`. FK `subscriptions_user_id_fkey` references `profiles_legacy` (separate table), NOT the view. PostgREST `profiles!subscriptions_user_id_fkey(...)` fails.
2. **`coaches` table has no `name` column.** Actual columns: `first_name`, `last_name`.
3. **`services` table has `price_kwd`, not `price`.**

**FK constraints on `subscriptions`:**
| FK Name | Column | References |
|---------|--------|------------|
| `subscriptions_user_id_fkey` | `user_id` | `profiles_legacy.id` |
| `subscriptions_user_id_profiles_public_fk` | `user_id` | `profiles_public.id` |
| `subscriptions_coach_id_fkey` | `coach_id` | `coaches.user_id` |
| `subscriptions_service_id_fkey` | `service_id` | `services.id` |

**Fix pattern:** Replace all `profiles!subscriptions_user_id_fkey(...)` with separate direct queries:

```typescript
// BROKEN
const { data } = await supabase
  .from("subscriptions")
  .select("id, user_id, profiles!subscriptions_user_id_fkey(email, first_name)")
  .eq("status", "active");

// FIXED
const { data: subs } = await supabase
  .from("subscriptions").select("id, user_id").eq("status", "active");
for (const sub of subs) {
  const { data: profile } = await supabase
    .from("profiles").select("email, first_name")
    .eq("id", sub.user_id).maybeSingle();
}
```

**Files Fixed (7):** `send-weekly-coach-digest`, `process-referral-reminders`, `process-inactive-client-alerts`, `process-coach-inactivity-monitor`, `process-renewal-reminders`, `process-testimonial-requests`, `process-payment-failure-drip`.

---

## Post-Payment Dashboard Navigation Fix (Feb 10, 2026)

**Root Cause:** `PaymentReturn.tsx` navigates to `/dashboard` after `verify-payment` confirms `active`, but `OnboardingGuard` immediately re-queries `profiles_public.status` which can still return `pending_payment` due to DB replication lag. Guard then redirects back to onboarding.

**Fix:** Pass `{ state: { paymentVerified: true } }` via React Router navigation. OnboardingGuard checks this state and skips redirect specifically when status is `pending_payment` and `paymentVerified` is true.

**Pattern — Post-action navigation with stale DB:** When navigating after a server-side status change, pass confirmation state via React Router `navigate()` so guards don't bounce the user back due to stale reads. Only bypass the specific stale status, not all statuses.

---

## Client Onboarding Submission Fix (Feb 9, 2026)

5 layered bugs preventing client onboarding form from submitting. Discovered during live QA of Fe Squad signup on theigu.com.

1. **Supabase Gateway JWT Rejection (401):** `submit-onboarding` blocked by gateway before function code ran. `verify_jwt: true` rejected valid ES256 JWT. Evidence: response CORS headers missing `content-type` (function adds it, gateway doesn't). Fix: `--no-verify-jwt`. Function has internal auth checks.
2. **`sync_form_submissions_safe()` trigger crash (500):** AFTER INSERT trigger on `form_submissions` referenced `NEW.red_flags_count`, but that column only exists on `form_submissions_safe`. Fix: Replaced `COALESCE(NEW.red_flags_count, 0)` with literal `0`.
3. **`ensure_default_client_role()` invalid enum 'new':** Trigger had `OLD.status IN ('new', 'pending')`, but `'new'` is not a valid `account_status` enum value. Fix: `OLD.status = 'pending'`.
4. **`ensure_default_client_role()` invalid enum 'client':** Inserted `role = 'client'` into `user_roles`, but `'client'` is not a valid `app_role` enum value (correct: `'member'`). Fix: `'client'` → `'member'`.
5. **Functions auth token not attached after initializePromise timeout:** After getSession() null, `supabase.functions.invoke()` falls back to anon key. Fix: recover access token from localStorage and call `supabase.functions.setAuth()`. Defense-in-depth — primary fix was Bug 1.

**Migration:** `supabase/migrations/20260209_fix_onboarding_triggers.sql`.

---

## Workout Builder INP Performance Fix (Feb 9, 2026)

Fixed severe UI freezes (4-51s) on basic workout builder interactions. Root cause: zero memoization across component tree — single state change cascaded re-renders through hundreds of components.

**Approach:** `React.memo`, `useMemo`, `useCallback` at every level.

**Files Modified (7):** `SetRowEditor.tsx`, `ColumnCategoryHeader.tsx`, `ColumnConfigDropdown.tsx`, `ExerciseCardV2.tsx`, `EnhancedModuleExerciseEditor.tsx`, `ProgramCalendarBuilder.tsx`, `CoachProgramsPage.tsx`.

**Key Pattern — Stable Per-Index Callbacks:**

When passing callbacks to list items (e.g., `onSetChange` per set row), inline arrows like `(updated) => handleSetChange(index, updated)` create new function references on every render, defeating `React.memo`. Use a ref-backed callback map:

```typescript
const callbacksRef = useRef<Map<number, (updated: T) => void>>(new Map());

useMemo(() => { callbacksRef.current = new Map(); }, [handler]);

const getCallback = useCallback((index: number) => {
  const existing = callbacksRef.current.get(index);
  if (existing) return existing;
  const cb = (updated: T) => handler(index, updated);
  callbacksRef.current.set(index, cb);
  return cb;
}, [handler]);

// Usage: <SetRowEditor onSetChange={getCallback(index)} />
```

---

## Email Template Migration (Feb 16, 2026)

Migrated ALL ~28 email-sending edge functions to shared template system. No more raw `fetch("https://api.resend.com/emails")` or inline HTML.

**Shared system (`supabase/functions/_shared/`):**
- `emailTemplate.ts` — `wrapInLayout({ content, preheader, showUnsubscribe? })`, `EMAIL_BRAND` color constants
- `emailComponents.ts` — 11 reusable components (greeting, paragraph, ctaButton, alertBox, detailCard, statCard, sectionHeading, banner, orderedList, divider, signOff)
- `sendEmail.ts` — `sendEmail({ from, to, subject, html, replyTo? })` returns `{ success, id?, error? }`
- `config.ts` — FROM addresses, URLs

Use `showUnsubscribe: true` only for marketing/drip emails. Use `--` not `—` in email copy.

---

## Pre-Launch Waitlist System (Feb 18, 2026)

Force-redirects unauthenticated visitors to a branded waitlist page when enabled by admin. Zero breakage — all redirects conditional on `waitlist_settings.is_enabled`.

**Migration `20260218100000_waitlist_settings.sql`:** `waitlist_settings` table + `leads.invited_at` column.

**Edge functions (2):** `send-waitlist-confirmation` (anon, rate-limited), `send-waitlist-invites` (admin auth check inside).

**New files (4):** `Waitlist.tsx` (branded landing page with gym-hero-bg), `WaitlistGuard.tsx` (route wrapper), `WaitlistManager.tsx` (admin card in Discord & Legal).

**Routes wrapped in WaitlistGuard:** `/`, `/services`, `/testimonial`, `/calorie-calculator`, `/meet-our-team`.

**Routes NOT wrapped (must stay accessible):** `/auth`, `/waitlist`, `/reset-password`, `/email-confirmed`, `/coach-signup`, `/coach-password-setup`, all authenticated routes.

---

## Admin QA (Feb 3, 2026) — all resolved

10 known issues across admin dashboard — all fixed.

**Critical:** Testimonials page hangs on load (Phase 24 — hasFetched + timeout wrapper); "Error loading services" spam in console (Phase 16 — was infinite loop).

**Medium:** Status shows "Unknown" briefly on page load (auth cache); "One To_one" label instead of "1:1" (global regex + `formatServiceType`); empty state text inconsistencies (standardized to "found" for filtered, "yet" for create-first); admin user flagged in system health checks (skip admin/coach roles).

**Low:** No sidebar tooltips when collapsed (Radix Tooltip); stale build timestamp display (dynamic `__BUILD_TIMESTAMP__` via Vite define); `/dashboard` route shows loading state (LoadingSpinner + instant cache-first role redirect); sign-out flow doesn't redirect (clear `igu_*` + `sb-*` keys, `window.location.replace`).

---

## Workout Builder — Phase 2 Status

- ✅ Direct calendar exercise editing (DirectSessionExerciseEditor)
- ✅ Exercise swap functionality (SwapExercisePicker in WorkoutSessionV2)
- ✅ Volume tracking / per-muscle analytics (useVolumeTracking + VolumeChart)
- ✅ Team programs — Phase 32
- ❌ Exercise history sheet UI — deferred

Spec: `/docs/WORKOUT_BUILDER_SPEC.md` (1,303 lines).

---

## Nutrition full-system audit + fix round (Apr 21, 2026)

End-to-end live test of every nutrition surface (client, coach, calculator, team, admin) with Hasan Dashti as the signed-in client and a coach account for the coach-side pass. Goal was measurement-sync correctness (enter once, flow everywhere) and catching drift between the redesign and surrounding code. Eleven PRs shipped. Documented here so the classes of bug don't recur.

### Bugs found and shipped

**#61** Weight/BF validator ranges + delete confirms + weekly check-in gate. Weight allowed 20-300 kg (accepted typos like "25" meaning "250"); tightened to 30-250. Body fat allowed 1-60%; tightened to 3-55%. Check-in Save button was post-validating "need 3+ weigh-ins" via toast after click — moved to render-time disabled button + amber alert so the gate is visible before the user clicks.

**#63** `profiles_public.activity_level` column added; `/account` + `/calorie-calculator` + onboarding edge function + coach form all read/write it. Biggest re-asked field outside the weight/BF pair. Calculator pre-fills all 5 measurement inputs (DOB, gender, height, weight, activity, goal) for signed-in users; previously only DOB + gender pre-filled.

**#64** Coach form's Current BF% now pre-fills from latest `body_fat_logs` entry via `useClientDemographics.latestBodyFatPercentage` with a "last logged Xd ago" hint.

**#65** Client weekly check-in `saveBodyFat` was only upserting `weekly_progress`; `body_fat_logs` (coach graphs + coach-form pre-fill source) stayed stale until the client opened the standalone `BodyFatLogForm`. Now dual-writes with `(user_id, log_date, method='bioelectrical')` unique-key collapse.

**#66** `get_client_age` RPC read from `form_submissions.date_of_birth` — but the rest of the app (calculator, `/account`, onboarding, Hasan specifically) uses `profiles_private.date_of_birth`. Hasan's coach page showed Age empty. Fix: read `profiles_private` first, fall back to `form_submissions` for legacy clients. **Root cause class:** SECURITY DEFINER RPCs must read from the same table the rest of the app reads/writes; pick the source-of-truth once.

**#67 → #68 (reverted)** Onboarding activity_level field — shipped then reverted per user direction. Activity stays editable only on `/calculator` and `/account`.

**#69** Coach History "Body Measurements" tab rendered "No Measurement Data" even when `body_fat_logs` had entries — loader only fetched `circumference_logs`. Added BF line chart (user-scoped, clipped to `phase.start_date`). **Root cause class:** when adding a new log table, grep every existing chart/history view for whether they were updated.

**#70** `AdjustmentCalculator` message branch was flipped for fat loss: `deltaKg < 0` (lost LESS than expected) fired "You lost more than expected. Consider increasing calories" while the math simultaneously recommended decreasing. Message and math disagreed. Added worked examples in the comment so the sign convention is obvious next read. **Root cause class:** for sign-sensitive math with negative deltas, write the examples next to the branches.

**#71** `TeamNutrition` used `pb-12` (48px) but the client mobile dock is `h-16` (64px) — bottom content clipped under the dock. Aligned with the `pb-24 md:pb-12` rule in CLAUDE.md.

**#72 / #73** Client-overview handoff scaffolding — locked `ClientContext` type, drop-in `NutritionTab`, 13-section handoff doc for the parallel Claude (shell + header + Overview tab + Workouts tab + entry-point rewire table).

### Deferred gaps (known, logged against the client-overview restructure)

- **TeamNutrition uses legacy `NutritionGoal` + `NutritionProgress`** (459 + 983 lines). Inline BMR/TDEE math diverges from shared `calculateNutritionGoals()`. No `useClientDemographics`, no `NutritionPhaseCard`, no `body_fat_logs`. Fix alongside shell migration.
- **Admin has no nutrition UI.** `RoleProtectedRoute({ requiredRole: "coach" })` returns `userRoles.includes("coach")` only — admins fail. Intentional separation (coaches vs admin ops) but leaves admins with no troubleshooting path. Either loosen the guard or add an admin-specific view when the shell lands.
- **Duplicate "All Notes (0)" / "Notes (0)" coach History tabs.** Functionally distinct (all vs non-reminder subset) but visually identical at zero. Cosmetic polish.
- **`AdjustmentCalculator` crash on tab click after coach login.** 20 console errors, GlobalErrorBoundary fired; non-reproducible signed-out. Browser session locked before a second attempt. Re-test with a fresh coach session.

### Rules worth carrying forward (now in CLAUDE.md)

1. **DOB source-of-truth is `profiles_private.date_of_birth`.** Any SECURITY DEFINER RPC that needs DOB or age reads from there first; `form_submissions` is a legacy fallback for pre-migration clients only.
2. **`body_fat_logs` writes must dual-target or reads must consolidate.** Two tables store BF% (`weekly_progress.body_fat_percentage` for coach aggregate, `body_fat_logs` for detailed history). Any new write path has to hit both, or any new read path has to union them. Drift here silently hides data.
3. **`RoleProtectedRoute({ requiredRole: "coach" })` blocks admins by design.** Documented decision, not oversight. If admin needs access to a coach-only surface, either add a parallel admin route or loosen the guard explicitly.
4. **Signed-delta math needs worked examples.** When expected and actual can both be negative (fat loss) or both positive (muscle gain), put two comment examples directly above the branch so the next reader isn't tempted to "simplify" them.
5. **Single source of truth for macro math is `src/utils/nutritionCalculations.ts#calculateNutritionGoals`.** No inline BMR/TDEE. If you find one (e.g. the legacy `NutritionGoal.tsx` still has one), route it through the shared function as part of your touch.

---

## Client Overview expansion — 8 sections + Messages (Apr 23, 2026)

Built out the full Client Overview shell from the 3-tab starter into an 8-section coach-primary surface with realtime messaging, and shipped a standalone `/coach` crash fix along the way. Sixteen PRs across one session.

**Shell structure:** horizontal tab strip (`?tab=overview|nutrition|workouts`) → sticky left rail on desktop / horizontal pill scroller on mobile, 8 slugs: `overview` (existing), `progress`, `nutrition` (existing), `workouts` (existing), `sessions`, `messages`, `care-team`, `profile`. `ClientOverviewNav` accepts an optional `badgeCounts` prop; only `messages` currently populates it.

### Sections shipped
- **Progress (#84)** — composes `CoachNutritionGraphs` (phase-scoped: weight / body-fat / circumference / adjustments) + `VolumeChart` (client-scoped from `exercise_set_logs`). Empty state when no phase, volume still renders.
- **Profile & Info (#85)** — 3 read-only cards: demographics (`useClientDemographics`), subscription (from context, zero fetches), onboarding (`form_submissions_safe` for coach-safe fields + deep-link to the PHI-gated submission page).
- **Care Team (#86)** — composes existing `CareTeamCard` (gated to primary coach / admin) + `CareTeamMessagesPanel` (staff-only chat). Tab fetches `subscriptions.coach_id` + `coaches_directory` to compute `isPrimaryCoach`.
- **Sessions (#87)** — read-only lists for `direct_calendar_sessions` (upcoming + recent) and `addon_session_logs` (joined via `addon_purchases.addon_service_id → addon_services.name` in JS, never nested FK joins).
- **Sessions + calendar polish (#93)** — collapsible `DirectClientCalendar` button for primary coach / admin. Embedded under the lists, empty-state still reachable.

### Messages stack (Phase 3)

Four user decisions shaped it: shared group thread with care team (not per-staff threads), one thread per client, refresh-on-open (no realtime at first → later added), text only, in-app badge + Resend email with 30-minute throttle.

- **Backend (#88)** — table `coach_client_messages` + RLS (client + care team + admin) + RPCs `mark_coach_client_thread_read` and `get_unread_message_count` + `email_notifications.context_id` column for per-thread throttling + edge function `send-coach-client-message-email` (deployed `--no-verify-jwt`, validates caller JWT internally).
- **Coach UI (#89)** — `MessagesTab` + shared `CoachClientThread.tsx`. Auto-resolves senders from `profiles_public`, day dividers (Today / Yesterday / `EEEE, MMM d`), Cmd/Ctrl+Enter send, `mark_coach_client_thread_read` on mount, email fire-and-forget after insert.
- **Client route (#90)** — `/messages` under `AuthGuard` + `OnboardingGuard`, same thread component with `viewerIsClient=true`. New client sidebar group + 5th mobile dock item (Home / Nutrition / Calendar / Library / Messages).
- **Polish α (#91)** — mobile `useIsMobile()` Drawer composer, own-message kebab with Edit (inline textarea, optimistic + rollback) / Delete (confirm → soft-delete). RLS already allowed sender-only UPDATE; no schema change needed.
- **Polish β (#92)** — `useUnreadMessageCount` hook + red count badges on coach `ClientOverviewNav` and client `ClientSidebar`.
- **Coach directory badge (#95)** — new RPC `get_unread_message_counts_for_staff()` returns `{client_id, unread_count}` for every thread the caller can see in one query, consumed by `useStaffUnreadCounts` + `CoachMyClientsPage`. Avoids the N+1 if you call per-thread `get_unread_message_count` per row.
- **Realtime (#96)** — Supabase realtime on `coach_client_messages` filtered by `client_id`. `useUnreadMessageCount` and `CoachClientThread` both subscribe; 60s poll dropped to a 5-minute fallback, tab-focus refresh kept. Lazy sender lookup when an unknown id streams in.
- **Edit history audit (#97)** — table `coach_client_message_edits` + `AFTER UPDATE` trigger `record_coach_client_message_edit` that snapshots `OLD.message` whenever the text actually changes. The "edited" label becomes a clickable `Popover` that lazy-loads prior versions.

### Other shipped

- **`/coach` null-user crash fix (#94)** — unrelated pre-existing bug I tripped while testing. `CoachDashboardLayout.renderContent()` accessed `user.id` in every branch without a guard; when `loading` settled to false with `currentUser === null` (expired session / failed refresh), `GlobalErrorBoundary` caught the throw and the user saw "Something went wrong" instead of a sign-in prompt. Added a defensive early-return with a loader + "Session not available" card + sign-in button. Upstream auth-refresh race is a separate follow-up.

### Incident: conflict markers shipped to main + recovered (#98)

During the cascade of merging the Messages stack, I resolved conflicts on the #92 branch but ran `git add -u` with the tab files still in `AA` (unresolved) state. Git accepted the commit with conflict markers intact, the squash-merge landed them on main, and Vercel production + subsequent PR previews failed for ~3 minutes. #98 restored the four affected files (`ClientOverviewNav.tsx`, `ClientOverviewTabs.tsx`, `CareTeamTab.tsx`, `ProfileInfoTab.tsx`) to their last-intended states and the next production build was green.

**Rule carried forward:** before committing a merge, `git status --short` should show zero `AA` / `UU` rows. If it does, `git add -u` is not enough — either `git checkout --ours` / `--theirs` each file first, or open the file and manually remove markers. The only way a squash-merged commit can contain conflict markers is if the staged index already contained them — a one-second check would have caught it.

### Rules worth carrying forward (now in CLAUDE.md)

1. **`care_team_messages` vs `coach_client_messages` are separate, don't conflate.** The former is staff-only by explicit RLS (client excluded); the latter is the shared coach ↔ client thread. Two different surfaces, two different components, two different tables.
2. **Email throttling rides on `email_notifications.context_id`.** Per-(recipient, thread) dedup, not per-(recipient) — otherwise a coach with 5 messaging clients cross-throttles. Fail open on dedup errors; prefer delivering.
3. **Add a new section → update `SECTION_SLUGS` in `sections.ts` too.** The nav renders from that array; the switch in `ClientOverviewTabs.tsx` relies on exhaustive checks against the slug type.
4. **`git status --short` before committing a merge.** Any `AA` / `UU` means conflict markers still live in the staged index. See #98 incident.
