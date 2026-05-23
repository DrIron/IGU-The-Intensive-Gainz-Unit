# IGU Prelaunch Audit -- 2026-05-13

**Status:** Phase A (Client) complete. Phases B--E pending.
**Methodology:** Static code audit + targeted greps. Live dev-server pass to follow once static is done.
**Scope:** Surface what's broken, what's incomplete, and quick wins. No fixes applied inline (per scope agreement); findings only.

---

## Severity legend

- **P0** -- blocks launch. Real user impact, no workaround.
- **P1** -- must fix before any traffic. Workable but ugly/confusing/risky.
- **P2** -- should fix before traffic ramp. Won't bite a beta cohort.
- **P3** -- backlog / nice-to-have.

---

## TL;DR -- top findings so far

| # | Sev | Area | Finding |
|---|-----|------|---------|
| **0** | ~~**P0**~~ **resolved 2026-05-13** | Observability | Sentry DSN env var had whitespace in `VITE_SENTRY_DSN` on Vercel -- two spaces between `de.` and `sentry.io`. Every captured exception in production was being dropped silently. **Resolution:** env var stripped, Vercel auto-redeployed. **Verified post-deploy:** zero "Invalid Sentry Dsn" console errors after fresh load + cleared service worker + cleared workbox cache. |
| 1 | ~~**P0**~~ **resolved** | Branding | Live `site_content` contained "Dr. Iron" in 3 homepage/footer rows. **Resolution 2026-05-13:** migration `20260513120000_rebrand_inperson_description.sql` applied to remote. `homepage/programs/inperson_description` now reads "your assigned coach at their available gym locations in Kuwait". `homepage/footer/about` + `homepage/footer/copyright` intentionally retained -- "Dr. Iron International Sports Consultancy" is the legal parent entity name, not marketing copy. Verify on theigu.com live walkthrough. |
| 1a | ~~**P1**~~ **resolved 2026-05-13** | Code leak | `dr.ironofficial@gmail.com` hardcoded at `src/components/admin/AdminBillingManager.tsx:362` (shipped in client bundle). Migration `20260513130000_admin_coach_lookup_rpc.sql` applied + `AdminBillingManager.tsx` edited to call new RPC + commit `dc81715` pushed + Vercel deployed. **Verified post-deploy:** new bundle `index-P8d9EwEU.js` (439KB) fetched via `fetch()` and substring-checked -- `dr.ironofficial@gmail.com` is no longer present. Edge function `create-manual-client/index.ts:222` keeps the email inline; server-side only, not a bundle concern. |
| 2 | **P3 (deferred)** | i18n | Only 5 files in `src/` use `useTranslation`. Authenticated app surface is English-only. Confirmed with user 2026-05-13: Arabic translation work hasn't started; tracking this as a known gap, not a launch blocker. Will not re-surface in later audit phases. |
| 3 | **P2** | Educational content | `/educational-videos` exists but renders "Educational videos are coming soon" when `get_educational_videos_with_access` returns 0 rows. Confirm seeded content exists before launch, or hide nav entry. |
| 4 | **P2** | Route registry drift | 11 routes in `App.tsx` not in `routeConfig.ts` -- including `/coach/clients/:clientUserId` (the 8-tab Client Overview shell). `/admin/health` duplicates `/admin/system-health`. `/admin/email-log` and registered `/admin/email-manager` are two different pages with confusing naming. Full list in Phase D2. |
| 5 | **P2** | Nutrition tabs | `/nutrition` and `/nutrition-client` tabs don't sync to `searchParams` -- deep-links and back-button lose tab state. (`/nutrition-team` does sync.) |

Full quick-wins list at the bottom; will be populated as later phases land.

---

## Phase A -- Client surface

### A1. Sign-up + auth flow

**Routes:** `/auth`, `/email-pending`, `/email-confirmed`, `/reset-password`

| Path | File | Notes |
|------|------|-------|
| `/auth` | `src/pages/Auth.tsx` | Sign-in / sign-up / forgot-password tabs. Zod schema validates email + password complexity. Service selection on sign-up. **No `useTranslation`** -- Zod messages and labels English-only. |
| `/email-pending` | `src/pages/EmailPending.tsx` (143 lines) | Post-signup "confirm your email" page. Public route, auto-redirects on `SIGNED_IN`. **Not in `routeConfig.ts`** (registry drift). |
| `/email-confirmed` | `src/pages/EmailConfirmed.tsx` (166 lines) | Verification handler -- extracts token from hash, sets session, role-based redirect. |
| `/reset-password` | `src/pages/ResetPassword.tsx` | Public, minimal layout. |

**Findings**

- **P1 -- i18n absent on Auth.tsx.** Zod validation errors hardcoded English. Localising forms is more involved than wrapping `t()` calls (Zod messages live inside schemas).
- **P2 -- registry drift.** `/email-pending` exists in `App.tsx:220` but not in `ROUTE_REGISTRY`. The registry is documented (`routeConfig.ts:13`) as "DO NOT add routes elsewhere".
- **P3 -- Token guard at `App.tsx:89` + `useTokenGuard`** runs globally; verify it doesn't fire 401 interceptor on the auth pages themselves.

### A2. Onboarding flow

**Routes:** `/onboarding`, `/onboarding/medical-review`, `/onboarding/awaiting-approval`, `/onboarding/payment`

Status machine source-of-truth: `src/auth/onboarding.ts`. TS union matches DB enum `account_status` 1:1 (10 values, verified May 2026 per CLAUDE.md).

| Path | File | Purpose |
|------|------|---------|
| `/onboarding` | `OnboardingForm.tsx` | Multi-step intake + PAR-Q + legal + service selection. Zod, StepIndicator, hasFetched guard. |
| `/onboarding/medical-review` | `onboarding/MedicalReview.tsx` | Waiting state when PAR-Q flags medical concerns. |
| `/onboarding/awaiting-approval` | `onboarding/AwaitingApproval.tsx` | Waiting for coach assignment. |
| `/onboarding/payment` | `onboarding/Payment.tsx` | TAP payment entry. |

**Findings**

- **P1 -- no i18n on the entire onboarding pipeline.** First-touch experience for every new user is in English only. Arabic users hit Arabic navbar, English intake.
- **P2 -- 4 separate routes.** Onboarding state machine could be a single page with conditional rendering, but separate routes give clean URLs for support to share. Keep as-is.
- **Verified pattern compliance:** `OnboardingGuard` correctly lets `/dashboard`, `/client`, `/client/dashboard` pass through even when onboarding incomplete (CLAUDE.md rule honored). Non-dashboard client routes redirect TO `/dashboard`.

### A3. Dashboard + chrome

**Route:** `/dashboard` (+ aliases `/client`, `/client/dashboard`) -> `src/pages/Dashboard.tsx`

**Layout / chrome:**
- `src/components/layouts/ClientDashboardLayout.tsx` -- status-aware shell, shows limited UI for incomplete onboarding
- `src/components/client/ClientSidebar.tsx` -- desktop sidebar + `getClientMobileNavItems()` for mobile dock
- `ClientMobileNavGlobal` (`App.tsx:95`) -- self-gates via `clientPaths` array

**Findings**

- **P2 -- `clientPaths` array includes `/billing` but the only registered billing route is `/billing/pay`** (`App.tsx:111` + `routeConfig.ts:143`). The `startsWith("/billing/")` check still matches, but the bare `/billing` entry is misleading. Either add a real `/billing` index page or trim the prefix.
- **P3 -- distraction-free hide on workout session** (`App.tsx:115`) only matches `/client/workout/session/`. Calendar (`/client/workout/calendar`) and history (`/client/workout/history`) both still show the dock -- correct, but worth a manual mobile check that they're not visually cramped.
- **Unread message badge** (`ClientSidebar` -> `useUnreadMessageCount`) -- verify it degrades gracefully if the RPC `get_unread_message_count` errors. Not deeply audited.

### A4. Feature routes

| Path | File | Status |
|------|------|--------|
| `/client/workout/session/:moduleId` | `client/WorkoutSessionV2.tsx` | Per-set logging, rest timer, video player, history. Mobile-aware. No i18n. |
| `/client/workout/calendar` | `client/WorkoutCalendar.tsx` | Month grid + day-detail modal. `sanitizeErrorForUser` correctly used. No empty state for "no modules on selected date". |
| `/client/workout/history` | `client/ExerciseHistory.tsx` | Exercise dropdown -> set log table. No empty state when filter has no logs. |
| `/workout-library` | `WorkoutLibrary.tsx` | Searchable directory, joins `exercise_library` (107 seeded) + legacy `exercises`. `useClientAccess` gates non-subscribed. **No `sanitizeErrorForUser` on toast** (`WorkoutLibrary.tsx:109`). |
| `/nutrition` | `Nutrition.tsx` -> renders `ClientNutrition` for 1:1 | Phase hero + 3-tab log/week/history. Tab state NOT synced to URL. **Note 3x `@typescript-eslint/no-explicit-any` suppressions** (`ClientNutrition.tsx:54-64` per agent report -- spot-check before fixing). |
| `/nutrition-client` | `ClientNutrition.tsx` direct | Same component, different access path. |
| `/nutrition-team` | `TeamNutrition.tsx` | Team plan only. Tab state IS synced via `?tab=`. |
| `/educational-videos` | `EducationalVideos.tsx` | Renders "Educational videos are coming soon" empty state (`EducationalVideos.tsx:306`). RPC: `get_educational_videos_with_access`. Confirm content is seeded before launch. |
| `/sessions` | `ClientSessions.tsx` | Direct calendar sessions + addon session logs read-only digest. |
| `/messages` | `ClientMessages.tsx` | Mounts `CoachClientThread`. Realtime + 5min poll + tab-focus refresh. |
| `/account` | `AccountManagement.tsx` | Profile / subscription / coach change / password / delete. **`useState<any>(null)` for user** (line 72 per agent report). |
| `/billing/pay` | `BillingPayment.tsx` | TAP billing entry with discount code lookup. |
| `/payment-status` | `PaymentStatus.tsx` | Loads `PaymentStatusDashboard` wrapper. Implements late-arriving session recovery pattern correctly. |
| `/payment-return` | `PaymentReturn.tsx` | TAP charge verification + auto-redirect. 8s session timeout in place (line 44-45). 3s auto-redirect on success -- low race risk but verify in live walkthrough. |

**Findings**

- **P0 -- i18n missing across all 14 feature routes.** Same root issue as auth and onboarding -- only public navbar/footer translates. Decision needed: is Arabic shipping at launch, or is `ar/` locale soft-disabled until coverage exists?
- **P1 -- `sanitizeErrorForUser` inconsistency.** Used in `WorkoutCalendar`, `ExerciseHistory`. Missing in `WorkoutLibrary` (line 109), `Nutrition` (line 96), `ClientNutrition` (warn only). Risk: Postgres error strings leaking to users.
- **P2 -- empty/filter states missing.** `ExerciseHistory` and `WorkoutCalendar` lack "no data" copy when filters yield nothing.
- **P2 -- tab state not URL-synced** in `/nutrition` and `/nutrition-client`; back-button and deep-links lose state. `/nutrition-team` shows the pattern.
- **P2 -- `<any>` suppressions** in `ClientNutrition.tsx` and `AccountManagement.tsx`. Not a launch blocker but flags real type debt.
- **P3 -- `AccountManagement` coach-change dropdown** -- verify RLS blocks team-plan members (who shouldn't be able to swap a 1:1 coach they don't have). Server-side check exists somewhere; client-side gating not confirmed.

### A5. Cross-cutting client gaps

**Registry vs `App.tsx` drift (client side):**
- `/email-pending` -- in `App.tsx:220`, missing from `ROUTE_REGISTRY`
- `/teams` -- in `App.tsx:256`, missing from registry (public route)

**Branding violations (live data, not code):**

Three rows in `site_content` originally seeded by `20260207200001_seed_site_content.sql:62,83,84`:

- `:62` -- `homepage/programs/inperson_description` -- "Premium hands-on coaching with Dr. Iron at our Kuwait facility." -> **fixed via new migration `20260513120000_rebrand_inperson_description.sql`** to "your assigned coach at their available gym locations in Kuwait".
- `:83` -- `homepage/footer/about` -- "...Dr. Iron International Sports Consultancy..." -> **intentionally retained** (legal parent entity name).
- `:84` -- `homepage/footer/copyright` -- "Dr. Iron International Sports Consultancy" -> **intentionally retained** (legal copyright line).

Decision rationale: per Hasan 2026-05-13, "Dr. Iron International Sports Consultancy" is the actual legal entity under which IGU operates. The CLAUDE.md "never Dr Iron" rule applies to product branding / marketing voice -- it does not require rewriting the legal entity name. Only the In-Person service description (which used "Dr. Iron" as a personal-brand reference) needed correction.

**Waitlist mode:** `WaitlistGuard` reads `waitlist_settings.is_enabled`. Not checked here whether waitlist is currently on/off in prod -- relevant for live walkthrough.

**i18n coverage:** Confirmed via grep -- 5 files use `useTranslation` (`LanguageSwitcher`, `Navigation`, `Footer`, plus the two i18n config files). Locale files exist only for `common` + `nav` namespaces.

---

## Phase B -- Coach surface

### B1. Route inventory

13 coach routes, all gated by `RoleProtectedRoute requiredRole="coach"`. Section-based routes (`/coach/dashboard`, `/coach/clients`, `/coach/teams`, etc.) all resolve through the `/coach/:section` catchall to `CoachDashboard.tsx` which switches on the `:section` URL param. Direct routes are `/coach`, `/coach/studio-preview`, `/coach/clients/:clientUserId`, `/coach/pending-clients`.

**Standalone client-overview shell:** `/coach/clients/:clientUserId` -> `src/pages/CoachClientOverview.tsx`. 8 tabs at `src/components/client-overview/tabs/` (Overview, Progress, Nutrition, Workouts, Sessions, Messages, CareTeam, ProfileInfo). Activated via `?tab=<slug>`; default `overview`. Sticky left rail desktop, horizontal pill scroller mobile.

### B2. Routes that need cleanup

| Route / File | Status | Recommended action |
|--------------|--------|-------------------|
| `/coach/pending-clients` -> `PendingClientsPage.tsx` | **Hard redirect stub.** 45 lines. Makes 2 Supabase round-trips (auth + roles) just to redirect to `/dashboard`. The pending-clients UI has been moved inline into `CoachMyClientsPage`. Old bookmarks silently land on dashboard with no toast/explanation. | **P3.** Delete the page, the registry entry (`routeConfig.ts:121`), and the route in `App.tsx:269`. If you want to be polite to old bookmarks, leave a one-line redirect like `<Route path="/coach/pending-clients" element={<Navigate to="/coach/clients" replace />} />`. |
| `/coach/studio-preview` -> `StudioPreview.tsx` | **Design preview only.** File header comment explicitly says: "Hand-rolled sample data... Delete this file if the design direction is rejected." Drag handlers are no-ops. Sample data hardcoded. | **P3.** Get a decision on whether the Studio aesthetic is shipping. If yes, wire it to the reducer; if no, delete file + `App.tsx:229` route. Currently dead weight that can confuse coaches who land on it. |

### B3. Potential race conditions to verify in live walkthrough

| File | Concern | Action |
|------|---------|--------|
| `src/components/layouts/CoachDashboardLayout.tsx:54` | Training-mode check reads `coaches.status === "training"`. Depends on `sessionUser` loading. If session resolves AFTER first render, layout briefly shows full dashboard before collapsing to training-only view. 5s timeout safety net exists but doesn't explicitly reset display when session arrives. | **P2.** Live test: a brand-new coach signing in for the first time should land in training mode without seeing the full dashboard flash. |
| `src/pages/CoachClientOverview.tsx:51` | `Promise.all([profiles, subscriptions, user_roles, user_subroles])` -- if ANY single query errors (e.g., RLS denial on one table), the whole load fails. Page has `NotFoundState` for missing client but no recovery for mid-load failure. | **P2.** Verify by impersonating a coach loading a client they shouldn't have access to -- does the page degrade gracefully or hard-error? |

### B4. Client Overview shell -- 8 tabs

| Tab | File | Status |
|-----|------|--------|
| Overview | `OverviewTab.tsx` | Phase summary + last weigh-in + last workout + pending adjustments nudge. Working. |
| Progress | `ProgressTab.tsx` | `CoachNutritionGraphs` (phase-scoped) + `VolumeChart`. Working. |
| Nutrition | `NutritionTab.tsx` | Phase hero + 3-tab inner (Overview / Adjustments / History). Has a real TODO comment (line 43): "completed phases not visible from the shell. Legacy..." -- known gap. |
| Workouts | `WorkoutsTab.tsx` | Program list + drill-down + session viewer + adherence pulse. |
| Sessions | `SessionsTab.tsx` | Direct calendar sessions + addon logs (read-only digest). Primary coach / admin also get a collapsible `DirectClientCalendar`. |
| Messages | `MessagesTab.tsx` | Mounts shared `CoachClientThread`. Realtime + 5min poll + tab-focus refresh. |
| Care Team | `CareTeamTab.tsx` | `CareTeamCard` + `CareTeamMessagesPanel`. Gated to primary coach / admin. |
| Profile Info | `ProfileInfoTab.tsx` | Read-only demographics (`useClientDemographics`) + subscription + intake summary. |

**Locked contract** (`types.ts`): tabs receive `{ context: ClientContext }` from the shell. Shell is the ONLY place that resolves profile/subscription/viewer-role. Tabs must never refetch identity. This is sound; verify any new tab work respects it.

**Caveats embedded in the contract:**
- `profile.lastName` is always `null` -- `profiles_public` doesn't carry it, coaches can't read `profiles_private`. Tabs needing PII must gate themselves.
- `viewerRole` admin branch is currently unreachable (route is wrapped in `RoleProtectedRoute requiredRole="coach"` -- admins can't reach it). Resolver keeps the branch for the future admin-access PR. Worth a follow-up to either wire admin access or strip the dead branch.

### B5. Mobile dock + sidebar

**Coach mobile dock prefix list** (`App.tsx:138`): `["/coach", "/coach/clients", "/client-submission"]`. Coverage:
- All `/coach/*` routes -> covered by `/coach` prefix. OK.
- `/client-submission/:userId` -> covered. OK.
- `/coach/clients/:clientUserId` (Client Overview shell) -> covered by `/coach/clients` prefix. OK.

No coach-side gap in dock coverage spotted in this pass.

**Sidebar label mapping** (`CoachSidebar.tsx:182`): `getCoachMobileNavItems()` runs items through a `MOBILE_LABELS` map (e.g., "coach-dashboard" -> "Home", "coach-clients" -> "Clients") to shorten labels for the dock. Independent of `routeConfig.ts` labels -- means a label change in the registry doesn't propagate to the mobile dock automatically. **P3 polish:** consider deriving mobile labels from registry instead of a parallel map.

### B6. Polish items (P3)

- `ClientOverviewNav.tsx:39` -- `useUnreadMessageCount()` called at top level without memoization. Re-fires every parent re-render; brief badge flicker possible during tab switches. Wrap in `useMemo` or move to a stable parent.
- `ClientOverviewNav.tsx:58` -- arrow-key tab navigation doesn't wrap (right-arrow on last tab is a no-op, left-arrow on first tab is a no-op). Accessibility convention is to wrap.
- `ClientOverviewTabs.tsx:41` -- invalid `?tab=<slug>` deep links silently render Overview. Consider rendering a "tab not found" hint, or 302-redirect to the canonical slug.
- `src/components/coach/EnhancedCapacityCard.tsx:214` -- visible "TODO: Add edit limits link when coach has permission" in code.

### B7. CLAUDE.md compliance (coach surface)

Spot-checked the highest-risk patterns:
- **No nested PostgREST FK joins on `client_programs` / `subscriptions` / `profiles`** in coach surface code paths. `CoachMyClientsPage` uses separate queries + `Promise.all`. Compliant.
- **`{ error }` destructuring** on mutations -- checked in `CoachMyClientsPage`, `CoachProfile`. Compliant.
- **`pb-24 md:pb-8`** -- present on `CoachDashboard`, `CoachClientOverview`, `CoachMyClientsPage`. Compliant.
- **No "Dr Iron" / hardcoded admin email** in any coach surface file. Clean.
- **Coach column-ownership refactor (CLAUDE.md Phase 1)**: spot-checked `CoachProfile.tsx` -- writes go to `coaches_public` (canonical for profile fields). Did not deep-audit every coach surface for deprecated-column writes; that's a refactor-specific audit, not a prelaunch one. If you want it, I can run a targeted grep.

Overall: coach surface is in better shape than client surface from a pattern-compliance standpoint. Most findings are polish, cleanup, or live-walkthrough verification items.

---

## Phase C -- Admin surface

### C1. Route inventory

15 nav-visible sections (resolved via `/admin/:section` catchall to `AdminDashboard.tsx` which switches on the param) + 11 hidden dev pages + 1 top-level admin route (`/testimonials-management`). Every admin route is gated by `RoleProtectedRoute requiredRole="admin"`. Verified -- no unprotected admin URLs.

Mobile dock for admin shows **4 items**: Home, Clients, Coaches, Billing (`AdminSidebar.tsx:131-147` via `getAdminMobileNavItems()`). All `/admin/*` routes covered by the dock-prefix check in `App.tsx:174-178`.

### C2. Route disambiguation -- three duplicate / similar URL pairs

| Pair | Render | Verdict |
|------|--------|---------|
| `/admin/system-health` (nav-visible) vs `/admin/health` (direct, hidden) | Both render `SystemHealth.tsx`. | **P3 cleanup.** Delete `/admin/health` route from `App.tsx:279`. |
| `/admin/email-manager` (nav-visible) vs `/admin/email-log` (direct, hidden) | `email-log` is a 12-line redirect stub -> `email-manager`. `EmailManagerPanel` has Catalog (template registry) + Log (delivery history) tabs. | **P3 cleanup.** Retire `EmailLog.tsx` + the `App.tsx:273` route when convenient. Currently harmless (redirect works). |
| `/admin/security` (registry, hidden, order 21) vs `/admin/security-checklist` (direct, hidden) | **Different components.** `/admin/security` -> `SecurityChecklist.tsx` via `AdminDashboardLayout`'s switch. `/admin/security-checklist` -> `SecurityHardeningChecklist.tsx` (separate page). Both hidden from nav. | **P2 disambiguate.** Two distinct security checklists with near-identical names is a footgun for the dev team. Rename one or consolidate. Recommend deciding which is canonical, then redirect the other. |

### C3. Coach lifecycle UI -- compliant with CLAUDE.md Phase 1

`src/components/CoachManagement.tsx` is the admin coach-lifecycle UI. Verified:
- Edit (line 196) and Activate (line 294) write through `upsert_coach_full()` RPC. Compliant with the column-ownership refactor.
- Delete (line 319) routes through the `delete-account` edge function (correct cascade).
- Reads from `coaches_full` view; writes via RPC. Read/write paths aligned.
- `Promise.all` for batch client-count queries (line 136). No sequential-await loops.
- `sanitizeErrorForUser` on toasts (lines 172, 312, 394).
- No direct `coaches.update()` / `coaches_public.update()` / `coaches_private.update()` bypassing the RPC.

No findings here -- this is the reference pattern for admin coach writes.

### C4. Other admin component highlights

| Component | Notes |
|-----------|-------|
| `AdminBillingManager.tsx` | Hardcoded admin email at line 362 -- **fix in flight** (see TL;DR row 1a). |
| `ExerciseLibraryManager.tsx` | CRUD for `exercise_library`, movement patterns, muscle groups, tags. Bulk tagging via `SpecializationTagManager`. Video URL preview. Empty state not explicitly verified -- check in live walkthrough. |
| `SiteContentManager.tsx` | Lets admins edit `site_content` rows directly. This is where the Dr Iron rewrite could ALSO have been done manually (instead of via migration). **No hardcoded "Dr. Iron" strings in the component itself.** Worth knowing -- if anyone ever runs the rebrand migration as a no-op, they can edit the row here. |
| `SecurityChecklist.tsx` | Preflight security validations (HTTPS, CORS, sensitive-field exposure, etc.). One placeholder CVE number string at line 184 ("CVE-2024-XXXXX patched") -- shown verbatim in admin UI. **P3.** |
| `EmailManagerPanel.tsx` (with `EmailCatalogTab` + `EmailLogTab`) | Catalog = template registry; Log = delivery history. Correctly separated. |

### C5. Hidden dev pages (showInNav: false)

11 routes reachable by URL only:
- `/admin/pre-launch` -- Pre-Launch Check
- `/admin/security` -- Security Checklist (see C2)
- `/admin/phi-audit` -- PHI Access Audit Log
- `/admin/launch-checklist` -- Launch Test Checklist
- `/admin/debug/roles` -- Roles Debug
- `/admin/diagnostics` + `/admin/diagnostics/site-map` -- Diagnostics
- `/admin/client-diagnostics` -- Client Diagnostics
- `/admin/email-log` -- redirect stub (see C2)
- `/admin/security-checklist` -- Security Hardening (see C2)
- `/admin/workout-qa` -- Workout Builder QA

All are dev / launch / debug utilities. None render placeholder copy or show "coming soon" stubs (other than the SecurityChecklist CVE placeholder noted above).

### C6. Pattern compliance summary (admin surface)

- **No nested PostgREST FK joins on `client_programs` / `subscriptions` / `profiles`** in admin code.
- **`{ error }` destructure** on mutations: present.
- **`.maybeSingle()` vs `.single()`**: correctly used.
- **`Promise.all` for parallelizable RPCs**: used in `CoachManagement` and others.
- **`sanitizeErrorForUser` on user-facing toasts**: consistent.
- **Role gating**: every admin route wrapped in `RoleProtectedRoute requiredRole="admin"`. Verified.
- **Strict role isolation**: `AdminSidebar.tsx:119` comment explicitly notes "Coach pages removed -- STRICT role isolation. Admins must use separate coach account." Matches CLAUDE.md.
- **`upsert_coach_full` RPC usage**: 100% in `CoachManagement`. No direct writes to deprecated coach columns.

Admin surface is the most pattern-compliant of the three. No P0/P1 findings beyond the AdminBillingManager email leak already addressed.

---

## Phase D -- Cross-cutting

### D1. Branding sweep -- full repo

Greps run: `Dr\.?\s*Iron|dr[-_.]?iron|DrIron` across all paths.

**User-facing copy (P0/P1):**
- `site_content` rows -- 3 hits, see TL;DR row 1.
- Email templates (`supabase/functions/_shared/`) -- **clean**. EMAIL_FROM constants all use `IGU ...` + `@mail.theigu.com`. No "Dr Iron" in any edge function template.

**Code-level hits (P1):**
- `supabase/functions/create-manual-client/index.ts:222` -- hardcoded `dr.ironofficial@gmail.com`. Server-side only (edge function), so no bundle leak. Still brittle -- a server config row or env var is cleaner.
- `src/components/admin/AdminBillingManager.tsx:362` -- **same hardcoded email, shipped to client bundle**. Admin email leaks to any user who downloads the production JS. Replace with a server-side check.

**Internal-only / acceptable hits:**
- `README.md:24` -- git clone URL `https://github.com/DrIron/IGU-The-Intensive-Gainz-Unit.git`. Dev-only.
- `CLAUDE.md` -- documents the branding rule itself.
- `docs/IGU_Discovery_Report.md:11` -- internal audit doc, not user-facing.
- `supabase/migrations/20260420110000_backfill_exempt_coach_id.sql:8,30` -- one-time backfill comment + WHERE clause exempting Hasan's coach record. Already applied, fine.

### D2. Route registry drift (`routeConfig.ts` vs `App.tsx`)

`routeConfig.ts:13` claims SSOT. Audit finds **11 routes in `App.tsx` that are NOT in `ROUTE_REGISTRY`**:

| Path | App.tsx line | Status |
|------|-------------|--------|
| `/waitlist` | 216 | Missing from registry -- public pre-launch route |
| `/email-pending` | 220 | Missing -- post-signup confirmation page |
| `/coach/studio-preview` | 229 | Missing -- coach-only feature |
| `/coach/clients/:clientUserId` | 230 | Missing -- the 8-tab Client Overview shell; `coach-section` catchall would route to wrong component without this explicit entry. Critical to add. |
| `/onboarding/medical-review` | 235 | Missing -- only `/onboarding` base is registered |
| `/onboarding/awaiting-approval` | 236 | Missing |
| `/onboarding/payment` | 237 | Missing |
| `/teams` | 256 | Missing -- public team-plan landing |
| `/coach-client-nutrition` | 264 | Intentionally not in registry (comment says redirect-only stub). OK. |
| `/admin/email-log` | 273 | Verified: `EmailLog.tsx` is a 12-line redirect stub (`navigate("/admin/email-manager", { replace: true })`). Old bookmark friendly. **Lower-severity than originally flagged** -- it's working as intended; just retire the direct route when convenient. |
| `/admin/health` | 279 | Duplicate of registered `admin-system-health` at `/admin/system-health`. Same `SystemHealth` component reachable at two URLs. |

Impact: `SiteMapDiagnostics` (admin diagnostic page) reads from `routeConfig.ts` and will under-report. Bookmarks may rot quietly. **Severity: P2** -- cosmetic for users, breaks the SSOT contract.

### D3. Exercise library -- the three reading paths

Single source of truth: `exercise_library` table (107 seeded movements per CLAUDE.md). Legacy `exercises` table also read by admin's `WorkoutLibraryManager` for back-compat.

| Surface | File(s) | Purpose |
|---------|---------|---------|
| Admin -- manage | `src/components/admin/ExerciseLibraryManager.tsx`, `ExerciseQuickAdd.tsx`, `src/components/WorkoutLibraryManager.tsx` | CRUD over `exercise_library` + legacy `exercises` |
| Coach -- pick | `src/components/coach/ExerciseLibrary.tsx`, `programs/ExercisePickerDialog.tsx`, `programs/EnhancedModuleExerciseEditor.tsx`, `programs/DirectSessionExerciseEditor.tsx`, `programs/muscle-builder/ConvertToProgram.tsx` | Add exercises into programs, modules, direct sessions, muscle-plan conversion |
| Client -- view + log | `src/pages/WorkoutLibrary.tsx`, `src/pages/client/ExerciseHistory.tsx`, `src/pages/client/WorkoutSessionV2.tsx`, `src/components/client/EnhancedWorkoutLogger.tsx`, `src/hooks/useVolumeTracking.ts`, `src/hooks/useProgressionSuggestions.ts` | Browse, log sets, see history |

**Findings:**

- Three-way separation is clean. No layering violations spotted in this pass.
- **Known pending task per CLAUDE.md:** `setup_instructions` column on `exercise_library` is null for all ~362 exercises; cardio/mobility/warmup (sections 19-21) have no `movement_patterns` rows. Already tracked in CLAUDE.md; not re-listing as a new finding.

### D4. Educational pathways

Two distinct surfaces:

| Surface | Route | Audience | Backing |
|---------|-------|----------|---------|
| Coach Training | `/admin/coach-training` | Admin manages (`AdminDashboard` section), coaches consume | Not deep-audited yet -- TODO Phase B/C |
| Educational Videos | `/educational-videos` | Clients | `educational_videos` table via RPC `get_educational_videos_with_access` |

**`/educational-videos` finding:** `EducationalVideos.tsx:306` renders empty-state copy "Educational videos are coming soon" when the RPC returns 0 rows. The route is in the client mobile dock + sidebar (nav order 6). If launch traffic hits this and the table is empty, users see a stub page with the nav entry still highlighting it.

**Decision needed before launch:**
- (a) Seed at least 1 video before launch, OR
- (b) Hide the nav entry until content exists (gate via a `feature_flags` row or a count check on the RPC).

Not deep-audited: how admin uploads videos, whether the table has any rows in prod today. Live walkthrough will confirm.

### D5. Hardcoded contact + dead-link sweep

`mailto:support@theigu.com` -- 5 hits, all consistent and pointing at the canonical support address:
- `src/pages/Index.tsx:367, 391`
- `src/pages/onboarding/MedicalReview.tsx:189`
- `src/components/ui/error-fallback.tsx:51`
- `src/components/GlobalErrorBoundary.tsx:92`
- `src/components/client/CancelledSubscriptionCard.tsx:40`

Clean. No `tel:`, no `wa.me/`, no hardcoded phone numbers anywhere in `src/`. WhatsApp is DB-driven (`coaches_private.whatsapp_number`).

### D6. Real TODO / FIXME markers

Excluding comments that just *mention* TODO patterns in unrelated context:

| File:line | Note |
|-----------|------|
| `src/components/admin/SecurityChecklist.tsx:184` | "jspdf upgraded to ^4.0.0 (CVE-2024-XXXXX patched)" -- placeholder CVE number, displayed in admin security UI |
| `src/components/client-overview/tabs/NutritionTab.tsx:43` | "TODO: completed phases not visible from the shell. Legacy..." |
| `src/components/coach/EnhancedCapacityCard.tsx:214` | "TODO: Add edit limits link when coach has permission" |

Severity: all P3, cosmetic / future-work markers.

### D7. `pb-24` mobile-dock-spacing audit

CLAUDE.md rule: "All layout content areas must use `pb-24 md:pb-8`" because the global mobile dock is `h-16`. Grep confirms 25/28 standalone pages have at least one of `pb-24` / `pb-16` / `min-h-screen`. Files that did NOT match the broad grep:

- `src/pages/Waitlist.tsx`
- `src/pages/TeamsPage.tsx`

Both are public routes -- mobile dock doesn't render on them (no role gate). Probably fine, but a manual visual check in the live walkthrough will confirm no awkward whitespace at the bottom of either.

---

## Phase E -- Live walkthrough (production, theigu.com)

Run against **production** (not dev server) on Hasan's logged-in coach session, read-only sweep, 2026-05-13. Resolution: 1440x754. Mobile-width audit not verifiable (browser ignored programmatic resize; deferred to user self-check).

### E1. **P0 -- Sentry DSN is broken in production**

Browser console fires this on every page navigation:

```
[ERROR] Invalid Sentry Dsn: https://83c5d33453db27cb12b872be6d9b4dd0@o4510780833923072.ingest.de.   sentry.io/4510786489352273
```

**Two spaces between `de.` and `sentry.io`.** Sentry's URL parser rejects it as invalid, which means **every captured exception in production is going into the void**. Reproduced 7 times across navigations in this walkthrough (one per page load).

**Root cause:** `VITE_SENTRY_DSN` env var on Vercel has trailing/internal whitespace. The build inlines it verbatim into the bundle (`index-hreIq2_k.js:29:17224`).

**Fix:**
1. Vercel Dashboard -> Settings -> Environment Variables -> edit `VITE_SENTRY_DSN`
2. Remove the whitespace
3. Redeploy

This is the highest-priority launch blocker found in the audit. CLAUDE.md flags Sentry as a non-negotiable (static import, never lazy-loaded). The integration code is fine; the env var is the only thing wrong.

### E2. Verified working on coach surface

- **Branding clean** -- IGU logo top-left, no "Dr Iron" leaks visible on any route walked. (Public homepage verification still pending -- coach session intercepts theigu.com.)
- **/coach dashboard** -- capacity grid, today's tasks, my teams, compensation card all render with real data. "Senior" + "Head Coach" badges visible.
- **/coach/clients** -- queue groupings (Pending Approvals / Awaiting Payment / Active Clients) render, search + filter present, 6 active clients listed with service tier pills.
- **/coach/clients/:clientUserId** (Client Overview shell) -- 8-tab left rail loads, emerald active-rail visual works, URL syncs to `?tab=<slug>` correctly.
  - Overview tab: phase card + last workout + last weigh-in trio.
  - Nutrition tab: phase hero with kcal hero number, macro ribbon (red/yellow/blue P/F/C), expected/actual row, 3-tab inner (Overview / Adjustments / History) -- matches the CLAUDE.md spec exactly.
  - Messages tab: empty state "No messages yet. Say hi to start the conversation." + composer with "Cmd/Ctrl + Enter to send" hint -- matches docs.
- **/coach/programs** -- Macrocycles / Mesocycles / Drafts tabs; Create Mesocycle CTA. One mesocycle visible.
- **/coach/teams** -- 2 teams rendered with tag pills, member counts, "No program assigned" empty state.
- **No 4xx / 5xx network errors** observed during navigation.

### E3. Findings (live walkthrough)

| Sev | File / Route | Finding |
|-----|--------------|---------|
| **P0** | Vercel env var | Sentry DSN has whitespace -- prod errors not captured. See E1. |
| **P2** | All `/coach/*` routes | `document.title` is static at **"Coach Dashboard \| Intensive Gainz Unit"** regardless of route. Programs, Teams, Exercise Library, etc. all share the same title. `react-helmet-async` is in the stack but evidently not applied to coach subroutes. **Tab switcher / bookmarks / browser history all look identical.** Client Overview shell uses **"Intensive Gainz Unit Coaching"** instead -- yet another inconsistency. |
| **P2** | `/coach/teams` | Header says **"2 of 3 teams"** but only 2 team cards rendered. Either pagination is broken (3rd team off-screen, no "load more"), or the count label is buggy. Worth a code check. |
| **P2** | Dashboard `/coach` | **"6 Active Clients"** in top stat tile vs **"5 Active Clients"** in the My Capacity panel. Difference appears to be self-clients (Hasan Dashti shows up as both coach AND a client in his own queue). Not a bug, but the discrepancy isn't explained to the coach. Either reconcile the two numbers or footnote the capacity panel. |
| **P3** | `/coach/clients/:id` header | **"Active" status badge renders red/destructive-colored** (same emerald-rail design language uses red elsewhere for warnings). Convention: green/emerald for positive status. Verify in `src/components/client-overview/...` -- likely a Badge variant misuse. |
| **P3** | `/coach/clients` | **"Educational Videos"** appears in Quick Actions on the coach My Clients page. That route (`/educational-videos`) is conceptually a **client-facing** content surface per `routeConfig.ts:144` (navGroup: "client"). Why is it surfacing as a coach Quick Action? Verify it isn't a dead/wrong link. |
| **P3** | `/coach/exercises` | Page sat on **"Loading exercises..."** at the 2-second screenshot mark. Either the query is slow (`exercise_library` is 107 rows + maybe joins), or the loading state lacks a timeout fallback. Verify TTFB on the underlying query. |
| **P3** | `/coach/programs` | One visible mesocycle named **"Classic Series (C with a T)..."** -- looks like a test / placeholder name. If real prelaunch data, fine; if test data, scrub before launch. |

### E3b. **Waitlist mode is ON in production**

Navigating to https://www.theigu.com/ redirects to `/waitlist`. The site is showing a "Coming Soon" page with a Name + Email signup form to all visitors. **This means the entire public marketing surface (including the rebranded In-Person copy) is currently behind the waitlist gate.**

The /waitlist page itself renders cleanly: IGU branding top-center, "THE INTENSIVE GAINZ UNIT" hero with red "GAINZ UNIT" emphasis, "Coming Soon" headline, waitlist form, "Join the Waitlist" CTA. Page title "Join the Waitlist | IGU". No Dr. Iron leaks. Good.

**Caveat:** Per the `WaitlistGuard.tsx` comment ("redirects **unauthenticated** visitors when waitlist mode is on"), authenticated users should pass through to the Index page. But I'm logged in as a coach and was still redirected to `/waitlist` -- either the documented behavior is wrong, or `Index.tsx` has its own redirect for logged-in users, or some other guard is intervening. Worth a code check.

**Implications for this audit:**
- The rebranded homepage In-Person copy ("your assigned coach at their available gym locations in Kuwait") cannot be visually verified until waitlist mode is flipped off. The DB row IS updated (migration applied), so it will render correctly when waitlist mode comes down.
- Pre-launch: confirm intent. If waitlist mode is meant to stay on until launch day, that's fine. If it's accidentally on, flip via admin Site Content or directly: `UPDATE waitlist_settings SET is_enabled = false;`.

### E4. Cannot verify in this pass

- **Public homepage Dr. Iron rebrand (QW-1 close-out)** -- Hasan's coach session intercepts theigu.com -> /coach. Need incognito window. See self-check QA below.
- **Mobile responsive layout** -- the Chrome extension's `resize_window` was ignored (window stayed at 1440x754). Mobile dock, sticky-rail-vs-pill-scroller, drawer-vs-dialog branching all unverified.
- **Client surface (`/dashboard`, `/nutrition`, `/messages`, etc.)** -- no client account available.
- **Admin surface (`/admin/*`)** -- not logged in as admin.
- **`AdminBillingManager.tsx` post-deploy verification** -- depends on the pending `git push` to ship the frontend RPC swap.

### E5. Self-check QA script (for you to run)

Below is the punch list to clear what I couldn't reach. Paste back any anomaly or just say "all clean" per row.

**Block 1 -- Public surface verification (incognito window, theigu.com):**

1. Open theigu.com in **incognito**. Confirm homepage loads (or waitlist gate if waitlist mode is on).
2. Scroll to the In-Person service card / section. **Confirm the description reads "your assigned coach at their available gym locations in Kuwait"** (closes QW-1).
3. Scroll to the footer. **Confirm "Dr. Iron International Sports Consultancy" still appears in the about/copyright** (intentional retain).
4. Open DevTools console. **Confirm the Sentry DSN error also fires for logged-out visitors** (likely yes -- it's a build-time inline).

**Block 2 -- Mobile responsive (real phone or DevTools device mode):**

5. Load /coach on a real phone or DevTools 390px width. Confirm:
   - Sidebar collapses to a hamburger or hidden
   - Mobile bottom dock renders at the bottom (`h-16`, fixed)
   - Last visible content above the dock has `pb-24` worth of clearance
6. Open a Client Overview shell on mobile. **Confirm the left rail collapses to a horizontal pill scroller** (per CLAUDE.md docs).
7. Open `/coach/clients/:id?tab=nutrition` on mobile. **Confirm the 3-tab inner row stays usable** (Overview / Adjustments / History).
8. Open Messages tab on mobile. **Confirm the composer becomes a vaul `Drawer` (bottom sheet)** rather than the inline textarea I saw on desktop.

**Block 3 -- Client surface (if you have a test client login):**

9. Sign in as a test client. Walk `/dashboard`, `/nutrition`, `/messages`, `/educational-videos`. Confirm:
   - All routes render without console errors (besides the known Sentry DSN one)
   - `/educational-videos` -- is there actual content, or the "coming soon" empty state? (closes QW-16)
   - `/nutrition` tab state -- if you switch tabs, does the URL update with `?tab=...`? (closes QW-8)

**Block 4 -- Admin surface (need admin login):**

10. Sign in as admin. Walk `/admin/dashboard`, `/admin/coaches`, `/admin/billing`, `/admin/site-content`. Confirm:
    - `/admin/site-content` -- the In-Person description row now shows the rebranded copy. (Cross-check with E5 step 2.)
    - `/admin/security` and `/admin/security-checklist` -- are these visibly different pages or accidental duplicates? (closes QW-15)
11. `/admin/billing` -- toggle a test client to "payment exempt" and back. Confirm no error toast. The path now goes through the new RPC; if the RPC fails, that's a smoke-test miss. **Only do this on a test client; not on real billing data.**

Once you've run these and pasted back results, I'll write a Phase F "post-walkthrough quick-wins update" with anything new and call the audit complete.

---

## Quick wins -- triaged

Effort tiers: **XS** = single-file, < 15 min. **S** = single PR, < 1 hr. **M** = decision or design call, < 2 hr. **L** = live-walkthrough verification, time depends. **D** = decision only, no code.

### In flight (awaiting push)

| ID | Sev | Effort | Item | Status |
|----|-----|--------|------|--------|
| QW-1 | P0 | -- | Dr. Iron in homepage In-Person description -> `20260513120000_rebrand_inperson_description.sql` | **Applied to remote 2026-05-13.** Confirm visible on theigu.com. |
| QW-2 | P1 | -- | Admin email leak in `AdminBillingManager.tsx` -> `20260513130000_admin_coach_lookup_rpc.sql` + frontend swap | **DB applied; frontend deploy pending.** RPC live, but `AdminBillingManager.tsx` change is local-only -- bundle still leaks the email until `git push` to main triggers Vercel. |
| **QW-0** | ~~**P0**~~ **resolved** | XS | Sentry DSN whitespace in Vercel env var. **Stripped + Vercel auto-redeployed 2026-05-13. Verified zero errors post-deploy.** |
| QW-23 | P2 | S | `document.title` is dynamic on **public pages** (`/services` -> "Coaching Services \| Intensive Gainz Unit" ✓) but **static across `/coach/*`** (always "Coach Dashboard \| Intensive Gainz Unit"). Client Overview shell uses yet another static title ("Intensive Gainz Unit Coaching"). `react-helmet-async` works -- it's just not wired on authenticated routes. | Add `<Helmet><title>...</title></Helmet>` to each `/coach/*` page, or move to a per-route helper that reads from `routeConfig.ts` label. |
| QW-24 | P2 | S | `/coach/teams` shows "2 of 3 teams" but only 2 cards render. Either pagination is missing a "load more" or the count label is buggy. | Inspect the teams query / count source. |
| QW-25 | P2 | S | `/coach` dashboard shows "6 Active Clients" stat vs My Capacity panel "5 Active Clients" -- self-clients excluded from capacity but not surfaced. | Either reconcile the two numbers or footnote the capacity panel ("excludes coach self-clients"). |
| QW-26 | P3 | XS | Client Overview header "Active" status badge renders red/destructive-colored. Convention: green for positive status. | Check Badge variant in `src/components/client-overview/...` -- swap to `success` / emerald. |
| QW-27 | P3 | XS | "Educational Videos" Quick Action surfaces on the coach `/coach/clients` page. `/educational-videos` is a `navGroup: "client"` route per registry. | Verify intent: is this a coach-can-also-watch resource? If yes, label it clearly. If no, remove from coach quick actions. |
| QW-28 | P3 | S | `/coach/exercises` sat on "Loading exercises..." past the 2-second screenshot mark. | Profile the underlying `exercise_library` query (107 rows seeded; joins could slow it). Add a timeout fallback / skeleton if not already present. |
| QW-29 | P3 | D | One visible mesocycle is named "Classic Series (C with a T)..." -- looks placeholder. | Confirm with you whether to keep or scrub before launch. |
| QW-30 | P1 | D | **Waitlist mode is currently ON in production.** Navigating to `/` redirects to `/waitlist`. Public marketing surface (including the just-rebranded In-Person copy) is hidden behind the gate. | Decision: keep waitlist on until launch day (likely intentional), or flip off now via admin Site Content / direct DB update. |
| QW-31 | P2 | S | **`WaitlistGuard` behavior differs from documented intent.** Comment says "redirects **unauthenticated** visitors when waitlist mode is on", but authenticated coach session also got redirected to `/waitlist`. Either `Index.tsx` has its own redirect or another guard intervenes. | Trace the actual redirect source. Either fix the guard logic, fix `Index.tsx`, or update the comment to match real behavior. |

### Trivial deletes (XS)

| ID | Sev | Effort | Item | Action |
|----|-----|--------|------|--------|
| QW-3 | P3 | XS | `/coach/pending-clients` is a 45-line redirect stub. `PendingClientsPage.tsx`. | Delete the file, the registry entry (`routeConfig.ts:121`), and the route in `App.tsx:269`. Optionally leave a one-line `<Navigate to="/coach/clients" replace />` redirect for old bookmarks. |
| QW-4 | P3 | XS | `/admin/health` duplicates `/admin/system-health`. Same component (`SystemHealth.tsx`). | Delete the route at `App.tsx:279`. Registry doesn't have it. |
| QW-5 | P3 | XS | `/admin/email-log` is a 12-line redirect stub to `/admin/email-manager`. `EmailLog.tsx`. | Delete the file + the route at `App.tsx:273`. (Or leave for legacy bookmarks; harmless.) |
| QW-6 | P3 | XS | `SecurityChecklist.tsx:184` displays placeholder string `"CVE-2024-XXXXX patched"` in admin UI. | Either fill in the actual CVE number jspdf 4.0.0 patched, or strip the parenthetical. |

### Small fixes (S)

| ID | Sev | Effort | Item | Action |
|----|-----|--------|------|--------|
| QW-7 | P1 | S | `sanitizeErrorForUser` missing on toasts at `WorkoutLibrary.tsx:109` and `Nutrition.tsx:96`. `ClientNutrition.tsx` uses `console.warn` only -- no user toast at all. | Wrap each error in `sanitizeErrorForUser()` before `toast.error()`. ~3 sites. |
| QW-8 | P2 | S | Tab state not URL-synced on `/nutrition` and `/nutrition-client`. Back-button + deep-links lose tab. `/nutrition-team` shows the pattern (`?tab=...`). | Copy the `searchParams` pattern from `TeamNutrition.tsx` into `ClientNutrition.tsx`. |
| QW-9 | P2 | S | `WorkoutCalendar` + `ExerciseHistory` have no empty-state copy when a filter or selection yields no data. | Add "No exercises logged yet" / "No modules on this day" fallback rendering. ~2 small JSX additions. |
| QW-10 | P2 | S | Register 11 drift routes in `routeConfig.ts` per Phase D2. **Most important**: `/coach/clients/:clientUserId` (the Client Overview shell) -- without an explicit entry it's invisible to `SiteMapDiagnostics`. | Add `RouteConfig` entries; mark hidden dev/redirect routes as `showInNav: false`. |
| QW-11 | P3 | S | 2 real TODO comments in code: `NutritionTab.tsx:43` (completed-phases not visible), `EnhancedCapacityCard.tsx:214` (edit-limits link gated by permission). | Either implement or convert to backlog tickets. |
| QW-12 | P3 | S | `ClientOverviewNav.tsx` polish: `useUnreadMessageCount` not memoized (badge flicker on re-render); arrow-key tab navigation doesn't wrap; invalid `?tab=<slug>` silently renders Overview. | Add `useMemo` for badge value; wrap arrow-key index; render a "tab not found" nudge or 302 to canonical slug. |
| QW-13 | P3 | S | Type-safety debt: `ClientNutrition.tsx:54-64` has 3 `@typescript-eslint/no-explicit-any` suppressions on state. `AccountManagement.tsx:72` has `useState<any>(null)`. | Type the state -- `NutritionPhase`, `UserProfile`. Not a launch blocker. |

### Decisions / design calls (D)

| ID | Sev | Effort | Item | Decision needed |
|----|-----|--------|------|-----------------|
| QW-14 | P2 | D | `/coach/studio-preview` -- file comment explicitly says "Delete if rejected". Currently dead-weight. | **Ship it or delete it?** If shipping, wire to the reducer + real data. If not, delete `StudioPreview.tsx` + `App.tsx:229` route. |
| QW-15 | P2 | D | `/admin/security` vs `/admin/security-checklist` are two different components with near-identical names (`SecurityChecklist.tsx` vs `SecurityHardeningChecklist.tsx`). Both hidden from nav. | Pick canonical; redirect the other. Or merge content. |
| QW-16 | P2 | D | `/educational-videos` falls back to "Educational videos are coming soon" if RPC returns 0 rows. Route is in client mobile dock + sidebar. | Seed at least 1 video before launch, OR feature-flag the nav entry off until content exists. |

### Live-walkthrough verification items (L)

These are claims from the static pass that need real-browser confirmation. Will resolve during Phase E.

| ID | Sev | Effort | Item |
|----|-----|--------|------|
| QW-17 | P2 | L | `CoachDashboardLayout.tsx:54` training-mode race -- new coach signing in for the first time should land in training mode without flashing the full dashboard. |
| QW-18 | P2 | L | `CoachClientOverview.tsx:51` `Promise.all` -- impersonate a coach loading a client they don't have access to. Page should degrade gracefully, not hard-error. |
| QW-19 | P3 | L | `PaymentReturn.tsx` 3-second auto-redirect vs manual "Continue" click race. Verified safe in code; worth a click. |
| QW-20 | P3 | L | `Waitlist.tsx` and `TeamsPage.tsx` -- no `pb-24` found in static grep. Public routes (no mobile dock) but worth a visual check for awkward bottom whitespace. |
| QW-21 | P2 | L | `AccountManagement.tsx` coach-change dropdown -- verify a team-plan member (no 1:1 coach assignment) cannot meaningfully use the coach-change dropdown. Server-side RLS should block; client-side gating is the live-test target. |
| QW-22 | P3 | L | `ClientSidebar` unread-message badge -- if the `get_unread_message_count` RPC errors, does the sidebar render gracefully (no badge) or break? |

### Excluded from quick wins (out of scope this session)

- **i18n coverage** -- deferred per user 2026-05-13. Arabic translation work hasn't started.
- **Exercise library `setup_instructions`** for ~362 movements -- already tracked as a known pending task in CLAUDE.md.
- **Cardio/Mobility/Warmup `movement_patterns` rows** -- same as above.
- **Coach column-ownership refactor Phase 3** -- mid-flight, not a prelaunch concern (Phase 1 complete; Phase 2 is the soak window).
- **Pre-existing migration drift** (the scratch folders) -- known to user, tracked separately in memory.

### Suggested order of attack

1. **Push QW-1 + QW-2 migrations** (2 minutes). Closes the only P0 and P1 in the audit.
2. **QW-3 through QW-6** in one PR (15 minutes total). Pure delete; no risk.
3. **QW-7** (sanitize errors, 30 min).
4. **QW-14, QW-15, QW-16** decisions (15-30 min of discussion / data check).
5. **Phase E live walkthrough** to clear QW-17 through QW-22.
6. **QW-8 through QW-13** as a polish pass post-launch unless the live walkthrough surfaces real user impact.

