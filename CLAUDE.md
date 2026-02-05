# IGU - The Intensive Gainz Unit

## Project Overview

IGU is a fitness coaching platform connecting coaches with clients. It handles:
- Client onboarding and intake forms
- Workout programming and tracking
- Payment processing (Tap Payments)
- Medical/health questionnaires (PAR-Q)
- Coach-client relationship management

**Production URL**: https://theigu.com

---

## Tech Stack

### Frontend
- **Framework**: React 19 + TypeScript
- **Build**: Vite 5
- **Styling**: Tailwind CSS + shadcn/ui components
- **Routing**: React Router DOM v6
- **State**: TanStack Query (React Query)
- **Forms**: React Hook Form + Zod validation
- **Drag & Drop**: @hello-pangea/dnd (exercise reordering)

### Backend
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Edge Functions**: Supabase Functions (Deno)
- **File Storage**: Supabase Storage

### Infrastructure
- **Hosting**: Vercel
- **Error Tracking**: Sentry
- **Email**: Resend
- **Payments**: Tap Payments (Kuwait/GCC region)

---

## Project Structure

```
/
├── src/
│   ├── auth/                 # Auth utilities and role definitions
│   │   ├── roles.ts          # CANONICAL role/permission definitions
│   │   └── onboarding.ts     # Client onboarding state machine
│   ├── components/
│   │   ├── ui/               # shadcn/ui components
│   │   ├── admin/            # Admin-specific components
│   │   ├── coach/            # Coach-specific components (incl. programs/*)
│   │   ├── client/           # Client-specific components (incl. EnhancedWorkoutLogger)
│   │   ├── layouts/          # Layout components (PublicLayout, etc.)
│   │   ├── AuthGuard.tsx     # Auth-only route protection
│   │   ├── RoleProtectedRoute.tsx  # Role-based route protection
│   │   ├── OnboardingGuard.tsx     # Onboarding flow enforcement
│   │   ├── PermissionGate.tsx      # Feature-level permission checks
│   │   └── GlobalErrorBoundary.tsx # Error boundary with Sentry
│   ├── hooks/                # Custom React hooks (incl. useColumnConfig, useProgramCalendar, useExerciseHistory)
│   ├── integrations/
│   │   └── supabase/         # Supabase client and generated types
│   ├── lib/
│   │   ├── routeConfig.ts    # CANONICAL route registry
│   │   ├── payments.ts       # Payment utilities and types
│   │   ├── errorLogging.ts   # Structured error logging (Sentry integration)
│   │   └── utils.ts          # General utilities (cn, etc.)
│   ├── pages/                # Route page components
│   │   ├── admin/            # Admin pages
│   │   ├── coach/            # Coach pages
│   │   ├── client/           # Client pages
│   │   └── onboarding/       # Onboarding flow pages
│   ├── App.tsx               # Main app with route definitions
│   └── main.tsx              # Entry point (Sentry init)
├── supabase/
│   ├── functions/            # Edge Functions
│   │   ├── create-tap-payment/
│   │   ├── tap-webhook/      # Payment webhook handler
│   │   ├── verify-payment/
│   │   ├── send-coach-application-emails/  # Coach app confirmation (no JWT)
│   │   └── _shared/          # Shared utilities
│   ├── migrations/           # Database migrations (version controlled)
│   └── config.toml           # Supabase CLI config
├── .github/
│   ├── workflows/ci.yml      # CI pipeline (lint, typecheck, test, build)
│   └── dependabot.yml        # Security updates
└── vercel.json               # Vercel SPA routing config
```

---

## Key Concepts

### 1. Role-Based Access Control (RBAC)

Roles are defined in `src/auth/roles.ts`:
- `admin` - Full access, can manage everything
- `coach` - Can manage assigned clients, view workouts
- `client` - Can view own data, complete workouts

```typescript
// Check roles
import { hasRole, isAdmin, getPrimaryRole } from '@/auth/roles';

// Permission checks
import { hasPermission, PermissionKey } from '@/auth/roles';
hasPermission(roles, 'view_phi'); // PHI access check
```

### 2. Route Protection

Three-layer protection system:

```typescript
// 1. AuthGuard - requires login only
<AuthGuard>
  <SomePage />
</AuthGuard>

// 2. RoleProtectedRoute - requires specific roles
<RoleProtectedRoute allowedRoles={['admin', 'coach']}>
  <AdminPage />
</RoleProtectedRoute>

// 3. OnboardingGuard - enforces onboarding completion for clients
<OnboardingGuard>
  <ClientDashboard />
</OnboardingGuard>
```

### 3. Route Registry

All routes defined in `src/lib/routeConfig.ts`:

```typescript
export const ROUTE_REGISTRY = {
  '/dashboard': {
    roles: ['client'],
    layout: 'client',
    nav: { label: 'Dashboard', icon: Home, order: 1 }
  },
  // ...
};
```

### 4. Client Onboarding State Machine

Defined in `src/auth/onboarding.ts`:

```typescript
type ClientStatus = 
  | 'new'                    // Just signed up
  | 'pending'                // Intake form incomplete
  | 'needs_medical_review'   // PAR-Q flagged
  | 'pending_coach_approval' // Awaiting coach
  | 'pending_payment'        // Payment required
  | 'active'                 // Full access
  | 'suspended' | 'cancelled';
```

### 5. Database Schema (Key Tables)

```sql
-- User profiles (split for security)
profiles_public    -- id, first_name, display_name, status, avatar_url
profiles_private   -- profile_id, email, last_name, phone, dob (PII)

-- Medical data (PHI - encrypted)
parq_submissions   -- Health questionnaire responses
form_submissions   -- Intake forms

-- Relationships
coach_client_relationships  -- Links coaches to clients with dates
user_roles                  -- Role assignments

-- Payments
subscriptions      -- Subscription records
payments           -- Payment transactions

-- Workouts
programs           -- Workout programs
workout_sessions   -- Individual sessions
exercise_logs      -- Exercise tracking
exercise_prescriptions -- Exercise prescriptions (has column_config JSONB, sets_json JSONB)

-- Workout Builder (Phase 17)
coach_column_presets       -- Saved column configuration presets per coach
direct_calendar_sessions   -- Ad-hoc sessions on client calendars (not from program templates)
direct_session_exercises   -- Exercises within direct calendar sessions
day_modules                -- Now has session_type, session_timing columns
client_day_modules         -- Now has session_type, session_timing columns

-- Coach Configuration
specialization_tags -- Admin-managed standardized tags for coach specializations
```

### 6. Row Level Security (RLS)

All tables have RLS enabled with these patterns:
- Users can read/write their own data
- Coaches can read assigned clients' non-PHI data
- Admins can read all data
- PHI requires explicit permission

Helper functions in database:
```sql
auth.is_admin()              -- Check if current user is admin
auth.is_coach_of(client_id)  -- Check coach-client relationship
```

---

## Environment Variables

### Frontend (Vite - must be prefixed with VITE_)
```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
VITE_SENTRY_DSN=https://xxx@sentry.io/xxx
```

### Supabase Edge Functions (set via `supabase secrets set`)
```
TAP_SECRET_KEY=sk_live_xxx
TAP_WEBHOOK_SECRET=whsec_xxx
RESEND_API_KEY=re_xxx
PHI_ENCRYPTION_KEY=xxx (stored in Vault)
```

---

## Common Patterns

### 1. Data Fetching with React Query
```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ['clients', userId],
  queryFn: () => supabase.from('profiles_public').select('*'),
});
```

### 2. Form Handling
```typescript
const form = useForm<FormData>({
  resolver: zodResolver(formSchema),
  defaultValues: { ... },
});
```

### 3. Error Logging
```typescript
import { captureException, captureMessage } from '@/lib/errorLogging';

try {
  // risky operation
} catch (error) {
  captureException(error, { context: 'payment_processing' });
}
```

### 4. Toast Notifications
```typescript
import { toast } from 'sonner';
toast.success('Saved successfully');
toast.error('Something went wrong');
```

---

## Development Workflow

### Local Development
```bash
npm run dev          # Start dev server (port 8080)
npm run build        # Production build
npm run lint         # Run ESLint
npm test             # Run tests
npx tsc --noEmit     # Type check
```

### Database Changes
```bash
supabase db pull     # Pull remote schema to local migrations
supabase db push     # Push migrations to remote
supabase db reset    # Reset local DB (destructive)
```

### Edge Functions
```bash
supabase functions serve              # Local development
supabase functions deploy <name>      # Deploy single function
supabase functions deploy             # Deploy all functions
```

### Git Workflow
```bash
git add -A && git commit -m "message" && git push
# Vercel auto-deploys on push to main
```

---

## Important Files to Read First

When understanding this codebase, read in this order:

1. `src/auth/roles.ts` - Role and permission system
2. `src/lib/routeConfig.ts` - All routes and their config
3. `src/App.tsx` - Route definitions and guards
4. `src/auth/onboarding.ts` - Client onboarding flow
5. `supabase/migrations/` - Database schema (read newest first)

---

## Current State (Feb 2026)

### Completed Phases
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

### Recent Fix: Auth Session Persistence (Feb 2026)

**Problem**: Page refresh caused authentication failures - `getSession()` hung, auth headers didn't attach to Supabase client, RLS policies blocked queries, users got locked out of admin dashboard.

**Solution**: Cache-first role management pattern:
- Cache user roles in localStorage after successful authentication
- Read cached roles instantly on page refresh (no waiting for session)
- Background verification with server (non-blocking)
- Use refs instead of state for authorization guards (avoids React batched update issues)

**Key Files**:
- `src/lib/constants.ts` - Cache keys, timeouts configuration
- `src/hooks/useRoleCache.ts` - localStorage role caching hook
- `src/hooks/useAuthSession.ts` - Session management with timeouts
- `src/hooks/useAuthCleanup.ts` - Sign-out with cache cleanup
- `src/components/RoleProtectedRoute.tsx` - Cache-first auth guard with `isAuthorizedRef`
- `src/components/Navigation.tsx` - Synced with cached auth state
- `src/pages/Auth.tsx` - Fixed sign-in redirect (timeout + reset redirectingRef)
- `src/pages/admin/AdminDashboard.tsx` - Uses cached roles for instant sidebar render

**Pattern**:
```typescript
// Cache-first approach in RoleProtectedRoute
const cachedRoles = getCachedRoles(userId);
if (cachedRoles && hasRequiredRole(cachedRoles, requiredRole)) {
  // Grant access IMMEDIATELY from cache
  setAuthState('authorized');
  // Verify in background (non-blocking)
  verifyRolesWithServer(userId);
}
```

**Phase 11 Regression Note**: Dashboard UX merge conflicts removed role caching from Auth.tsx sign-in flow, causing infinite redirect loops. Two-part fix: (1) Auth.tsx: Query and cache roles immediately after signInWithPassword, BEFORE redirect. (2) Dashboard components: Remove independent getSession() calls, trust RoleProtectedRoute cache.

### Dashboard UX Redesign (Phase 9)

Consistent pattern across all 3 role dashboards:
1. **Attention alerts** at top (flagged items, pending actions)
2. **Metrics cards** row showing key KPIs
3. **Two-column layout** for main content (left: primary actions, right: secondary info)

**Key Components**:
- Admin: `src/components/admin/AdminSidebar.tsx`, `AdminDashboard.tsx`
- Coach: `src/components/coach/CoachKPIRow.tsx`, `ChartDrillDown.tsx`
- Client: `src/components/client/` dashboard components

### Specialization Tags (Phase 13)

Converted coach specializations from free-text comma-separated input to standardized admin-managed multi-select tags.

**New Database Table**:
```sql
specialization_tags  -- id, name, display_order, is_active, created_at
```

**New Files**:
- `src/hooks/useSpecializationTags.ts` - React Query hook with 5min stale time
- `src/components/ui/SpecializationTagPicker.tsx` - Reusable multi-select pills
- `src/components/admin/SpecializationTagManager.tsx` - Admin CRUD for tags

**Modified Files**:
- `src/components/CoachApplicationForm.tsx` - Uses SpecializationTagPicker
- `src/pages/CoachSignup.tsx` - Uses SpecializationTagPicker
- `src/components/CoachManagement.tsx` - New "Specializations" tab
- `src/components/onboarding/CoachPreferenceSection.tsx` - Exact Set-based matching
- `src/lib/coachMatching.ts` - Exact Set-based matching

### Coach Application Email Fix (Phase 14)

Fixed 3 layered bugs preventing coach application confirmation emails from sending.

**Bug 1 — CORS preflight crash**: `req.json()` was called at the top of the function before checking for OPTIONS requests. Since OPTIONS has no body, `JSON.parse("")` threw `SyntaxError: Unexpected end of JSON input`, returning 500 before CORS headers could be set, which killed the preflight → browser never sent the POST.

**Bug 2 — JWT verification blocking anonymous users**: Supabase gateway had "Verify JWT with legacy secret" enabled, returning 401 before the function even executed. Coach applicants are anonymous (not logged in), so JWT verification must be off.

**Bug 3 — Resend domain mismatch**: The `from` address used `noreply@theigu.com` but only `mail.theigu.com` was verified in Resend. Changed to `noreply@mail.theigu.com`.

**Key File**: `supabase/functions/send-coach-application-emails/index.ts`

**Changes Made**:
- Added `corsHeaders` constant and OPTIONS preflight handler before `req.json()`
- Deployed with `--no-verify-jwt` flag (anonymous endpoint)
- Changed `from` address to `noreply@mail.theigu.com`
- All Response objects include `...corsHeaders`

**Edge Function Deployment Pattern** (for public-facing functions):
```bash
supabase functions deploy <function-name> --no-verify-jwt
```

**Resend Configuration**:
- Verified domain: `mail.theigu.com` (not root `theigu.com`)
- All emails must use `@mail.theigu.com` sender addresses
- Future: Add Cloudflare Turnstile for bot protection on anonymous endpoints

### Coach Approval Flow Complete Fix (Phase 15 - Feb 4, 2026)

Fixed the complete coach approval pipeline from application submission to dashboard access.

**Session 7-9: Database & Validation Fixes**

1. **profiles_legacy FK constraint** - Coach approval edge function failed because `profiles_legacy` table had FK to `profiles.id` but coaches aren't in profiles table. Fixed by making the insert conditional.

2. **Duplicate coach_applications** - Found 3 duplicate applications for same email in database. Cleaned up via SQL:
   ```sql
   DELETE FROM coach_applications WHERE id NOT IN (
     SELECT MIN(id) FROM coach_applications GROUP BY email
   );
   ```

3. **Zod validation error** - Edge function failed with `phoneNumber` expecting string but receiving null. Fixed by making field nullable in validation schema:
   ```typescript
   phoneNumber: z.string().nullable().optional()
   ```

**Session 10-11: Email Flow Fixes**

4. **Missing password setup email** - `send-coach-invitation` edge function had JWT verification enabled, blocking edge-function-to-edge-function calls. Fixed by deploying with `--no-verify-jwt`:
   ```bash
   supabase functions deploy send-coach-invitation --no-verify-jwt
   ```

**Files Modified**:
- `supabase/functions/create-coach-account/index.ts` - Nullable phoneNumber, conditional profiles_legacy insert
- `supabase/functions/send-coach-invitation/index.ts` - Deployed without JWT verification

**Result**: Full coach approval flow working end-to-end:
- ✅ Admin approves coach application
- ✅ Coach account created in `coaches`, `coaches_private` tables
- ✅ Password setup email sent via Resend
- ✅ Coach can set password and access dashboard

### Coach Dashboard QA & Infinite Loop Fixes (Phase 16 - Feb 5, 2026)

Comprehensive fix for coach dashboard infinite polling loops and page crashes discovered during QA testing.

**Problems Found**:
1. **Infinite polling loop** - Coach dashboard making 1000+ Supabase requests per minute (user_roles, services, coach_service_limits, subscriptions)
2. **My Clients page crash** - `/coach/clients` showing error boundary immediately on load
3. **coaches_public confusion** - Attempted to INSERT into what turned out to be a VIEW

**Root Cause Analysis**:

The infinite loop pattern was caused by React useEffect dependency arrays containing `useCallback` functions that depended on state setters or callbacks that changed on every render:

```typescript
// BROKEN PATTERN - causes infinite loop
const fetchData = useCallback(async () => {
  // ... calls setCachedRoles() or onMetricsLoaded()
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

**Files Fixed**:

| File | Fix | Commit |
|------|-----|--------|
| `src/pages/coach/CoachDashboard.tsx` | Added `hasLoadedData` ref guard | `39b3896` |
| `src/pages/admin/AdminDashboard.tsx` | Added `hasLoadedData` ref guard | `39b3896` |
| `src/pages/Dashboard.tsx` | Added `hasLoadedData` ref guard | `39b3896` |
| `src/components/coach/EnhancedCapacityCard.tsx` | Added `hasFetchedCapacity` ref guard | `453c8aa` |
| `src/components/coach/CoachMyClientsPage.tsx` | Moved `fetchClients` before useEffect + added `hasFetchedClients` ref | `7c48429` |

**CoachMyClientsPage Crash** (Temporal Dead Zone):

The crash was caused by JavaScript's temporal dead zone - the useEffect referenced `fetchClients` in its dependency array before the `useCallback` was defined later in the file:

```typescript
// BROKEN - fetchClients not defined yet!
useEffect(() => {
  fetchClients(); // ReferenceError
}, [fetchClients]);

// ... 100 lines later ...
const fetchClients = useCallback(...);
```

**Fix**: Move `useCallback` declarations BEFORE the `useEffect` that uses them.

**Key Discovery - coaches_public is a VIEW**:

```sql
-- coaches_public is NOT a table - it's a VIEW that auto-populates
CREATE VIEW coaches_public AS
SELECT ... FROM coaches WHERE status IN ('approved', 'active');
```

This means:
- ❌ Cannot INSERT into coaches_public directly
- ❌ Cannot add RLS policies to views
- ✅ View auto-updates when coaches.status changes to 'approved' or 'active'
- ✅ The `create-coach-account` edge function does NOT need to touch coaches_public

**Reverted Changes**:
- Removed coaches_public upsert from `create-coach-account/index.ts` (commit `ce3fa8c`)
- Deleted invalid migration `20260205120000_coaches_public_rls_fix.sql`

**Testing Verification**:
- ✅ Coach dashboard loads without infinite loop (was 1000+ requests, now 1-2)
- ✅ My Clients page loads successfully
- ✅ No console errors
- ✅ Page refresh maintains auth session
- ✅ Admin dashboard also fixed (same pattern)

### Workout Builder Phase 1 (Phase 17 - Feb 5, 2026)

Implemented the first phase of the workout builder system from `/docs/WORKOUT_BUILDER_SPEC.md`. Source package: `iguphase1`.

**New Dependencies**:
- `@hello-pangea/dnd` — Drag-and-drop for exercise reordering between sections

**Migration**: `supabase/migrations/20260205_workout_builder_phase1.sql`
- Added `column_config JSONB` to `exercise_prescriptions`
- Added `session_type TEXT`, `session_timing TEXT` to `day_modules` and `client_day_modules`
- Created `coach_column_presets` table (RLS: coaches own their presets)
- Created `direct_calendar_sessions` table (RLS: coach owns, client reads)
- Created `direct_session_exercises` table (RLS: coach owns, client reads)
- Created `get_default_column_config()` SQL function

**New Type Definitions**: `src/types/workout-builder.ts`
- `PrescriptionColumnType` (incl. `band_resistance`), `ClientInputColumnType` (incl. `performed_hr`, `performed_calories`), `ColumnConfig`, `ColumnPreset`
- `SessionType` (strength, cardio, hiit, mobility, recovery, sport_specific, other)
- `SessionTiming` (morning, afternoon, evening, anytime)
- `CalendarWeek`, `CalendarDay`, `CalendarSession`, `DirectCalendarSession`
- `ExercisePrescription`, `SetLog`, `EnhancedExerciseDisplay`
- `SetPrescription` (V2 per-set data), `EnhancedExerciseDisplayV2` (V2 display type), `DEFAULT_INPUT_COLUMNS`
- Helper functions: `getColumnValue`, `setColumnValue`, `generateColumnId`
- V2 helpers: `splitColumnsByCategory`, `legacyPrescriptionToSets`, `getSetColumnValue`, `setSetColumnValue`, `getYouTubeThumbnailUrl`

**New Hooks**:
| Hook | Purpose |
|------|---------|
| `src/hooks/useColumnConfig.ts` | Column config CRUD, preset save/load, defaults |
| `src/hooks/useProgramCalendar.ts` | Calendar state: weeks, days, sessions, copy week |
| `src/hooks/useExerciseHistory.ts` | Exercise history, personal bests, last performance |

**New Components**:
| Component | Purpose |
|-----------|---------|
| `src/components/coach/programs/ColumnConfigDropdown.tsx` | Dropdown to configure which columns appear per exercise, drag to reorder, save as preset |
| `src/components/coach/programs/DynamicExerciseRow.tsx` | (Legacy) Single exercise row with shared prescription values — kept as fallback |
| `src/components/coach/programs/SessionTypeSelector.tsx` | Radio groups for session type (7 options) and timing (4 options) with icons |
| `src/components/coach/programs/ExerciseCardV2.tsx` | V2 exercise card with video thumbnail, per-set table, instructions textarea, add/remove sets |
| `src/components/coach/programs/SetRowEditor.tsx` | Per-set table row with independent editable inputs |
| `src/components/coach/programs/ColumnCategoryHeader.tsx` | Dual-category table header ("Exercise Instructions" / "Client Inputs") |
| `src/components/coach/programs/AddColumnDropdown.tsx` | Dropdown to add prescription/input columns with custom field dialog |
| `src/components/coach/programs/VideoThumbnail.tsx` | Clickable YouTube video thumbnail with hover effects |
| `src/components/coach/programs/WarmupSection.tsx` | Collapsible warmup section with amber styling |
| `src/components/coach/programs/EnhancedModuleExerciseEditor.tsx` | Main exercise editor (V2) with per-set data, DnD reordering, dual column categories, batch save |
| `src/components/coach/programs/ProgramCalendarBuilder.tsx` | Week × Day grid: add weeks, copy weeks, add/delete sessions, publish toggle |
| `src/components/coach/programs/DirectClientCalendar.tsx` | Month calendar for building ad-hoc workouts on a client's schedule |
| `src/components/client/EnhancedWorkoutLogger.tsx` | Mobile-optimized workout logger with rest timer, progress bar, previous performance display |

**Modified Files**:
| File | Change |
|------|--------|
| `src/components/coach/programs/DayModuleEditor.tsx` | Import `EnhancedModuleExerciseEditor` instead of `ModuleExerciseEditor` |
| `src/components/coach/programs/CoachProgramsPage.tsx` | Added `"calendar"` view state, renders `ProgramCalendarBuilder` |
| `src/components/coach/programs/ProgramEditor.tsx` | Added `onCalendarView` prop, "Calendar View" toggle button in header |
| `src/components/coach/CoachClientDetail.tsx` | Added "Direct Calendar" button, renders `DirectClientCalendar` |

**Key Architectural Decisions**:
- `ModuleExerciseEditor.tsx` and `DynamicExerciseRow.tsx` kept as fallbacks (not deleted)
- `ExercisePickerDialog` API unchanged — works with both old and new editors
- All new hooks/components use `hasFetched` ref guard pattern for data fetching
- `ProgramCalendarBuilder` resets `hasFetched.current = false` before reload after mutations
- `DirectClientCalendar` exercise editing is a placeholder (Phase 2)
- `EnhancedWorkoutLogger` component exists but is not yet wired into client routing
- V2 per-set data (`sets_json`) coexists with legacy scalar fields for backward compatibility
- Column config stored as single JSONB array, split by type at app layer via `splitColumnsByCategory()`

### Exercise Editor V2 (Phase 18 - Feb 5, 2026)

Replaced the shared-prescription exercise editor with a per-set row-based layout. Each set now has its own editable row with independent values instead of one shared value per exercise.

**Key Changes:**
- Per-set data model: each set is a `SetPrescription` object stored in `sets_json` JSONB array
- Two visually separated column categories: "Exercise Instructions" (coach prescriptions) and "Client Inputs" (empty fields for client)
- YouTube video thumbnails on exercise cards
- Coach instructions textarea per exercise
- Collapsible warmup section with amber styling

**Migration**: `supabase/migrations/20260206_exercise_editor_v2.sql`
- Added `sets_json JSONB DEFAULT NULL` to `exercise_prescriptions`
- When NULL, legacy scalar fields are used (backward compat)

**New Types** (in `src/types/workout-builder.ts`):
- `SetPrescription` — per-set values (set_number, reps, weight, tempo, rir, rpe, etc.)
- `EnhancedExerciseDisplayV2` — extends display with `sets[]`, `prescription_columns[]`, `input_columns[]`
- `DEFAULT_INPUT_COLUMNS` — default client input columns (Weight, Reps, RPE)
- New column types: `band_resistance` (prescription), `performed_hr`/`performed_calories` (client input)

**New Helper Functions** (in `src/types/workout-builder.ts`):
- `splitColumnsByCategory(columns)` — splits ColumnConfig[] into prescription vs input categories
- `legacyPrescriptionToSets(prescription)` — expands shared values into N identical SetPrescription rows
- `getSetColumnValue(set, columnType)` / `setSetColumnValue(set, columnType, value)` — per-set getters/setters
- `getYouTubeThumbnailUrl(videoUrl)` — extracts YouTube video ID → thumbnail URL

**New Components**:
| Component | Purpose | Lines |
|-----------|---------|-------|
| `src/components/coach/programs/VideoThumbnail.tsx` | Clickable YouTube thumbnail with hover effects, placeholder when no video | ~50 |
| `src/components/coach/programs/SetRowEditor.tsx` | Single set table row with per-set editable inputs for prescription & input columns | ~130 |
| `src/components/coach/programs/AddColumnDropdown.tsx` | Dropdown to add prescription/input columns, includes custom field dialog | ~130 |
| `src/components/coach/programs/ColumnCategoryHeader.tsx` | Dual-category table header with "Exercise Instructions" / "Client Inputs" spans | ~110 |
| `src/components/coach/programs/WarmupSection.tsx` | Collapsible warmup section with amber styling and exercise count badge | ~50 |
| `src/components/coach/programs/ExerciseCardV2.tsx` | Full exercise card: video thumbnail, instructions textarea, per-set table, add/remove sets | ~220 |

**Modified Files**:
| File | Change |
|------|--------|
| `src/types/workout-builder.ts` | Added V2 types, helper functions, new column types |
| `src/components/coach/programs/EnhancedModuleExerciseEditor.tsx` | Refactored to use `EnhancedExerciseDisplayV2`, `ExerciseCardV2`, `WarmupSection`, per-set load/save |

**Backward Compatibility**:
- **Load**: if `sets_json` is NULL → `legacyPrescriptionToSets()` expands legacy scalar fields into per-set array
- **Save**: always writes both `sets_json` (new V2) + legacy scalar fields from first set (`set_count`, `rep_range_min`, etc.)
- **Column config**: stored as single JSONB array, split by type at app layer via `splitColumnsByCategory()`
- **Client logger** (`EnhancedWorkoutLogger`): continues reading legacy scalar fields — no changes needed
- `DynamicExerciseRow.tsx` kept as fallback (not deleted)

**ExerciseCardV2 Layout**:
```
┌───────────────────────────────────────────────────────────────┐
│ ⠿ Drag | VideoThumbnail | Exercise Name | Muscle Badge | ⚙ 🗑│
├───────────────────────────────────────────────────────────────┤
│ Coach Instructions: [textarea________________________]       │
├───────────────────────────────────────────────────────────────┤
│     Exercise Instructions    │    Client Inputs              │
│  Set | Reps | RIR | Rest ... │ Weight | Reps | RPE ...       │
│   1  | 8-12 |  2  |  90  ...│   —    |  —   |  —  ...       │
│   2  | 8-12 |  2  |  90  ...│   —    |  —   |  —  ...       │
│   3  | 8-12 |  2  |  90  ...│   —    |  —   |  —  ...       │
├───────────────────────────────────────────────────────────────┤
│                                              [+ Add Set]     │
└───────────────────────────────────────────────────────────────┘
```

### Column Header Drag-to-Reorder (Phase 19 - Feb 5, 2026)

Added direct drag-to-reorder on column headers in the exercise table. Each category (Exercise Instructions / Client Inputs) is an independent reorder zone — columns cannot be dragged between categories.

**Behavior:**
- GripVertical drag handle appears on hover over column header
- Dragged column goes semi-transparent (opacity-40)
- Drop target highlights with primary-colored ring
- Category separation enforced: prescription columns only reorder within prescription, input columns within input
- Order persists to `column_config` JSONB via existing save mechanism

**Implementation:** Uses native HTML5 drag events on `<th>` elements (matches existing `ColumnConfigDropdown` drag pattern, avoids invalid HTML from nesting `@hello-pangea/dnd` `<div>` droppables inside `<tr>`).

**Files Modified:**
| File | Change |
|------|--------|
| `src/components/coach/programs/ColumnCategoryHeader.tsx` | Added drag state tracking, native drag handlers per category, visual feedback (opacity, ring) |
| `src/components/coach/programs/ExerciseCardV2.tsx` | Added `handleReorderPrescriptionColumns` / `handleReorderInputColumns` callbacks, passed to header |
| `src/types/workout-builder.ts` | Added `reorderColumns(columns, fromIndex, toIndex)` helper |

**Files NOT Modified:**
| File | Reason |
|------|--------|
| `SetRowEditor.tsx` | Already sorts cells by `.order` — automatically reflects new order |

### Session Copy/Paste (Phase 20 - Feb 5, 2026)

Added clipboard-based copy/paste for individual sessions on the ProgramCalendarBuilder calendar grid. Coach copies a session from its dropdown menu, then pastes it onto any day cell.

**Behavior:**
- "Copy Session" menu item in the session dropdown (between Edit and Publish/Unpublish)
- Clipboard banner appears above calendar grid when a session is copied
- Paste button (ClipboardPaste icon) appears in each day cell header next to "+" button
- Deep-copies module + exercises + prescriptions (including sets_json, custom_fields_json)
- Pasted session always has status "draft"
- "Cancel" button on banner clears the clipboard

**Bug Fix:** `copyWeek` in both `ProgramCalendarBuilder.tsx` and `useProgramCalendar.ts` was not copying `sets_json` or `custom_fields_json` — fixed to include V2 per-set data.

**Files Modified:**
| File | Change |
|------|--------|
| `src/components/coach/programs/ProgramCalendarBuilder.tsx` | Added copiedSessionId state, Copy menu item, Paste buttons, pasteSession fn, clipboard banner, fix copyWeek V2 fields |
| `src/hooks/useProgramCalendar.ts` | Fix copyWeek to include sets_json/custom_fields_json |

### Admin QA Results (Feb 3, 2026)

10 known issues found across admin dashboard pages (updated Feb 5):

**Critical (1 remaining)**:
1. Testimonials page hangs on load
2. ~~"Error loading services" spam in console~~ ✅ FIXED (Phase 16 - was infinite loop)

**Medium (3 remaining)**:
1. ~~Status shows "Unknown" briefly on page load~~ ✅ FIXED (related to auth cache)
2. "One To_one" label instead of "1:1" in service names
3. Empty state text inconsistencies
4. Admin user flagged in system health checks

**Low (4)**:
1. No sidebar tooltips when collapsed
2. Stale build timestamp display
3. /dashboard route shows loading state
4. Sign-out flow doesn't redirect properly

### Known Limitations
- No automated tests for components (only smoke tests)
- No staging environment (production only)
- Bundle size is large (~2.4MB) - needs code splitting
- `getSession()` can hang on page refresh — always use cache-first pattern
- Sign-out flow doesn't properly redirect to login page
- Edge functions: Always handle OPTIONS before `req.json()` to avoid CORS preflight crashes
- Resend emails must use `@mail.theigu.com` (only verified subdomain)
- React useEffect with useCallback dependencies can cause infinite loops — always use `hasFetched` ref guards for data fetching
- `coaches_public` is a VIEW (not a table) — auto-populated from coaches table, cannot INSERT directly
- Edge functions calling other edge functions must use `--no-verify-jwt` on the called function

---

## Code Style Guidelines

1. **TypeScript**: Strict mode, no `any` unless necessary
2. **Components**: Functional components with hooks
3. **Styling**: Tailwind classes, use `cn()` for conditionals
4. **Imports**: Use `@/` alias for src directory
5. **Error handling**: Always use try-catch with logging
6. **Forms**: React Hook Form + Zod for validation
7. **API calls**: React Query for caching and state

---

## Security Considerations

1. **PHI Data**: Medical info encrypted at rest, restricted RLS
2. **PII Data**: Email, phone, DOB in separate `profiles_private` table
3. **Payments**: Webhook signature verification required
4. **Auth**: Supabase handles auth, we use RLS for data access
5. **Secrets**: Never in frontend code, use Supabase Vault/secrets

---

## Getting Help

- **Supabase Docs**: https://supabase.com/docs
- **shadcn/ui**: https://ui.shadcn.com
- **Tap Payments**: https://developers.tap.company
- **React Router**: https://reactrouter.com

When asking for help:
1. Specify which role (admin/coach/client) is affected
2. Include relevant file paths
3. Note if it involves PHI/PII data
4. Mention if it's a frontend or backend (Edge Function) issue

---

## Launch Plan (February 2026)

### Launch Profile
- **Timeline:** February 2026
- **Initial Clients:** 12-15 (existing + social media)
- **Team:** 2 exercise coaches + 1-2 dieticians
- **Content:** Exercise library needs population

### Pre-Launch Checklist

**Completed**:
- Auth persistence fix (cache-first pattern)
- 3 dashboard UX redesigns (admin, coach, client)
- Exercise Quick-Add tool
- Admin QA (10 pages assessed)
- Specialization tags feature
- Coach application confirmation emails (CORS + JWT + Resend fixes)
- Coach approval/rejection email flow QA ✅ (Feb 4, 2026)
- Coach dashboard QA — infinite loop and crash fixes ✅ (Feb 5, 2026)
- Workout Builder Phase 1 — calendar builder, dynamic columns, direct calendar, enhanced logger ✅ (Feb 5, 2026)
- Exercise Editor V2 — per-set rows, dual column categories, video thumbnails, collapsible warmup ✅ (Feb 5, 2026)
- Column header drag-to-reorder — direct header dragging with category separation ✅ (Feb 5, 2026)
- Session copy/paste — clipboard-based deep copy of sessions between days, copyWeek V2 fix ✅ (Feb 5, 2026)

**In Progress**:
- Client onboarding & dashboard QA (next session)
- Workout Builder Phase 2 — client routing integration, exercise swap, teams

**Remaining**:
- Fix critical issues (testimonials hang)
- Add Cloudflare Turnstile to anonymous endpoints (coach application form)
- Populate exercise library from YouTube
- Mobile responsive testing
- End-to-end client journey testing
- Performance optimization (bundle splitting)
- Security audit
- Backup/recovery procedures

### Documentation
- `/docs/IGU_Discovery_Report.md` - Platform audit
- `/docs/Dashboard_UX_Plan.md` - Dashboard UX specs
- `/docs/LAUNCH_CHECKLIST.md` - Pre-launch tasks
- `/docs/WORKOUT_BUILDER_SPEC.md` - Workout builder system specification (Phase 1 implemented, Phase 2-3 pending)

---

## Workout Builder System

**Spec Document:** `/docs/WORKOUT_BUILDER_SPEC.md` (1,303 lines)

### Phase 1 — Implemented (Phase 17 - Feb 5, 2026)

**What's Built:**

**Coach Side:**
- ✅ Program Calendar Builder (Week × Day grid with add week, copy week)
- ✅ Flexible Column System (coach picks prescription & input fields per exercise)
- ✅ Dynamic exercise rows with configurable columns (Sets, Reps, Weight, RIR, RPE, Rest, Tempo, etc.)
- ✅ Column preset save/load system
- ✅ Direct Client Calendar (month view for ad-hoc 1:1 workouts)
- ✅ Session type (Strength, Cardio, HIIT, Mobility, Recovery, Sport-Specific, Other)
- ✅ Session timing (Morning, Afternoon, Evening, Anytime)
- ✅ Draft/Publish toggle per session
- ✅ Drag-and-drop exercise reordering between sections (warmup, main, accessory, cooldown)
- ✅ Enhanced module exercise editor with batch save and unsaved changes indicator

**Client Side:**
- ✅ Enhanced Workout Logger (mobile-optimized, rest timer, progress bar, previous performance display)
- ⚠️ Logger component created but not yet wired into client routing (Phase 2)

**Database:**
- ✅ `column_config` JSONB on `exercise_prescriptions`
- ✅ `sets_json` JSONB on `exercise_prescriptions` (V2 per-set data)
- ✅ `session_type`, `session_timing` on `day_modules` and `client_day_modules`
- ✅ `coach_column_presets` table with RLS
- ✅ `direct_calendar_sessions` table with RLS
- ✅ `direct_session_exercises` table with RLS
- ✅ `get_default_column_config()` function

**Current State vs Spec:**

| Feature | Status | Notes |
|---------|--------|-------|
| Programs | ✅ Calendar grid + linear editor | Copy week, add/delete sessions |
| Days | ✅ Multi-session, types/timing | Session type & timing selectors |
| Exercises | ✅ Per-set row editor (V2) | Each set gets independent values, dual column categories |
| Column presets | ✅ Save/load presets | Per-coach column configurations |
| Video thumbnails | ✅ YouTube thumbnails | Clickable thumbnails on exercise cards |
| Coach instructions | ✅ Per-exercise textarea | "Add coaching notes..." |
| Collapsible warmup | ✅ WarmupSection component | Amber-themed, auto-expands when empty |
| Direct client calendar | ✅ Month view | Exercise editing is placeholder |
| Workout logging | ✅ Component built | Not yet routed into client views |
| Draft/Publish | ✅ Per-session toggle | |
| Session copy/paste | ✅ Clipboard-based deep copy | Copy from dropdown, paste on any day |
| Teams | ❌ | Phase 2 |
| Volume tracking | ❌ | Phase 2 |
| Exercise swap | ❌ | Phase 2 |

### Phase 2 — Remaining

- Direct calendar exercise editing (currently placeholder)
- Full client workout logger integration into client routing
- Exercise swap functionality (this session OR all future)
- Team programs (synced group assignments)
- Volume tracking / per-muscle analytics
- Exercise history sheet UI

---

## Edge Function Deployment Reference

Quick reference for edge function JWT settings:

| Function | JWT Required | Reason |
|----------|--------------|--------|
| `create-coach-account` | No | Called during admin approval flow |
| `send-coach-invitation` | **No** | Called by other edge functions |
| `send-coach-application-emails` | **No** | Called by anonymous users |
| `tap-webhook` | **No** | Called by payment provider |
| `create-tap-payment` | Yes | Authenticated users only |
| `verify-payment` | Yes | Authenticated users only |

Deploy without JWT: `supabase functions deploy <name> --no-verify-jwt`

---

## React Pattern: Safe Data Fetching in useEffect

Always use this pattern to prevent infinite loops:

```typescript
import { useEffect, useRef, useCallback } from 'react';

function MyComponent() {
  const hasFetched = useRef(false);

  // 1. Define useCallback FIRST
  const fetchData = useCallback(async () => {
    // ... fetch logic
  }, [dependencies]);

  // 2. Use ref guard in useEffect
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchData();
  }, [fetchData]);
}
```

Components using this pattern:
- `src/pages/coach/CoachDashboard.tsx`
- `src/pages/admin/AdminDashboard.tsx`
- `src/pages/Dashboard.tsx`
- `src/components/coach/EnhancedCapacityCard.tsx`
- `src/components/coach/CoachMyClientsPage.tsx`
- `src/hooks/useRoleGate.ts`
- `src/hooks/useColumnConfig.ts`
- `src/hooks/useProgramCalendar.ts`
- `src/hooks/useExerciseHistory.ts`
- `src/components/coach/programs/EnhancedModuleExerciseEditor.tsx`
- `src/components/coach/programs/ProgramCalendarBuilder.tsx`
- `src/components/coach/programs/DirectClientCalendar.tsx`
- `src/components/client/EnhancedWorkoutLogger.tsx`
