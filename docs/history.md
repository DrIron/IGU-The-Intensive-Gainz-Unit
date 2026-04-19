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
