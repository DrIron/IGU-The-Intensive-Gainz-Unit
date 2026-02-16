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
- **SEO**: react-helmet-async (meta tags)
- **i18n**: i18next + react-i18next + i18next-browser-languagedetector

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
- **Workflow Automation**: n8n Cloud (theigu.app.n8n.cloud)

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
│   │   ├── coach/            # Coach-specific components (incl. programs/*, teams/*)
│   │   ├── client/           # Client-specific components (incl. EnhancedWorkoutLogger)
│   │   ├── marketing/        # Marketing components (FAQ, WhatsApp, ComparisonTable, HowItWorks)
│   │   ├── layouts/          # Layout components (PublicLayout, etc.)
│   │   ├── AuthGuard.tsx     # Auth-only route protection
│   │   ├── RoleProtectedRoute.tsx  # Role-based route protection
│   │   ├── OnboardingGuard.tsx     # Onboarding flow enforcement
│   │   ├── PermissionGate.tsx      # Feature-level permission checks
│   │   └── GlobalErrorBoundary.tsx # Error boundary with Sentry
│   ├── i18n/                 # Internationalization
│   │   ├── config.ts         # i18next init + language detector + dir/lang handler
│   │   ├── types.ts          # TypeScript augmentation for t() key autocomplete
│   │   └── locales/          # Translation files (en/, ar/)
│   ├── hooks/                # Custom React hooks (incl. useColumnConfig, useProgramCalendar, useExerciseHistory, useSiteContent, useFadeUp)
│   ├── integrations/
│   │   └── supabase/         # Supabase client and generated types
│   ├── lib/
│   │   ├── routeConfig.ts    # CANONICAL route registry
│   │   ├── payments.ts       # Payment utilities and types
│   │   ├── errorLogging.ts   # Structured error logging (Sentry integration)
│   │   ├── utm.ts            # UTM parameter tracking for leads
│   │   ├── assignProgram.ts  # Shared program assignment logic (fan-out for teams)
│   │   └── utils.ts          # General utilities (cn, etc.)
│   ├── pages/                # Route page components
│   │   ├── admin/            # Admin pages
│   │   ├── coach/            # Coach pages
│   │   ├── client/           # Client pages
│   │   └── onboarding/       # Onboarding flow pages
│   ├── App.tsx               # Main app with route definitions
│   └── main.tsx              # Entry point (Sentry init, i18n init)
├── supabase/
│   ├── functions/            # Edge Functions
│   │   ├── create-tap-payment/
│   │   ├── tap-webhook/      # Payment webhook handler
│   │   ├── verify-payment/
│   │   ├── send-coach-application-emails/  # Coach app confirmation (no JWT)
│   │   ├── _shared/          # Shared utilities (config.ts, rateLimit.ts)
│   │   └── # n8n automation endpoints (called on schedule):
│   │       # process-abandoned-onboarding/
│   │       # process-payment-failure-drip/
│   │       # process-inactive-client-alerts/
│   │       # process-lead-nurture/
│   │       # process-testimonial-requests/
│   │       # process-renewal-reminders/
│   │       # process-referral-reminders/
│   │       # process-coach-inactivity-monitor/
│   │       # send-admin-daily-summary/
│   │       # send-weekly-coach-digest/
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
// Dashboard paths (/dashboard, /client, /client/dashboard) are allowed through
// even with incomplete onboarding — ClientDashboardLayout shows limited UI.
// Non-dashboard paths redirect TO /dashboard (not to onboarding pages).
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
-- IMPORTANT: `profiles` is a VIEW joining profiles_public + profiles_private
-- (see "Edge Function DB Query Fix" section for gotchas)

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

-- Nutrition System (Phase 22)
nutrition_phases       -- 1:1 client nutrition phases with macros, goals
nutrition_goals        -- Team plan version of phases
weight_logs            -- Daily weight tracking per phase
circumference_logs     -- Body measurements (waist, chest, hips, thighs)
adherence_logs         -- Weekly adherence tracking
nutrition_adjustments  -- Calorie adjustment history with ±100kcal tolerance band
coach_nutrition_notes  -- Coach internal notes per phase
dietitians             -- Dietitian profiles (credentials, specialties)
step_logs              -- Daily steps (observational only, not used in TDEE)
body_fat_logs          -- Body fat measurements with method tracking
diet_breaks            -- Actual diet break periods with calculated maintenance
refeed_days            -- Scheduled refeed days with target/actual macros
step_recommendations   -- Coach/dietitian step targets
care_team_messages     -- Inter-team communication (client cannot see)
care_team_assignments  -- Staff specialty assignments to clients

-- CMS (Phase 23)
site_content           -- CMS-driven content (page, section, key, value, value_type)

-- Marketing (Phase 24)
leads                  -- Newsletter signups & lead tracking with UTM params
referrals              -- Client referral codes and conversion tracking

-- Compensation Model (Phase 30)
professional_levels        -- Hourly rates: role × level × work_type (9 seeded rows)
service_hour_estimates     -- Estimated monthly hours per service × role × work_type
igu_operations_costs       -- Fixed IGU ops costs per service tier
staff_professional_info    -- Level tracking for non-coach professionals (dietitians, etc.)
addon_services             -- Catalog of add-on services (session packs, specialist, one-time)
addon_purchases            -- Client purchases of add-on services
addon_session_logs         -- Individual session consumption from packs

-- Planning Board / Muscle Workout Builder (Phase 31)
muscle_program_templates   -- Muscle planning templates (slot_config JSONB, is_preset, converted_program_id)

-- Team Plan Builder (Phase 32)
coach_teams                -- Head coach team management (name, tags[], max_members, current_program_template_id)
-- client_programs.team_id -- Nullable FK to coach_teams (tracks which team assignment created the program)
-- subscriptions.team_id   -- Nullable FK to coach_teams (direct team membership)
```

### 5b. Service Tiers & Compensation

Six service tiers, each with a `slug` for programmatic identification:

| Tier | Slug | Price (KWD) | Coach | Dietitian |
|------|------|-------------|-------|-----------|
| Team Plan | `team_plan` | 12 | Head Coach (5 KWD flat) | — |
| 1:1 Online | `one_to_one_online` | 40 | Hourly | — |
| 1:1 Complete | `one_to_one_complete` | 75 | Hourly | Hourly |
| Hybrid | `hybrid` | 150 | Hourly (online + in-person) | Hourly |
| In-Person | `in_person` | 250 | Hourly + profit split | Hourly + profit split |

**Professional Levels** (admin-assigned, affects hourly rate, NOT client pricing):
- Junior / Senior / Lead — for both coaches and dietitians
- Defined in `src/auth/roles.ts`: `ProfessionalLevel`, `COACH_RATES`, `DIETITIAN_RATES`
- DB: `coaches_public.coach_level`, `staff_professional_info.level`

**Head Coach** — boolean flag on `coaches_public`, leads a team plan track. Fixed 5 KWD/client/month.

**Payout Functions** (SECURITY DEFINER):
```sql
-- Calculate subscription payout for any tier
calculate_subscription_payout(subscription_id UUID, discount_percentage NUMERIC DEFAULT 0)
-- Returns JSONB: { coach_payout, dietitian_payout, igu_ops, igu_profit, total, blocked, block_reason }

-- Calculate per-session payout for add-on session packs
calculate_addon_session_payout(addon_service_id UUID, professional_level DEFAULT 'junior')
-- Returns JSONB: { per_session_price, professional_payout, igu_take, note }
```

**Guardrails:**
- 5 KWD minimum IGU profit per subscription (blocked if violated, admin can override)
- 30% maximum discount (proportional across coach, dietitian, IGU — ops never discounted)
- Lead Coach blocked from 1:1 Online; Lead+Lead blocked from 1:1 Complete

**Role Hierarchy** (4 layers + Head Coach flag):
1. Core Role — admin | coach | client — route access
2. Subrole — Coach, Dietitian, Physio, etc. — admin-approved credentials
3. Level — Junior | Senior | Lead — admin-assigned experience tier, determines hourly rate
4. Tags — self-service marketing labels, no permissions

### 6. Row Level Security (RLS)

All tables have RLS enabled with these patterns:
- Users can read/write their own data
- Coaches can read assigned clients' non-PHI data
- Admins can read all data
- PHI requires explicit permission

Helper functions in database:
```sql
-- Role checks
public.has_role(uuid, app_role)           -- Check role in user_roles table
public.is_admin(uuid)                     -- Check admin role
public.is_coach(uuid)                     -- Check coach role
public.is_dietitian(uuid)                 -- Check dietitian role

-- Relationship checks
public.is_primary_coach_for_user(coach, client)    -- Via subscriptions
public.is_dietitian_for_client(dietitian, client)  -- Via care_team_assignments
public.is_care_team_member_for_client(staff, client) -- Any care team role

-- Permission checks
public.can_edit_nutrition(actor, client)  -- Dietitian hierarchy: dietitian > coach > self
public.client_has_dietitian(client)       -- Check if client has active dietitian

-- Compensation calculations
public.calculate_subscription_payout(sub_id, discount%)  -- Dynamic payout for any tier
public.calculate_addon_session_payout(addon_id, level)    -- Session pack payout by coach level
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

### 5. Internationalization (i18n)
```typescript
import { useTranslation } from 'react-i18next';

// Use the namespace matching your component area
const { t } = useTranslation('nav');       // Navigation/Footer strings
const { t } = useTranslation('common');    // Shared buttons/labels (default)

// Basic usage
<Button>{t('signIn')}</Button>

// Cross-namespace access
<Button>{t('common:signOut')}</Button>

// Interpolation
t('statusActiveWith', { serviceName })     // "Active: {{serviceName}}"
t('copyright', { year: 2026 })

// Add new namespaces as components get converted (e.g., 'onboarding', 'dashboard')
// Translation files: src/i18n/locales/{en,ar}/{namespace}.json
// Language stored in localStorage('igu_language'), dir/lang auto-flip on change
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
- Phase 21: WorkoutSessionV2 integration — per-set prescriptions, history blocks, rest timer, video thumbnails, client route wired (Feb 5, 2026)
- Phase 22: Nutrition System Enhancement — dietitian role, step/body-fat tracking, diet breaks, refeed days, care team messages (Feb 7, 2026) ✅
- Phase 23: Full Site UI/UX Redesign — dark theme, CMS-driven content, new fonts, admin content editor (Feb 7, 2026) ✅
- Phase 24: IGU Marketing System — auth gate removal, FAQ, comparison table, leads/UTM tracking, referrals (Feb 7, 2026) ✅
- Phase 25: Client Onboarding & Coach Matching QA — polling pages, audit logging, gender collection, coach matching dedup, UX improvements (Feb 7, 2026) ✅
- Phase 26: Roles, Subroles & Tags System — subrole definitions, permission functions, admin approval queue, coach request UI, feature gating (Feb 7, 2026) ✅
- Fix: Supabase getSession() hang — custom lock timeout prevents infinite lock waits from freezing all data queries (Feb 8, 2026) ✅
- Phase 29: n8n Automation Workflows — 10 scheduled workflows for email drips, admin alerts, and platform operations (Feb 9, 2026) ✅
- Fix: Workout Builder INP Performance — React.memo, useMemo, useCallback across 7 component files to eliminate 4-51s UI freezes (Feb 9, 2026) ✅
- i18n Scaffolding — react-i18next setup, en/ar locales, Navigation + Footer converted, LanguageSwitcher (Feb 10, 2026) ✅
- Phase 30: Compensation Model Schema — hourly-rate compensation, professional levels, add-on services, payout functions (Feb 11, 2026) ✅
- Phase 30b: Compensation UI — admin level manager, payout preview, add-on services manager, coach compensation card (Feb 11, 2026) ✅
- Phase 31: Planning Board (Muscle Workout Builder) — muscle-first planning, DnD calendar, volume analytics, preset system, program conversion (Feb 12, 2026) ✅
- Phase 32: Team Plan Builder — team CRUD, fan-out program assignment, readOnly calendar, dashboard integration (Feb 12, 2026) ✅
- Phase 32b: Team Model Redesign — removed service_id, added tags, client team selection during onboarding, unified "Team Plan" service (Feb 12, 2026) ✅
- Limited Dashboard for Incomplete Onboarding — OnboardingGuard allows dashboard paths through, ClientDashboardLayout shows limited UI (Feb 12, 2026) ✅
- Phase 32c: Team Migration, Team Selection Prompt & Team Change — backfill old subs, choose-team prompt, change-team dialog, team RLS policies (Feb 12, 2026) ✅
- Phase 33: Planning Board → Program Conversion — source_muscle_id on day_modules, auto-filter exercise picker by muscle, muscle badges, focusModuleId navigation (Feb 13, 2026) ✅
- Pre-Launch QA Sweep — 15 bugs found across 3 roles, 8 code fixes + 1 DB migration, RLS index performance (Feb 13, 2026) ✅
- Planning Board Architecture Improvements — undo/redo, auto-save, plan library, batch RPCs for conversion + assignment (Feb 15, 2026) ✅
- Phase 34: Muscle Subdivisions + Exercise Auto-Fill — 42 anatomical subdivisions, hierarchical palette, exercise auto-fill on conversion (Feb 16, 2026) ✅

### Phase 34: Muscle Subdivisions + Exercise Auto-Fill (Feb 16, 2026)

Added 42 anatomically specific muscle subdivisions to the Planning Board's 17 coarse muscle groups, plus automatic exercise population when converting muscle plans to programs. No DB migration needed — subdivision IDs are stored in existing JSONB (`slot_config`) and TEXT (`source_muscle_id`) columns.

**Type System (`src/types/muscle-builder.ts`):**
- `SubdivisionDef` interface: `{ id, label, parentId }`
- `SUBDIVISIONS` array (42 entries across 13 parent groups: Pecs, Shoulders, Triceps, Lats, Mid-back, Upper Back, Elbow Flexors, Forearm, Quads, Glutes, Hip Flexors, Core, Neck)
- `SUBDIVISION_MAP` — `Map<string, SubdivisionDef>` for direct lookup
- `SUBDIVISIONS_BY_PARENT` — `Map<string, SubdivisionDef[]>` for parent→children
- `resolveParentMuscleId(muscleId)` — returns parentId if subdivision, muscleId if parent
- `getMuscleDisplay(muscleId)` — unified lookup (checks MUSCLE_MAP first, then SUBDIVISION_MAP inheriting parent color)
- `MUSCLE_TO_EXERCISE_FILTER` extended with ~42 subdivision entries mapping to `exercise_library.primary_muscle` values

**Volume Aggregation (`useMusclePlanVolume.ts`):**
- All metrics aggregate subdivisions to parent level: volumeEntries, frequencyMatrix, consecutiveDayWarnings
- `placementCounts` tracks both exact IDs and parent IDs (for palette badges)
- `subdivisionBreakdown` on each `MuscleVolumeEntry` — per-subdivision set counts for tooltip detail

**UI Changes:**
- `MusclePalette.tsx` — two-level hierarchy: parent chips + indented subdivision chips (smaller, dashed border)
- `DraggableMuscleChip.tsx` — `isSubdivision` prop for smaller/indented styling
- `DayColumn.tsx` — expandable chevron in "Add Muscle" popover for subdivision selection
- `MobileDayDetail.tsx` — inline subdivision picker with search, body region display shows subdivision chips
- `VolumeOverview.tsx` — tooltip shows subdivision breakdown when subdivisions are used
- `FrequencyHeatmap.tsx` — unchanged (already correct via parent-level aggregated frequencyMatrix)

**Exercise Auto-Fill on Conversion (`ConvertToProgram.tsx`):**
After RPC creates program structure, a best-effort auto-fill step:
1. Queries `program_template_days` → `day_modules` with `source_muscle_id`
2. Looks up `MUSCLE_TO_EXERCISE_FILTER[source_muscle_id]` for each module
3. Batch-queries `exercise_library` for matching exercises (sorted by name)
4. Picks up to 3 exercises per module, batch-inserts `module_exercises` + `exercise_prescriptions` (3×8-12, RIR 2, 90s rest)
5. Auto-fill failure doesn't block program creation (wrapped in try/catch)

**Replaced `MUSCLE_MAP.get()` calls** with `getMuscleDisplay()` across 10 files: MuscleSlotCard, MobileDayDetail, ConvertToProgram, DayModuleEditor, ExercisePickerDialog, EnhancedModuleExerciseEditor, PresetSelector, MusclePlanLibrary, FrequencyHeatmap, useMusclePlanVolume.

**Backward Compatibility:**
- Existing plans with parent IDs (e.g., `pecs`) work unchanged
- `resolveParentMuscleId('pecs')` returns `'pecs'` (no-op for parents)
- System presets use parent IDs (unchanged)
- No DB migration needed

**Files Modified (15):**
| File | Changes |
|------|---------|
| `src/types/muscle-builder.ts` | SubdivisionDef, SUBDIVISIONS, maps, helpers, MUSCLE_TO_EXERCISE_FILTER extensions |
| `src/components/coach/programs/muscle-builder/hooks/useMusclePlanVolume.ts` | Parent-level aggregation, subdivisionBreakdown, dual placementCounts |
| `src/components/coach/programs/muscle-builder/MusclePalette.tsx` | Two-level hierarchy with subdivision chips |
| `src/components/coach/programs/muscle-builder/DraggableMuscleChip.tsx` | isSubdivision prop |
| `src/components/coach/programs/muscle-builder/DayColumn.tsx` | Expandable subdivision popover |
| `src/components/coach/programs/muscle-builder/MobileDayDetail.tsx` | Inline subdivision picker |
| `src/components/coach/programs/muscle-builder/VolumeOverview.tsx` | Subdivision tooltip |
| `src/components/coach/programs/muscle-builder/ConvertToProgram.tsx` | Exercise auto-fill post-RPC |
| `src/components/coach/programs/muscle-builder/MuscleSlotCard.tsx` | getMuscleDisplay() |
| `src/components/coach/programs/muscle-builder/FrequencyHeatmap.tsx` | getMuscleDisplay() import |
| `src/components/coach/programs/muscle-builder/PresetSelector.tsx` | getMuscleDisplay() |
| `src/components/coach/programs/muscle-builder/MusclePlanLibrary.tsx` | getMuscleDisplay() |
| `src/components/coach/programs/DayModuleEditor.tsx` | getMuscleDisplay() |
| `src/components/coach/programs/ExercisePickerDialog.tsx` | getMuscleDisplay() |
| `src/components/coach/programs/EnhancedModuleExerciseEditor.tsx` | getMuscleDisplay() |

### Pre-Launch QA Sweep (Feb 13, 2026)

Comprehensive QA across Coach, Client, Admin roles and public pages. Found 15 bugs, fixed 8 via code + 4 via DB migration.

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
- 6 indexes on RLS-critical columns (fixes module_exercises timeout):
  - `program_templates(owner_coach_id)`, `program_templates(visibility)` partial
  - `program_template_days(program_template_id)`
  - `client_program_days(client_program_id)`
  - `subscriptions(coach_id, status)` composite
  - `care_team_assignments(staff_user_id, client_id)` partial WHERE active
- Team Plan price: 0 → 12 KWD
- Deactivate old Bunz/Fe Squad services
- CMS price corrections

**Remaining Known Issues:**
- Bug #3: session_bookings FK join — latent, only for in-person clients (none exist yet)
- Bug #6: Preloaded resources warnings — cosmetic, browser-level
- Bug #9: Fe Squad branding in nutrition — needs CMS content update
- Bug #12: Deactivated services in coach limits UI — cosmetic

### Phase 33: Team Migration, Selection Prompt & Team Change (Feb 12, 2026)

Backfilled old Fe Squad/Bunz subscriptions to Team Plan service (team_id left NULL so clients get prompted). Added dashboard prompt for team selection, dialog for once-per-cycle team switching, and team display in subscription management.

**Schema Changes:**
- `subscriptions`: Added `last_team_change_at TIMESTAMPTZ` (once-per-cycle enforcement)
- Backfill: old Fe Squad/Bunz subs updated to Team Plan service_id, team_id stays NULL

**New RLS Policies (2):**
- `subscriptions`: Coaches can read subscriptions for teams they own (`team_id IN (SELECT id FROM coach_teams WHERE coach_id = auth.uid())`)
- `profiles_public`: Coaches can read profiles of members in their teams (via `subscriptions.team_id → coach_teams.coach_id` join)

**Migrations (3):**
```
20260212160000_team_change_tracking.sql        -- last_team_change_at + backfill old subs
20260212170000_team_subscriptions_rls.sql      -- Coach read subscriptions by team_id
20260212180000_team_profiles_rls.sql           -- Coach read profiles of team members
```

**New Files (2):**
| File | Purpose |
|------|---------|
| `src/components/client/ChooseTeamPrompt.tsx` | Full-width prompt (indigo alert + team cards RadioGroup) for active team clients with NULL team_id. Updates `subscriptions.team_id` on join. |
| `src/components/client/ChangeTeamDialog.tsx` | Dialog to switch teams once per billing cycle. Current team highlighted/disabled, updates `team_id` + `last_team_change_at`. |

**Modified Files (3):**
| File | Changes |
|------|---------|
| `src/pages/Dashboard.tsx` | Added `team_id`, `last_team_change_at` to Subscription interface; added `type` to services query |
| `src/components/client/ClientDashboardLayout.tsx` | New state 10a: active team plan + no team → shows `ChooseTeamPrompt` before full dashboard |
| `src/components/SubscriptionManagement.tsx` | Team info row (name + "Change Team" button), once-per-cycle enforcement via `last_team_change_at` vs billing cycle start, `ChangeTeamDialog` integration |

**Key patterns:** `hasFetched` ref guard, `memo` on new components, team card UI reused from `TeamSelectionSection.tsx`, `coaches_client_safe` for coach names, `sanitizeErrorForUser` for error toasts.

**RLS lesson:** Team-based queries need dedicated policies — existing coach RLS only checks `coach_id` on subscriptions and `is_primary_coach_for_user` on profiles. Team coaches need separate paths via `coach_teams.coach_id → subscriptions.team_id` and `coach_teams.coach_id → subscriptions.team_id → profiles_public.id`.

### Limited Dashboard for Incomplete Onboarding (Feb 12, 2026)

OnboardingGuard no longer force-redirects clients to onboarding pages. Dashboard paths (`/dashboard`, `/client`, `/client/dashboard`) are allowed through so `ClientDashboardLayout`'s existing limited-state UI renders (registration alerts, medical review, coach approval, payment status). Non-dashboard paths redirect to `/dashboard` instead of onboarding. The `paymentVerified` state bypass still works.

**File Modified:** `src/components/OnboardingGuard.tsx`
- Redirect useEffect: dashboard paths skip redirect; non-dashboard paths redirect to `/dashboard`
- Render guard: dashboard paths allowed through (not blocked by `PageLoadingSkeleton`)
- Removed unused `getOnboardingRedirect` import

### Phase 32b: Team Model Redesign (Complete - Feb 12, 2026)

Removed `service_id` from `coach_teams` — teams are now service-agnostic. All teams share one "Team Plan" service (12 KWD). Added `tags TEXT[]` for client discovery. Added `subscriptions.team_id` for direct team membership tracking. Clients selecting "Team Plan" during onboarding now see available teams and pick one. Old Fe Squad/Bunz services deactivated.

**Schema Changes:**
- `coach_teams`: Removed `service_id`, added `tags TEXT[] DEFAULT '{}'`
- `subscriptions`: Added `team_id UUID` (FK to coach_teams)
- `form_submissions`: Added `selected_team_id UUID` (FK to coach_teams)
- New service: "Team Plan" (12 KWD, slug `team_plan`, type `team`)
- Old services deactivated: `team_fe_squad`, `team_bunz`
- New form_type enum value: `team_plan`

**New File:** `src/components/onboarding/TeamSelectionSection.tsx` — RadioGroup of team cards (name, description, tags, coach name, member count, capacity check)

**Modified Files (8):**
- `CreateTeamDialog.tsx` — Removed service selector, added tags pill input
- `CoachTeamsPage.tsx` — Removed serviceName, query members by team_id
- `TeamCard.tsx` — Tags badges instead of service badge
- `TeamDetailView.tsx` — Members by team_id, tags badges, updated empty state
- `AssignTeamProgramDialog.tsx` — Removed service_id from team interface
- `CoachDashboardOverview.tsx` — Count members by team_id
- `ServiceStep.tsx` — Added TeamSelectionSection for team services
- `submit-onboarding/index.ts` — selected_team_id in Zod schema, Team Plan in formTypeMap, coach from selected team, team_id in subscription

### Phase 32: Team Plan Builder (Complete - Feb 12, 2026)

Head coaches manage teams freely (no service picker). Teams have tags for client discovery. Assign program templates to all members at once (fan-out), and preview assigned programs in a read-only calendar.

**New Table:** `coach_teams`
| Column | Type | Purpose |
|--------|------|---------|
| `coach_id` | UUID FK auth.users | Owner (must be head coach for INSERT) |
| `name` | TEXT | Team name |
| `description` | TEXT | Optional description |
| `tags` | TEXT[] | Free-form tags for client discovery |
| `current_program_template_id` | UUID FK program_templates | Currently assigned template |
| `max_members` | INT (default 30) | Member cap |
| `is_active` | BOOLEAN | Soft delete flag |

**Altered Tables:**
- `client_programs` — added `team_id UUID` (nullable FK to `coach_teams`, tracks team-originated assignments)
- `subscriptions` — added `team_id UUID` (nullable FK to `coach_teams`, direct team membership)
- `form_submissions` — added `selected_team_id UUID` (nullable FK to `coach_teams`, audit trail)

**Migration:** `supabase/migrations/20260212_team_plan_builder.sql`
- RLS: authenticated SELECT active teams, INSERT with `coaches_public.is_head_coach` check, UPDATE/DELETE own, admin ALL
- Index on `subscriptions(team_id)` WHERE status IN ('pending','active')
- Index on `client_programs(team_id)`

**Shared Utility:** `src/lib/assignProgram.ts`
- Extracted assignment logic from `AssignProgramDialog.tsx` (~155 lines) into reusable `assignProgramToClient()`
- Handles: template loading, `client_programs` creation (with optional `team_id`), care team member fetching, day/module/exercise copying with prescription snapshots, module thread creation, specialist auto-creation
- Used by both `AssignProgramDialog` (1:1 assignments) and `AssignTeamProgramDialog` (fan-out)

**Component Tree:**
```
src/components/coach/teams/
├── CoachTeamsPage.tsx           # Main page: list/detail views, head coach gate
├── TeamCard.tsx                 # Card: name, service badge, member count, program name
├── TeamDetailView.tsx           # Detail: member list, program section, edit/delete
├── AssignTeamProgramDialog.tsx  # Fan-out: program selector, date picker, progress bar
├── CreateTeamDialog.tsx         # Create/edit: name, description, service, max_members
└── index.ts                    # Barrel export
```

**Key Design Decisions:**
- **Team membership via `subscriptions.team_id`** — members tracked directly by `subscriptions WHERE team_id = X AND status IN ('pending','active')`
- **Max 3 teams per coach** — application-enforced validation
- **Fan-out assignment** — loops `assignProgramToClient()` for each active subscriber, sets `team_id` on created `client_programs`, updates `coach_teams.current_program_template_id`
- **Partial success handling** — if some assignments fail, shows error list with which clients failed
- **Head coach gate** — non-head-coaches see a message instead of the teams UI (matches `canBuildPrograms` pattern)

**ProgramCalendarBuilder readOnly Mode:**
- Added `readOnly?: boolean` and `onBack?: () => void` props
- When `readOnly`: hides Add Week, Copy Week, paste buttons, session dropdown menus, clipboard banner
- SessionCard: no cursor-pointer/hover, no onClick, no dropdown
- Used by TeamDetailView to preview the team's assigned program

**Dashboard Integration:**
- Route: `coach-teams` in `routeConfig.ts` (navOrder 2.5, between Clients and Assignments)
- `CoachDashboard.tsx`: `teams: "teams"` in SECTION_MAP
- `CoachDashboardLayout.tsx`: `CoachTeamsPage` case in renderContent, getSectionFromPath, titles
- `CoachDashboardOverview.tsx`: `CoachTeamsSummaryCard` (memo'd, head-coach-only) — shows team count + total members, clickable navigation to teams section

**Modified Files (6):**
| File | Changes |
|------|---------|
| `src/components/coach/programs/AssignProgramDialog.tsx` | Replaced ~155 lines inline logic with `assignProgramToClient()` call |
| `src/components/coach/programs/ProgramCalendarBuilder.tsx` | Added `readOnly` + `onBack` props, conditional rendering on all interactive elements |
| `src/components/coach/CoachDashboardLayout.tsx` | Added teams route, import, renderContent case, titles |
| `src/components/coach/CoachDashboardOverview.tsx` | Added `CoachTeamsSummaryCard` component |
| `src/lib/routeConfig.ts` | Added `coach-teams` route with `Users2` icon |
| `src/pages/coach/CoachDashboard.tsx` | Added `teams` to SECTION_MAP |

### Phase 31: Planning Board — Muscle Workout Builder (Complete - Feb 12, 2026)

Coaches plan workouts starting from **muscles** instead of exercises. Drag muscle groups onto a 7-day calendar, configure sets per slot, view real-time volume analytics (MV/MEV/MAV/MRV landmarks), then convert the muscle template into a program scaffold. UI label: "Planning Board" (renamed from "Muscle-First Plan").

**New Table:** `muscle_program_templates`
| Column | Type | Purpose |
|--------|------|---------|
| `coach_id` | UUID FK coaches | Owner |
| `name` | TEXT | Plan name |
| `description` | TEXT | Optional description |
| `slot_config` | JSONB | Array of `{id, dayIndex, muscleId, sets, sortOrder}` |
| `is_preset` | BOOLEAN | Coach-saved preset flag |
| `is_system` | BOOLEAN | Built-in preset flag |
| `converted_program_id` | UUID FK program_templates | Link to converted program |

**Migration:** `supabase/migrations/20260212_muscle_program_templates.sql`

**Types:** `src/types/muscle-builder.ts` — 17 muscle groups with evidence-based volume landmarks, 42 anatomical subdivisions, 4 body regions (push/pull/legs/core), 4 built-in presets (PPL, Upper/Lower, Full Body 3x, Bro Split), landmark zone helpers, `getMuscleDisplay()` unified lookup, `resolveParentMuscleId()` for subdivision→parent resolution.

**Component Tree:**
```
src/components/coach/programs/muscle-builder/
├── MuscleBuilderPage.tsx           # Entry: DragDropContext + header + 3-col layout
├── MusclePalette.tsx               # Right panel: search + accordion by body region
│   └── DraggableMuscleChip.tsx     # Draggable muscle badge with placement count
├── WeeklyCalendar.tsx              # 7-column responsive grid (2-col mobile → 7-col desktop)
│   ├── DayColumn.tsx               # Droppable day zone with slot list
│   └── MuscleSlotCard.tsx          # Draggable slot: color dot + name + sets input + delete
├── VolumeOverview.tsx              # Horizontal bars with MEV/MRV markers + zone badges
├── FrequencyHeatmap.tsx            # Muscle × Day matrix with consecutive-day warnings
├── PresetSelector.tsx              # 4 built-in + coach custom preset cards
├── ConvertToProgramDialog.tsx      # Creates program_template + days + day_modules
└── hooks/
    ├── useMuscleBuilderState.ts    # useReducer (13 actions) + Supabase save/load
    └── useMusclePlanVolume.ts      # Derived volume, summary, frequency, placement counts
```

**DnD (via @hello-pangea/dnd):**
- Palette → Day: copy muscle (palette stays) — same muscle can be added multiple times per day
- Day → Same Day: reorder
- Day → Different Day: move
- No per-day muscle limit — each slot has a unique `id` for identification

**Conversion:** Creates `program_templates` + `program_template_days` (one per training day) + `day_modules` (one per muscle slot, with `source_muscle_id`). Exercises are auto-filled from `exercise_library` based on `MUSCLE_TO_EXERCISE_FILTER` (up to 3 per module, defaults: 3×8-12, RIR 2, 90s rest). Coach can edit in ProgramCalendarBuilder afterward.

**Modified Files:** `CoachProgramsPage.tsx` (added `muscle-builder` view), `ProgramLibrary.tsx` (added "Planning Board" button), `index.ts` (export).

**DnD Fix (Feb 12, 2026):** Palette `Droppable` was missing `type="MUSCLE_SLOT"` — drops from palette to day columns were silently rejected because `@hello-pangea/dnd` requires matching types between source and destination droppables. Fixed in `MusclePalette.tsx`.

**Muscle Limit Removal (Feb 12, 2026):** Removed per-day muscle deduplication — each muscle can now appear multiple times per day, per session, and on unlimited days. Added unique `id: string` (UUID) to `MuscleSlotData` to replace the `dayIndex+muscleId` composite key. Reducer actions (`REMOVE_MUSCLE`, `SET_SETS`, `MOVE_MUSCLE`) now use `slotId`. Backward-compatible: `hydrateSlotIds()` adds UUIDs to saved data loaded without ids. PASTE_DAY generates fresh UUIDs for pasted slots.

### Phase 30: Compensation Model (Complete - Feb 11, 2026)

Restructured compensation from percentage-based splits (70/30) to an hourly-rate system with professional levels, per-service hour estimates, and IGU operations costs.

**New Enums:** `professional_role`, `professional_level`, `work_type_category`, `addon_service_type`

**New Tables:**
| Table | Purpose |
|-------|---------|
| `professional_levels` | Hourly rates by role × level × work_type (9 seeded rows) |
| `service_hour_estimates` | Monthly hours per service × role × work_type |
| `igu_operations_costs` | Fixed IGU ops costs per service tier |
| `staff_professional_info` | Level tracking for non-coach professionals |
| `addon_services` | Catalog of purchasable add-ons (12 seeded: 3 session packs, 6 specialist, 2 one-time, 1 monthly) |
| `addon_purchases` | Client purchases of add-on services |
| `addon_session_logs` | Individual session consumption logs |

**Modified Tables:**
| Table | Changes |
|-------|---------|
| `coaches_public` | Added `coach_level` (professional_level, default junior), `is_head_coach` (boolean), `head_coach_specialisation` (text) |
| `services` | Added `slug` (text, unique) — 6 slugs set for programmatic identification |
| `service_pricing` | Updated: Online 50→40, Hybrid 175→150, added Complete at 75 |

**New Service:** "1:1 Complete" — 75 KWD, slug `one_to_one_complete`, ID `a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d`

**Frontend (`src/auth/roles.ts`):** Added `ProfessionalLevel`, `ProfessionalRole`, `WorkTypeCategory`, `ServiceSlug` types. `COACH_RATES`, `DIETITIAN_RATES`, `LEVEL_ELIGIBILITY`, `MIN_IGU_PROFIT_KWD`, `MAX_DISCOUNT_PERCENT`, `HEAD_COACH_TEAM_PAYOUT_KWD` constants.

**Migrations (5 files):**
```
20260211073154_add_compensation_reference_tables.sql
20260211073240_add_professional_level_tracking.sql
20260211073308_add_addon_services_system.sql
20260211073338_update_service_tiers.sql
20260211073430_add_payout_calculation_function.sql
```

**Views Recreated:** `coaches_full`, `coaches_directory_admin`, `coaches_directory` — all with `security_invoker = on`.

**Existing tables untouched:** `payout_rules` (legacy 70/30 splits), `addon_pricing` (recurring subscription add-ons).

### Phase 30b: Compensation UI (Complete - Feb 11, 2026)

Built admin management pages and coach-facing dashboard integration for the Phase 30 compensation schema.

**New Files (4):**
| File | Purpose |
|------|---------|
| `src/components/admin/ProfessionalLevelManager.tsx` | Admin: Manage coach/specialist levels and head coach flags |
| `src/components/admin/SubscriptionPayoutPreview.tsx` | Admin: Per-subscription payout breakdown using `calculate_subscription_payout()` RPC |
| `src/components/admin/AddonServicesManager.tsx` | Admin: CRUD for `addon_services` catalog + view recent purchases |
| `src/components/coach/CoachCompensationCard.tsx` | Coach: Level badge, hourly rates, per-client payout breakdown |

**Modified Files (5):**
| File | Changes |
|------|---------|
| `src/integrations/supabase/types.ts` | Regenerated with all Phase 30 tables/columns/RPCs |
| `src/components/CoachManagement.tsx` | Added 5th tab "Levels" with `Award` icon → `ProfessionalLevelManager` |
| `src/components/admin/PricingPayoutsPage.tsx` | Added 6th tab "Preview" with `Eye` icon → `SubscriptionPayoutPreview`; added `AddonServicesManager` below legacy addons in "Add-ons" tab |
| `src/components/coach/CoachDashboardOverview.tsx` | Added `CoachCompensationCard` below capacity/tasks grid |
| `src/components/coach/CoachEarningsSummary.tsx` | Added level Badge, head coach Badge, hourly rates in CardDescription |

**Admin — Professional Level Manager:**
- Coaches table: Level (Select), Head Coach (Switch), HC Specialisation (Input), Save per row
- Specialists table: from `staff_professional_info`, Level (Select), Save per row
- Rate Reference: read-only table from `professional_levels`
- Reads from `coaches_full` view, mutates `coaches_public` and `staff_professional_info`

**Admin — Subscription Payout Preview:**
- Fetches active subscriptions, calls `supabase.rpc('calculate_subscription_payout')` for each
- Displays: Client, Service, Coach (Level), Coach Payout, Diet Payout, IGU Ops, IGU Profit, Status
- Blocked rows highlighted red with tooltip showing `block_reason`
- Coach filter dropdown, summary totals row

**Admin — Add-on Services Manager:**
- Full CRUD for `addon_services` catalog (session_pack, specialist, one_time, monthly types)
- Edit dialog with conditional pack-specific fields (pack_size, pack_price_kwd, pack_expiry_months)
- Recent purchases section from `addon_purchases` (read-only)

**Coach — Compensation Card:**
- Level badge (Junior/Senior/Lead) + Head Coach badge
- Hourly rates from `COACH_RATES[level]` (online + in-person)
- Per-client payout breakdown table via `calculate_subscription_payout()` RPC
- Estimated monthly total

### Phase 26: Roles, Subroles & Tags System (Complete - Feb 7, 2026)

Implemented a three-layer permission system separating core roles, subroles (admin-approved credentials), and tags (self-service labels).

**Concepts:**
- **Core Roles** (admin/coach/client) — route access gates (unchanged)
- **Subroles** (coach/dietitian/physiotherapist/sports_psychologist/mobility_coach) — admin-approved credentials granting specific capabilities
- **Tags** (bodybuilding, powerlifting, etc.) — self-service expertise labels with zero permission implications

**Key Design Decision:** All practitioners are "coaches" (core role). The subrole = credential type. No FK changes needed.

**New Database Tables:**
```sql
subrole_definitions     -- 5 seed rows: coach, dietitian, physiotherapist, sports_psychologist, mobility_coach
user_subroles           -- user_id + subrole_id UNIQUE, status enum (pending/approved/rejected/revoked)
```

**New Database Functions:**
- `has_approved_subrole(user_id, slug)` — Check approved subrole
- `can_build_programs(user_id)` — coach/physio/mobility + backward-compat fallback
- `can_assign_workouts(user_id)` — delegates to can_build_programs
- `can_write_injury_notes(user_id)` — admin + physiotherapist
- `can_write_psych_notes(user_id)` — admin + sports_psychologist
- `get_user_subroles(user_id)` — returns text[] of approved slugs
- Updated `is_dietitian()` — checks subroles first, fallback to user_roles
- Updated `can_edit_nutrition()` — adds mobility_coach support

**Backward Compatibility:** `can_build_programs()` includes fallback for existing coaches without ANY subrole records — they still get access.

**Self-Service Re-Request:** Rejected users can UPDATE own record back to `pending`. Revoked users cannot re-request.

**Migrations (7 files):**
```
20260208100000_create_subroles_system.sql          -- Tables + RLS + seed data
20260208100001_subrole_permission_functions.sql     -- Helper functions
20260208100002_backfill_existing_subroles.sql       -- Migrate coaches/dietitians from user_roles
20260208100003_workout_rls_shared_calendar.sql      -- Multi-practitioner calendar RLS
20260208100004_cleanup_specialization_tags.sql      -- Deactivate credential-like tags
20260208100005_coach_apps_requested_subroles.sql    -- Add requested_subroles to coach_applications
20260208100006_care_team_subrole_validation.sql     -- Trigger validates specialty matches subrole
```

**New Frontend Files:**
| File | Purpose |
|------|---------|
| `src/hooks/useUserSubroles.ts` | React Query hook for user's subroles (5min stale time) |
| `src/hooks/useSubrolePermissions.ts` | Computed capability booleans (canBuildPrograms, canWriteInjuryNotes, etc.) |
| `src/components/admin/SubroleApprovalQueue.tsx` | Admin approval UI with Pending/Approved/Rejected/Revoked tabs |
| `src/components/coach/SubroleRequestForm.tsx` | Coach request UI with re-request for rejected subroles |

**Modified Frontend Files:**
| File | Changes |
|------|---------|
| `src/auth/roles.ts` | Added SubroleSlug, SubroleStatus, UserSubrole, SubroleCapability, SUBROLE_CAPABILITIES, hasCapability() |
| `src/hooks/useNutritionPermissions.ts` | Subrole-based dietitian check + mobility_coach care team support |
| `src/components/CoachApplicationForm.tsx` | Added subrole multi-select (requestedSubroles field) |
| `src/components/CoachApplicationsManager.tsx` | Shows requested subroles badges, creates pending user_subroles on approve |
| `src/components/coach/CoachClientDetail.tsx` | useSubrolePermissions for canBuildPrograms, calendar visible to all care team |
| `src/components/coach/programs/CoachProgramsPage.tsx` | Program builder gated by canBuildPrograms |
| `src/lib/routeConfig.ts` | Added admin-subrole-approvals route |
| `src/pages/admin/AdminDashboard.tsx` | Added subrole-approvals to SECTION_MAP |
| `src/components/admin/AdminDashboardLayout.tsx` | Added SubroleApprovalQueue case + title/subtitle |

**Feature Gating:**
- Program builder → `canBuildPrograms` (coach, physiotherapist, mobility_coach)
- Direct Calendar → visible to primary coach, care team members, and admin
- Assign Program → `canBuildPrograms` OR primary coach
- Injury notes → `canWriteInjuryNotes` (physiotherapist only, UI not yet built)
- Psych notes → `canWritePsychNotes` (sports_psychologist only, UI not yet built)
- Nutrition → updated RPC respects mobility_coach in care team

### Phase 25: Client Onboarding & Coach Matching QA (Complete - Feb 7, 2026)

Comprehensive onboarding flow fixes and UX improvements across 12 items in two phases.

**Phase A: Critical Fixes (6 items)**

1. **AwaitingApproval page** — Now fetches subscription+coach data, shows assigned coach name with avatar, shows "finding coach" message for `needs_coach_assignment`, 30s polling for status changes, auto-redirect on status change, manual "Check Status" button
2. **MedicalReview page** — Added 30s polling for status changes, auto-redirect when cleared, manual "Check Status" button
3. **Audit logging** — Added `onboarding_status` to `AuditEntityType` in `src/lib/auditLog.ts`, created `logOnboardingStatusChange()` helper. Updated `logStatusChange()` in `src/auth/onboarding.ts` to write to `admin_audit_log` table via dynamic import (was previously console.log only)
4. **Gender collection** — Set `showGender={true}` in ServiceStep.tsx, added `gender: z.enum(["male", "female"]).optional()` to both client-side and server-side Zod schemas, stored in `profiles_private.gender`
5. **Coach matching dedup** — Fixed critical bug: client-side `CoachPreferenceSection.tsx` only counted `active` subscriptions while server-side counted `pending+active`. Now both sides use `.in('status', ['pending', 'active'])`. Also fixed `coachMatching.ts` `autoMatchCoachForClient()` and `validateCoachSelection()`
6. **Direct redirect** — `OnboardingForm.tsx` now uses `getOnboardingRedirect(data.status)` from edge function response to navigate directly to the correct onboarding page (no dashboard flash)

**Phase B: High-Impact UX (6 items)**

7. **Save & Exit button** — Ghost button next to Back, calls `saveDraft()` + navigates to homepage with toast confirmation
8. **Clickable step indicator** — `StepIndicator.tsx` accepts optional `onStepClick`, completed steps are clickable with hover ring on both desktop and mobile layouts
9. **Payment deadline countdown** — `Payment.tsx` fetches `profiles_public.payment_deadline`, shows blue countdown alert (red + warning text at ≤2 days)
10. **Discount code UI** — Promo code input on Payment page calls existing `apply-discount-code` edge function, displays adjusted price with strikethrough original
11. **Post-payment welcome modal** — New `WelcomeModal.tsx` shows once on first active dashboard load (localStorage flag `igu_welcome_shown_{userId}`), displays coach avatar+name, getting-started steps. Integrated in `ClientDashboardLayout.tsx`
12. **Referral sources expanded** — Added YouTube, Google Search, Twitter/X, Gym/Flyer, Returning Client to `referralSources` in ServiceStep.tsx. Updated server-side `referralAllowed` set in `submit-onboarding/index.ts`. Improved Discord field description with community benefits and download link

**Files Modified (13):**
| File | Changes |
|------|---------|
| `src/pages/onboarding/AwaitingApproval.tsx` | Rewritten: coach info fetch, polling, auto-redirect |
| `src/pages/onboarding/MedicalReview.tsx` | Rewritten: polling, auto-redirect, check status button |
| `src/pages/onboarding/Payment.tsx` | Rewritten: deadline countdown, discount code UI |
| `src/pages/OnboardingForm.tsx` | Gender field, direct redirect, save & exit, clickable steps |
| `src/components/onboarding/ServiceStep.tsx` | showGender, expanded referral sources, discord description |
| `src/components/onboarding/StepIndicator.tsx` | Rewritten: clickable completed steps with hover states |
| `src/components/onboarding/CoachPreferenceSection.tsx` | Fixed capacity counting: pending+active |
| `src/lib/auditLog.ts` | Added `onboarding_status` type + `logOnboardingStatusChange()` |
| `src/auth/onboarding.ts` | `logStatusChange()` now writes to `admin_audit_log` |
| `src/lib/coachMatching.ts` | Fixed to count pending+active subscriptions |
| `supabase/functions/submit-onboarding/index.ts` | Gender field, expanded referral source validation |
| `src/components/client/ClientDashboardLayout.tsx` | WelcomeModal integration |

**Files Created (1):**
| File | Purpose |
|------|---------|
| `src/components/client/WelcomeModal.tsx` | Post-payment welcome modal with coach info and getting-started steps |

**Key Bug Fix — Coach Matching Mismatch:**
Client-side (`CoachPreferenceSection.tsx`) was counting only `active` subscriptions to determine coach capacity, while server-side (`submit-onboarding/index.ts`) counted `pending + active`. This meant the coach preview could show a coach as available when they were actually at capacity. Fixed all 3 locations: `CoachPreferenceSection`, `coachMatching.ts:autoMatchCoachForClient`, `coachMatching.ts:validateCoachSelection`.

---

## ⚠️ Critical Warnings & Gotchas

### 1. Branding: Always "IGU", Never "Dr Iron"
The platform branding is **IGU** (The Intensive Gainz Unit). All references to "Dr Iron" must be replaced with "IGU". This applies to:
- Navigation bar (`src/components/Navigation.tsx`) — both desktop and mobile nav
- Any page titles, meta tags, or UI text
- The live site is `theigu.com`

### 2. Coach Data Lives in TWO Tables — Keep Them in Sync
There are two separate base tables for coach data that MUST stay in sync:
- `coaches` — the canonical base table (has `status`, `first_name`, etc.)
- `coaches_public` — a **separate base table** (NOT a view) with public-facing fields

The `coaches_full` **view** joins `coaches_public` + `coaches_private`. Most admin UI reads from `coaches_full`, which means it reads status from `coaches_public`, NOT from `coaches`.

**If you update `coaches.status`, you MUST also update `coaches_public.status`** — otherwise the admin UI (Service Limits, Load & Capacity) will filter out the coach.

Example of the bug this causes: `coaches.status = 'active'` but `coaches_public.status = 'pending'` → `coaches_full` returns `pending` → `activeCoaches` filter excludes the coach → Service Limits tab appears empty.

### 3. Navigation Status Badge — Not for Admin/Coach
The `getMemberStatus()` function in `Navigation.tsx` derives a status badge from client subscription data. Admin and coach roles don't have client subscriptions, so without an early return they fall through to "Status: Unknown". The function returns `null` for admin/coach roles.

### 4. PricingPayoutsCallout — Removed from CoachManagement
The `PricingPayoutsCallout` component exists in `src/components/admin/PricingPayoutsCallout.tsx` but is NOT imported or used anywhere. It was previously in `CoachManagement.tsx` placed outside any `TabsContent`, causing it to appear on every tab. Do not re-add it to CoachManagement.

### 5. Component Placement Inside Tabs
When using shadcn `Tabs`, all visible content must be inside a `<TabsContent value="...">` wrapper. Any JSX placed between `TabsContent` blocks but outside them will render on ALL tabs simultaneously.

### 6. Display DB Enums with a Label Map, Not String Replace
Never use `.replace('_', ' ')` + CSS `capitalize` to display database enum values. JS `.replace()` only replaces the **first** occurrence, so `one_to_one` becomes `"one to_one"`. Instead, use an explicit label map:
```tsx
// BAD — only replaces first underscore, produces "One To_one"
<span className="capitalize">{value.replace('_', ' ')}</span>

// GOOD — explicit, readable labels
const LABELS: Record<string, string> = { one_to_one: '1:1', team: 'Team' };
<span>{LABELS[value] ?? value}</span>
```

### 7. Empty State Messages Must Handle Empty Search
When showing "no results" messages that reference a search term, always handle the empty string case:
```tsx
// BAD — shows: No exercises found matching ""
<p>No exercises found matching "{searchTerm}"</p>

// GOOD
<p>{searchTerm ? `No exercises found matching "${searchTerm}"` : 'No exercises found'}</p>
```

---

### Recent Fix: Auth Session Persistence (Feb 2026)

**Problem**: Page refresh caused authentication failures - `getSession()` hung, auth headers didn't attach to Supabase client, RLS policies blocked queries, users got locked out of admin dashboard.

**Solution** (three layers):

1. **Cache-first role management** (Phase 8): Authorization checks use cached roles, not `getSession()`
2. **Navigator lock bypass** (Feb 8, 2026): Custom `lockWithTimeout()` in `client.ts` bypasses Navigator LockManager entirely — runs `fn()` directly without a lock
3. **initializePromise timeout** (Feb 8, 2026): Races `initializePromise` against 5s timeout + resets internal `lockAcquired`/`pendingInLock` state to break the deadlock queue

The root cause is a circular deadlock in Supabase's GoTrueClient:
1. `initialize()` → `_recoverAndRefresh()` → `_notifyAllSubscribers('SIGNED_IN')`
2. `_notifyAllSubscribers` **AWAITS** all `onAuthStateChange` listener callbacks
3. If ANY listener calls `getSession()`, it does `await this.initializePromise`
4. `initializePromise` is waiting for step 1 to finish → circular deadlock
5. The Navigator LockManager lock is never released, blocking ALL subsequent operations

The lock bypass + initializePromise timeout break both the lock-level and Promise-level deadlocks. Trade-off: no cross-tab token refresh coordination (concurrent refreshes are idempotent on server).

**Cache-first pattern details:**
- Cache user roles in localStorage after successful authentication
- Read cached roles instantly on page refresh (no waiting for session)
- Background verification with server (non-blocking)
- Use refs instead of state for authorization guards (avoids React batched update issues)

**Key Files**:
- `src/integrations/supabase/client.ts` - Custom `lockWithTimeout()` + `sessionReady` promise
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

### WorkoutSessionV2 Integration (Phase 21 - Feb 5, 2026)

Replaced the client workout session route with an enhanced workout logger (`WorkoutSessionV2`) featuring per-set prescriptions, history blocks, rest timer, and video thumbnails.

**Features:**
- Per-set prescription display (each set can have different reps, RIR, RPE, tempo, rest)
- Compact history blocks showing previous performance for the same exercise
- Personal best (PR) display per exercise
- Rest timer with circular SVG progress, pause/skip controls
- YouTube video thumbnails with modal player on exercise cards
- Progress bar tracking completed sets across the session
- Auto-expand first incomplete exercise on load
- Mobile-optimized input fields (inputMode for numeric keyboards)

**Data Flow:**
```
client_day_modules → client_module_exercises → exercise_set_logs
                     ↓
                     prescription_snapshot_json.sets_json (V2 per-set data)
                     OR legacy scalar fields (backward compat)
```

**Files Created:**
| File | Purpose |
|------|---------|
| `src/pages/client/WorkoutSessionV2.tsx` | Enhanced workout logger with all features above |

**Files Modified:**
| File | Change |
|------|--------|
| `src/App.tsx` | Added import, replaced route to use WorkoutSessionV2 |

**Fixes Applied (vs original draft):**
1. `useDocumentTitle` — changed `{ suffix }` to `{ description }` matching hook API
2. `Navigation` — added `user={user} userRole="client"` props for consistency
3. `sets_json` access — reads from `prescription_snapshot_json.sets_json` (not top-level column)
4. Coach name query — uses `coaches_client_safe` view with `.maybeSingle()` (RLS-safe)
5. History/PB queries — filters through `client_module_exercises` by `exercise_id` (same movement only)
6. Rest timer `onComplete` — uses ref to avoid stale closure in setInterval

**Backward Compatibility:**
- If `prescription_snapshot_json.sets_json` is null → `legacyToPerSet()` converts legacy shared prescription to per-set array
- Old `WorkoutSession` component kept as fallback (import retained in App.tsx)
- Uses `hasFetched` ref guard pattern for data fetching (consistent with Phase 16 pattern)

### Phase 22: Nutrition System Enhancement (Complete - Feb 7, 2026)

Added dietitian role support, additional tracking tables, and care team communication for the nutrition coaching system.

**New Tables:**
- `dietitians` - Dietitian profiles and credentials
- `step_logs` - Daily step tracking (observational NEAT data, not used in calorie calculations)
- `body_fat_logs` - Body fat percentage measurements with method tracking
- `diet_breaks` - Diet break periods with maintenance calories calculated from actual data
- `refeed_days` - Scheduled refeed days with target/actual macros
- `step_recommendations` - Coach/dietitian step targets for clients
- `care_team_messages` - Internal communication between coaches and dietitians (client cannot see)

**New Functions:**
- `is_dietitian(uuid)` - Check if user has dietitian role
- `is_dietitian_for_client(uuid, uuid)` - Check dietitian assignment via care_team_assignments
- `is_care_team_member_for_client(uuid, uuid)` - Combined coach/dietitian/admin check
- `client_has_dietitian(uuid)` - Check if client has active dietitian assignment
- `can_edit_nutrition(uuid, uuid)` - Permission hierarchy: Admin → Dietitian → Coach → Self

**Extended Tables:**
- `nutrition_phases` - Added `fiber_grams`, `steps_target`
- `nutrition_goals` - Added `coach_id_at_creation`
- `nutrition_adjustments` - Added `is_flagged`, `flag_reason`, `reviewed_by_dietitian_id` for >20% adjustment reviews

**Enums Extended:**
- `app_role` - Added `'dietitian'`
- `staff_specialty` - Added `'dietitian'`

**Key Design Decisions:**
1. **Steps are observational only** - NEAT coaching tool, not TDEE modifier. Used for recommendations like "add 2k steps before we cut more calories."
2. **±100 kcal tolerance band** - Not a cap. Within band = `no_change`, outside band = full adjustment applied. >20% = `flag_review` (flagged but allowed).
3. **Diet break maintenance from actual data** - Formula: `recent_avg_intake + (weekly_weight_change × 7700 / 7)`. Example: 1800 kcal + losing 0.5kg/week = 2350 kcal maintenance.
4. **Dietitian assignment via care_team_assignments** - Uses existing table with `specialty = 'dietitian'`
5. **When dietitian assigned**: Coach becomes read-only for nutrition, retains full training program control

**Migrations Applied (10 files):**
```
20260207100000_add_dietitian_role.sql        -- Enum additions (must commit before use)
20260207100001_dietitian_tables_functions.sql -- Dietitians table & helper functions
20260207100002_step_logs.sql
20260207100003_body_fat_logs.sql
20260207100004_diet_breaks.sql
20260207100005_refeed_days.sql
20260207100006_step_recommendations.sql
20260207100007_care_team_messages.sql
20260207100008_extend_existing_tables.sql
20260207100009_dietitian_policies.sql
```

### Phase 23: Full Site UI/UX Redesign (Complete - Feb 7, 2026)

Implemented a unified dark theme across the entire platform with CMS-driven public content and an admin content editor.

**Design System:**
- **Fonts**: DM Sans (body), Bebas Neue (display/headings), JetBrains Mono (code/prices)
- **Dark Theme**: Enabled by default via `class="dark"` on `<html>`
- **Colors**: Updated CSS variables in `.dark` block for consistent dark theme

**Key Color Variables:**
```css
.dark {
  --background: 240 10% 3.7%;       /* #09090B - page background */
  --card: 240 6% 8.4%;              /* #141418 - card backgrounds */
  --muted: 240 4% 11.8%;            /* #1C1C22 - muted backgrounds */
  --border: 240 4% 16.5%;           /* #27272A - borders */
  --foreground: 0 0% 98%;           /* #FAFAFA - primary text */
  --muted-foreground: 240 5% 64.9%; /* #A1A1AA - secondary text */
  /* Primary kept at 355 78% 56% (IGU red) */
}
```

**New Database Table: `site_content`**
```sql
site_content (
  id UUID PRIMARY KEY,
  page TEXT NOT NULL,           -- 'homepage', 'services', 'meet-our-team', 'calorie-calculator'
  section TEXT NOT NULL,        -- 'hero', 'features', 'programs', 'cta', etc.
  key TEXT NOT NULL,            -- 'title', 'subtitle', 'button_text', etc.
  value TEXT NOT NULL,          -- The actual content
  value_type TEXT NOT NULL,     -- 'text', 'richtext', 'number', 'url', 'json'
  sort_order INT,
  is_active BOOLEAN,
  UNIQUE (page, section, key)
)
```

**RLS Policies:**
- Public read access for active content
- Admin-only write access via `has_role(auth.uid(), 'admin')`

**New Hooks:**
| Hook | File | Purpose |
|------|------|---------|
| `useSiteContent` | `src/hooks/useSiteContent.ts` | Fetch CMS content by page, returns grouped `{ section: { key: value } }` |
| `useAllSiteContent` | `src/hooks/useSiteContent.ts` | Fetch all CMS content (for admin editor) |
| `useFadeUp` | `src/hooks/useFadeUp.ts` | IntersectionObserver hook for scroll-triggered fade animations |
| `useFadeUpList` | `src/hooks/useFadeUp.ts` | Same but for multiple elements |

**Helper Functions (in useSiteContent.ts):**
- `getUniquePages(content)` — Extract unique page names from content array
- `getSectionsForPage(content, page)` — Get sections for a specific page
- `getItemsForSection(content, page, section)` — Get items for a specific section
- `parseJsonField(value)` — Parse JSON arrays (for feature lists, etc.)
- `getNumericValue(value, fallback)` — Parse numbers with fallback

**New Admin Component:**
| Component | File | Purpose |
|-----------|------|---------|
| `SiteContentManager` | `src/components/admin/SiteContentManager.tsx` | Full CMS editor with page tabs, section accordions, field editors |

**SiteContentManager Features:**
- Page tabs (Homepage, Services, Meet Our Team, Calorie Calculator)
- Section accordions per page (Hero, Features, Programs, CTA, etc.)
- Field editors: text input, textarea (long text), number input
- JSON array editor for list fields (renders as editable items, not raw JSON)
- Per-field save with dirty tracking
- Toast notifications on save
- "View Live" button to open page in new tab
- "Refresh" button to reload content

**CSS Additions (in index.css):**
```css
/* Fade-up scroll animation */
.fade-up {
  opacity: 0;
  transform: translateY(20px);
  transition: all 0.6s cubic-bezier(0.23, 1, 0.32, 1);
}
.fade-up.visible {
  opacity: 1;
  transform: translateY(0);
}

/* Grid pattern background */
.grid-pattern { ... }

/* Red glow effect */
.red-glow { ... }
```

**Files Modified:**
| File | Changes |
|------|---------|
| `index.html` | Added `class="dark"`, Google Fonts links |
| `tailwind.config.ts` | Added fontFamily (sans, display, mono) |
| `src/index.css` | Updated `.dark` variables, added fade-up, grid-pattern, red-glow |
| `src/components/Footer.tsx` | Fixed routes: /team → /meet-our-team, /calculator → /calorie-calculator |
| `src/components/layouts/PublicLayout.tsx` | Dark glass-morphic nav, font-display on logo |
| `src/pages/Index.tsx` | CMS integration, Features section, fade animations |
| `src/pages/Services.tsx` | Dark theme, CMS section headers |
| `src/pages/MeetOurTeam.tsx` | Dark theme, lead coach highlight |
| `src/pages/CalorieCalculator.tsx` | Dark theme, CMS content |
| `src/lib/routeConfig.ts` | Added admin-site-content route |
| `src/pages/admin/AdminDashboard.tsx` | Added site-content to SECTION_MAP |
| `src/components/admin/AdminDashboardLayout.tsx` | Added SiteContentManager case |
| `src/components/admin/RefinedAdminDashboard.tsx` | Removed hardcoded colors, Sora font refs |

**Migrations Applied:**
```
20260207200000_create_site_content.sql    -- Table + RLS
20260207200001_seed_site_content.sql      -- Homepage, services, team, calculator content
```

**Pricing Source of Truth (KWD):**
- Team: 12 KWD
- 1:1 Online: 50 KWD
- Hybrid: 175 KWD
- In-Person: 250 KWD

### Phase 24: IGU Marketing System (Complete - Feb 7, 2026)

Implemented marketing improvements to increase conversions. Critical fix: pricing was hidden from unauthenticated visitors.

**Phase 0A: Fix Testimonials Manager Hang Bug**
- Added `hasFetched` ref guard to prevent infinite re-fetching
- Added `withTimeout` wrapper (5s timeout) for RPC calls that could hang
- File: `src/components/TestimonialsManager.tsx`

**Phase 1: Auth Gate Removal (Highest Impact)**
- Removed auth gates from Index.tsx and Services.tsx
- Created `services_public_read.sql` — allows anonymous users to view active services
- Visitors can now see all 4 pricing cards without signing in
- "Get Started" still redirects to `/auth?service=...&tab=signup`

**Phase 2: Quick Win Components**

New marketing components in `src/components/marketing/`:

| Component | File | Purpose |
|-----------|------|---------|
| `FAQSection` | `FAQSection.tsx` | Accordion FAQ section using shadcn, CMS-driven |
| `WhatsAppButton` | `WhatsAppButton.tsx` | Floating WhatsApp button (bottom-24 right-6, z-40), only shows if CMS has number |
| `ComparisonTable` | `ComparisonTable.tsx` | Plan comparison table with verified features |
| `HowItWorksSection` | `HowItWorksSection.tsx` | 4-step process: Choose Plan → Onboarding → Get Matched → Start Training |

**SEO Setup:**
- Installed `react-helmet-async` (~3KB)
- Created `src/components/SEOHead.tsx` for meta tags
- Added `HelmetProvider` wrapper in `src/main.tsx`

**Phase 3: Comparison Table**
- Shows all 4 plans side-by-side with feature checkmarks
- Features verified as built (excludes Video Form Reviews which is NOT built)
- Added to Services.tsx below pricing cards

**Phase 4: Leads & UTM Tracking**

New database table `leads`:
```sql
leads (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  source TEXT DEFAULT 'website',
  utm_source, utm_medium, utm_campaign, utm_content, utm_term TEXT,
  converted_to_user_id UUID REFERENCES auth.users(id),
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
```

New utility `src/lib/utm.ts`:
- `captureUTMParams()` — stores UTM params in sessionStorage (called on app mount)
- `getUTMParams()` — retrieves stored UTM params
- `clearUTMParams()` — clears after conversion

Newsletter signup added to Footer.tsx:
- Email input + Subscribe button
- Inserts into leads table with source='newsletter'
- Includes UTM params from session

**Phase 5: How It Works Section**
- 4-step visual guide between Features and Programs on homepage
- CMS-driven content with icon mapping

**Phase 6: Testimonials Enhancement**

New columns added to `testimonials`:
- `weight_change_kg NUMERIC` — positive for gain, negative for loss
- `duration_weeks INTEGER` — weeks in program
- `goal_type TEXT` — fat_loss, muscle_gain, strength, performance, recomp, general_health

New RLS policy: `Anyone can view approved testimonials` (TO anon, authenticated)

Updated TestimonialsManager.tsx:
- Stats badges display (weight change, duration, goal type)
- Inline stats editing for admins

**Phase 7: Referral System**

New database table `referrals`:
```sql
referrals (
  id UUID PRIMARY KEY,
  referrer_user_id UUID REFERENCES auth.users(id),
  referral_code TEXT UNIQUE,  -- Format: IGU-NAME-XXXX
  referred_email TEXT,
  referred_user_id UUID,
  status TEXT,  -- pending, signed_up, converted, rewarded, expired
  reward_type TEXT,
  reward_amount NUMERIC,
  created_at TIMESTAMPTZ
)
```

SQL function `generate_referral_code(first_name)`:
- Sanitizes name (uppercase, letters only, max 10 chars)
- Generates unique code: `IGU-{NAME}-{4 random chars}`
- Fallback to UUID prefix after 10 collision attempts

**Migrations Created (9 files):**
```
20260208_services_public_read.sql     -- Services visible to anon users
20260208_seed_faq.sql                 -- FAQ content for homepage
20260208_seed_whatsapp.sql            -- WhatsApp contact settings
20260208_seed_meta.sql                -- SEO meta tags for 4 pages
20260208_seed_how_it_works.sql        -- How It Works steps
20260208_create_leads.sql             -- Leads table + RLS
20260208_testimonials_stats.sql       -- Stats columns
20260208_testimonials_public.sql      -- Public read policy
20260208_create_referrals.sql         -- Referrals table + code generator
```

**Files Created:**
| File | Purpose |
|------|---------|
| `src/components/marketing/FAQSection.tsx` | FAQ accordion section |
| `src/components/marketing/WhatsAppButton.tsx` | Floating WhatsApp button |
| `src/components/marketing/ComparisonTable.tsx` | Plan comparison table |
| `src/components/marketing/HowItWorksSection.tsx` | 4-step process section |
| `src/components/SEOHead.tsx` | SEO meta tags component |
| `src/lib/utm.ts` | UTM parameter tracking utility |

**Files Modified:**
| File | Changes |
|------|---------|
| `src/components/TestimonialsManager.tsx` | hasFetched guard, timeout wrapper, stats fields |
| `src/pages/Index.tsx` | Removed auth gate, added FAQ & How It Works sections |
| `src/pages/Services.tsx` | Removed redirect, added ComparisonTable |
| `src/components/layouts/PublicLayout.tsx` | Added WhatsAppButton |
| `src/main.tsx` | Added HelmetProvider |
| `src/components/Footer.tsx` | Added newsletter signup with UTM tracking |
| `src/App.tsx` | Added UTM capture on mount |

### Admin QA Results (Feb 3, 2026)

10 known issues found across admin dashboard pages — **all fixed** (updated Feb 8):

**Critical (0 remaining)**:
1. ~~Testimonials page hangs on load~~ ✅ FIXED (Phase 24 - hasFetched guard + timeout wrapper)
2. ~~"Error loading services" spam in console~~ ✅ FIXED (Phase 16 - was infinite loop)

**Medium (0 remaining)**:
1. ~~Status shows "Unknown" briefly on page load~~ ✅ FIXED (related to auth cache)
2. ~~"One To_one" label instead of "1:1" in service names~~ ✅ FIXED (global regex replace, expanded formatServiceType)
3. ~~Empty state text inconsistencies~~ ✅ FIXED (standardized to "found" for filtered views, "yet" for create-first)
4. ~~Admin user flagged in system health checks~~ ✅ FIXED (skip admin/coach roles in active-profile-no-sub check)

**Low (0 remaining)**:
1. ~~No sidebar tooltips when collapsed~~ ✅ FIXED (Radix Tooltip on collapsed sidebar items)
2. ~~Stale build timestamp display~~ ✅ FIXED (dynamic __BUILD_TIMESTAMP__ via Vite define)
3. ~~/dashboard route shows loading state~~ ✅ FIXED (LoadingSpinner + instant cache-first role redirect)
4. ~~Sign-out flow doesn't redirect properly~~ ✅ FIXED (clear igu_* + sb-* keys, window.location.replace)

### Known Limitations
- No automated tests for components (only smoke tests)
- No staging environment (production only)
- Bundle size: ~441KB initial (down from 2.8MB after React.lazy + vendor chunk splitting in Phase 28)
- `getSession()` could hang on page refresh — mitigated by Navigator lock bypass + `initializePromise` timeout in `client.ts` + cache-first role pattern
- Edge functions: Always handle OPTIONS before `req.json()` to avoid CORS preflight crashes
- Resend emails must use `@mail.theigu.com` (only verified subdomain)
- React useEffect with useCallback dependencies can cause infinite loops — always use `hasFetched` ref guards for data fetching
- `coaches_public` is a VIEW (not a table) — auto-populated from coaches table, cannot INSERT directly
- Edge functions calling other edge functions must use `--no-verify-jwt` on the called function
- **`profiles` is a VIEW** (not a table) — joins `profiles_public` + `profiles_private`. You CANNOT use PostgREST FK joins like `profiles!subscriptions_user_id_fkey(...)` because the FK references `profiles_legacy`, not the view. Always use separate direct queries: `.from("profiles").select("email, first_name").eq("id", userId)`.
- **`coaches` table columns**: `first_name`, `last_name`, `nickname` — there is NO `name` column. Use `first_name`/`last_name`.
- **`services` table pricing column**: `price_kwd` — there is NO `price` column.
- **`account_status` enum values**: pending, active, suspended, approved, needs_medical_review, pending_payment, cancelled, expired, pending_coach_approval, inactive — there is NO `'new'` value.
- **`app_role` enum values**: member, coach, admin, dietitian — there is NO `'client'` value. The client role is `'member'`.
- **`form_submissions` table columns**: Does NOT have `red_flags_count`, `service_id`, or `notes_summary` — those columns exist only on `form_submissions_safe`. Triggers on `form_submissions` must not reference `NEW.red_flags_count`.
- **Two exercise tables**: `exercises` (legacy, mostly empty) and `exercise_library` (107 seeded exercises from Phase 28). The `WorkoutLibrary` page reads from BOTH. The workout builder's exercise picker reads from `exercise_library`. When adding exercises programmatically, use `exercise_library`.
- **`client_programs` FK join to `programs` is unreliable** — PostgREST may not find the relationship in the schema cache. Use a separate query: `.from("programs").select("name").eq("id", programId).maybeSingle()` instead of embedding `programs (name)` in the select.
- **OnboardingGuard allows dashboard paths**: Clients with incomplete onboarding can visit `/dashboard`, `/client`, `/client/dashboard` — `ClientDashboardLayout` shows appropriate limited UI (registration alert, medical review, coach approval, payment status). Non-dashboard client routes redirect to `/dashboard`. The `paymentVerified` state bypass for post-payment navigation still works.
- **Post-action navigation + OnboardingGuard race condition**: When navigating to `/dashboard` after a server-side status change (e.g., payment verification), pass `{ state: { paymentVerified: true } }` so OnboardingGuard doesn't redirect based on stale `profiles_public.status`. See `PaymentReturn.tsx` for the pattern.
- **All public-facing pages MUST be wrapped in `<PublicLayout>` in App.tsx** — this provides the consistent "IGU" navbar and footer. Never render a public page without PublicLayout, and never add `<Navigation />` or `<Footer />` inside a page component that is already wrapped in PublicLayout (causes duplicates). When creating a new public route, wrap it: `<Route path="/foo" element={<PublicLayout><Foo /></PublicLayout>} />`. When editing a page, check App.tsx first to see if it's already wrapped.
- **Team-based RLS requires dedicated policies.** Existing coach RLS checks `subscriptions.coach_id` and `is_primary_coach_for_user()`. For team queries (`WHERE team_id = X`), coaches need separate policies on both `subscriptions` (read by team_id) and `profiles_public` (read team member profiles). See migrations `20260212170000` and `20260212180000`.
- **Use `.maybeSingle()` instead of `.single()` for optional rows.** `.single()` throws an error when zero rows are returned (PostgREST 406). Use `.maybeSingle()` when the row may not exist (e.g., user presets, optional config, first-time setup). Only use `.single()` when you are certain exactly one row exists (e.g., after an INSERT...RETURNING, or querying by primary key that you know is present).

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
- WorkoutSessionV2 — per-set prescriptions, history, rest timer, video thumbnails, client route wired ✅ (Feb 5, 2026)
- Full Site UI/UX Redesign — dark theme, CMS-driven content, fonts, admin content editor ✅ (Feb 7, 2026)
- IGU Marketing System — auth gate removal, public pricing, FAQ, comparison table, leads/UTM, referrals ✅ (Feb 7, 2026)

**Completed (Phase 27-28)**:
- Client onboarding & dashboard QA ✅ (Feb 8, 2026)
- Workout Builder Phase 2 — exercise swap, direct calendar editor, volume chart ✅ (Feb 8, 2026)
- Cloudflare Turnstile on coach application form ✅ (Feb 8, 2026)
- Exercise library populated (107 exercises seeded) ✅ (Feb 8, 2026)
- Mobile responsive fixes (8 critical/high items) ✅ (Feb 8, 2026)
- End-to-end client journey testing ✅ (Feb 8, 2026)
- Performance optimization — React.lazy + vendor chunks, 2.8MB → 441KB ✅ (Feb 8, 2026)
- Security audit — error sanitization, rate limiting, default role trigger ✅ (Feb 8, 2026)
- Admin QA polish — all 10 issues resolved ✅ (Feb 8, 2026)

**Completed (Phase 29+)**:
- n8n automation workflows — 10 scheduled workflows for platform operations ✅ (Feb 9, 2026)
  - 8 new edge functions + 2 existing (send-admin-daily-summary, send-weekly-coach-digest)
  - Abandoned onboarding recovery drip (day 1/3/7)
  - Payment failure recovery drip (day 1/2/5/9, includes coach notification)
  - Inactive client alerts to coaches (5+ days no training)
  - Lead nurture drip (day 1/3/7 for newsletter signups)
  - Testimonial requests (4+ weeks active, weekly)
  - Renewal reminders (3 days before billing, monthly dedup)
  - Referral program reminders (2+ weeks active, lifetime dedup)
  - Coach inactivity alerts to admins (7+ days no login, weekly dedup)
- Workout Builder INP performance fix — memoization across 7 component files ✅ (Feb 9, 2026)
- Edge function DB query fix — repaired 7 n8n edge functions with broken FK joins and wrong column names ✅ (Feb 9, 2026)
- Client onboarding submission fix — 3 trigger bugs + gateway JWT rejection + functions auth recovery ✅ (Feb 9, 2026)

**Not launched yet**:
- Backup/recovery procedures (operational, not code)

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
- ✅ WorkoutSessionV2 wired into client routing (Phase 21) — replaces old WorkoutSession route

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
| Workout logging | ✅ Routed (Phase 21) | WorkoutSessionV2 replaces old route |
| Draft/Publish | ✅ Per-session toggle | |
| Session copy/paste | ✅ Clipboard-based deep copy | Copy from dropdown, paste on any day |
| Teams | ✅ | Phase 32 — team CRUD, fan-out assignment, readOnly calendar |
| Volume tracking | ✅ | Phase 28 |
| Exercise swap | ✅ | Phase 28 |

### Phase 2 — Status

- ✅ Direct calendar exercise editing (DirectSessionExerciseEditor)
- ✅ Exercise swap functionality (SwapExercisePicker in WorkoutSessionV2)
- ✅ Volume tracking / per-muscle analytics (useVolumeTracking + VolumeChart)
- ✅ Team programs — Phase 32: team CRUD, fan-out program assignment, readOnly calendar preview
- ❌ Exercise history sheet UI — deferred

---

## n8n Automation Workflows (Phase 29 - Feb 9, 2026)

Platform operations are automated via n8n Cloud (`theigu.app.n8n.cloud`). Each workflow calls a Supabase edge function on a schedule. The edge functions handle all business logic — n8n is just a scheduler.

**Architecture**: n8n Schedule Trigger → HTTP POST to edge function (Bearer service role key) → edge function queries DB, sends emails via Resend, logs to `email_notifications` for dedup → returns JSON summary.

**All n8n edge functions use `--no-verify-jwt`** (called with service role key, not user JWT).

| Time (UTC) | Workflow | Frequency | Edge Function | Purpose |
|------------|----------|-----------|---------------|---------|
| 6:00 AM | Admin Daily Summary | Daily | `send-admin-daily-summary` | Platform health snapshot to admins (active subs, new signups, failed payments, pending apps) |
| 7:00 AM | Weekly Coach Digest | Weekly (Mon) | `send-weekly-coach-digest` | Per-coach summary of active clients, workout activity, inactive clients |
| 8:00 AM | Renewal Reminders | Daily | `process-renewal-reminders` | 3-day advance billing renewal notice to clients (monthly dedup) |
| 8:30 AM | Coach Inactivity Monitor | Daily | `process-coach-inactivity-monitor` | Alert admins if active coach hasn't logged in 7+ days (weekly dedup per coach) |
| 9:00 AM | Testimonial Request | Weekly | `process-testimonial-requests` | Request testimonials from clients after 4+ weeks active (lifetime dedup) |
| 9:00 AM | Referral Reminders | Weekly | `process-referral-reminders` | Remind clients about referral program after 2+ weeks active (lifetime dedup) |
| 9:30 AM | Payment Failure Recovery | Daily | `process-payment-failure-drip` | Escalating drip (day 1/2/5/9) for failed payments, day 5 notifies coach |
| 10:00 AM | Abandoned Onboarding | Daily | `process-abandoned-onboarding` | Drip (day 1/3/7) for stale onboarding drafts with resume links |
| 10:30 AM | Inactive Client Alert | Daily | `process-inactive-client-alerts` | Alert coach when client hasn't trained in 5+ days |
| 11:00 AM | Lead Nurture | Daily | `process-lead-nurture` | Drip (day 1/3/7) for unconverted newsletter leads |

**Deduplication**: All functions check `email_notifications` table before sending. Each uses a `notification_type` string (e.g., `abandoned_onboarding_day1`, `payment_failure_day2`) to prevent duplicate sends.

**Testing**: Call any function directly via curl:
```bash
curl -X POST https://ghotrbotrywonaejlppg.supabase.co/functions/v1/<function-name> \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

---

## Edge Function Deployment Reference

Quick reference for edge function JWT settings:

| Function | JWT Required | Reason |
|----------|--------------|--------|
| `create-coach-account` | No | Called during admin approval flow |
| `send-coach-invitation` | **No** | Called by other edge functions |
| `send-coach-application-emails` | **No** | Called by anonymous users |
| `tap-webhook` | **No** | Called by payment provider |
| `create-tap-payment` | **No** | Gateway rejects ES256 JWTs; has internal auth checks |
| `verify-payment` | **No** | Gateway rejects ES256 JWTs; has internal auth checks |
| `process-abandoned-onboarding` | **No** | Called by n8n (service role key) |
| `process-payment-failure-drip` | **No** | Called by n8n (service role key) |
| `process-inactive-client-alerts` | **No** | Called by n8n (service role key) |
| `process-lead-nurture` | **No** | Called by n8n (service role key) |
| `process-testimonial-requests` | **No** | Called by n8n (service role key) |
| `process-renewal-reminders` | **No** | Called by n8n (service role key) |
| `process-referral-reminders` | **No** | Called by n8n (service role key) |
| `process-coach-inactivity-monitor` | **No** | Called by n8n (service role key) |
| `send-admin-daily-summary` | **No** | Called by n8n (service role key) |
| `send-weekly-coach-digest` | **No** | Called by n8n (service role key) |
| `submit-onboarding` | **No** | Gateway rejects ES256 JWTs; function has internal auth checks |

Deploy without JWT: `supabase functions deploy <name> --no-verify-jwt`

---

## Workout Builder INP Performance Fix (Feb 9, 2026)

Fixed severe UI freezes (4-51 seconds) on basic workout builder interactions (clicking "Calendar View", toggling exercises, opening column dropdowns). Root cause: zero memoization across the entire component tree — a single state change cascaded re-renders through hundreds of components.

**Approach:** Added `React.memo`, `useMemo`, and `useCallback` at every level of the component tree.

**Files Modified (7):**

| File | Changes |
|------|---------|
| `src/components/coach/programs/SetRowEditor.tsx` | Wrapped in `React.memo` with custom comparator. Memoized `visiblePrescriptionCols` and `visibleInputCols` with `useMemo`. |
| `src/components/coach/programs/ColumnCategoryHeader.tsx` | Wrapped in `React.memo`. Memoized `visiblePrescriptionCols` and `visibleInputCols` with `useMemo`. |
| `src/components/coach/programs/ColumnConfigDropdown.tsx` | Wrapped in `React.memo`. Memoized `visibleColumns`, `hiddenColumns`, `availableToAdd` with `useMemo`. |
| `src/components/coach/programs/ExerciseCardV2.tsx` | Wrapped in `React.memo` with custom comparator. Created stable per-index callback maps via `useRef<Map>` for `onSetChange`/`onDeleteSet` (cache invalidation on handler change). Extracted inline Textarea `onChange` to stable `handleInstructionsChange`. |
| `src/components/coach/programs/EnhancedModuleExerciseEditor.tsx` | Memoized `groupedExercises` with `useMemo` (was 4x filter + 4x sort every render). Stabilized `updateExercise` with `useCallback`. Created per-exercise callback maps (`getExerciseChangeCallback`, `getExerciseDeleteCallback`). Wrapped `ExercisePickerDialog` callback in `useCallback`. |
| `src/components/coach/programs/ProgramCalendarBuilder.tsx` | Memoized `currentWeek` with `useMemo`. Extracted inline rendering into memoized `SessionCard` and `DayCell` components. Stabilized `handleCopySession`/`handleAddSession` with `useCallback`. |
| `src/components/coach/programs/CoachProgramsPage.tsx` | Wrapped all handlers in `useCallback`. Extracted inline `onEditDay` to stable `handleEditDay`. |

**Key Pattern — Stable Per-Index Callbacks:**

When passing callbacks to list items (e.g., `onSetChange` per set row), inline arrows like `(updated) => handleSetChange(index, updated)` create new function references on every render, defeating `React.memo`. The fix uses a ref-backed callback map:

```typescript
const callbacksRef = useRef<Map<number, (updated: T) => void>>(new Map());

// Clear cache when underlying handler changes
useMemo(() => { callbacksRef.current = new Map(); }, [handler]);

const getCallback = useCallback((index: number) => {
  const existing = callbacksRef.current.get(index);
  if (existing) return existing;
  const cb = (updated: T) => handler(index, updated);
  callbacksRef.current.set(index, cb);
  return cb;
}, [handler]);

// Usage in JSX:
<SetRowEditor onSetChange={getCallback(index)} />
```

---

## Edge Function DB Query Fix (Feb 9, 2026)

Fixed 7 n8n edge functions that were returning HTTP 500 due to incorrect database queries. 6 of 10 n8n workflows were failing in production.

**Root Causes (3 issues):**

1. **`profiles` is a VIEW, not a table.** The `profiles` view joins `profiles_public` + `profiles_private`. The FK `subscriptions_user_id_fkey` references `profiles_legacy` (a separate table), NOT the `profiles` view. PostgREST FK join syntax `profiles!subscriptions_user_id_fkey(...)` fails because it tries to join the view using an FK that doesn't reference it.

2. **`coaches` table has no `name` column.** The actual columns are `first_name` and `last_name`. Queries like `coaches.select("user_id, name")` returned PostgREST errors.

3. **`services` table has `price_kwd`, not `price`.** The renewal reminders function queried a non-existent column.

**The `profiles` view definition:**
```sql
SELECT pp.id, priv.email, priv.full_name, priv.phone, pp.status,
       pp.created_at, pp.updated_at, pp.first_name, priv.last_name, ...
FROM profiles_public pp
LEFT JOIN profiles_private priv ON pp.id = priv.profile_id;
```

**FK constraints on `subscriptions`:**
| FK Name | Column | References |
|---------|--------|------------|
| `subscriptions_user_id_fkey` | `user_id` | `profiles_legacy.id` |
| `subscriptions_user_id_profiles_public_fk` | `user_id` | `profiles_public.id` |
| `subscriptions_coach_id_fkey` | `coach_id` | `coaches.user_id` |
| `subscriptions_service_id_fkey` | `service_id` | `services.id` |

**Fix applied:** Replaced all `profiles!subscriptions_user_id_fkey(...)` FK joins with separate direct queries to the `profiles` view:

```typescript
// BROKEN — FK references profiles_legacy, not the profiles view
const { data } = await supabase
  .from("subscriptions")
  .select("id, user_id, profiles!subscriptions_user_id_fkey(email, first_name)")
  .eq("status", "active");

// FIXED — direct query to the profiles view
const { data: subs } = await supabase
  .from("subscriptions")
  .select("id, user_id")
  .eq("status", "active");

for (const sub of subs) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, first_name")
    .eq("id", sub.user_id)
    .maybeSingle();
}
```

**Files Fixed (7):**

| File | Issues Fixed |
|------|-------------|
| `supabase/functions/send-weekly-coach-digest/index.ts` | `coaches.name` → `first_name, last_name`; removed FK join on subscriptions; separate profiles query per client |
| `supabase/functions/process-referral-reminders/index.ts` | Removed FK join; separate profiles query per subscription |
| `supabase/functions/process-inactive-client-alerts/index.ts` | Removed FK join; separate profiles query; removed redundant `coaches.name` query |
| `supabase/functions/process-coach-inactivity-monitor/index.ts` | `coaches.name` → `first_name, last_name`; updated name display logic |
| `supabase/functions/process-renewal-reminders/index.ts` | Removed FK join; `services(name, price)` → `services(name, price_kwd)`; separate profiles query |
| `supabase/functions/process-testimonial-requests/index.ts` | Removed FK join; separate profiles query per subscription |
| `supabase/functions/process-payment-failure-drip/index.ts` | Removed FK join (latent bug — only passed because 0 failed subscriptions existed) |

**Result:** All 10/10 n8n edge functions return HTTP 200.

**Rule for edge functions:** Never use PostgREST FK joins to the `profiles` view. Always query `.from("profiles")` directly with `.eq("id", userId)`.

---

## Post-Payment Dashboard Navigation Fix (Feb 10, 2026)

Fixed a race condition where the "Go to Dashboard" button on the payment success page didn't work — clients had to refresh the page manually.

**Root Cause:** `PaymentReturn.tsx` navigates to `/dashboard` after `verify-payment` confirms `active`, but `OnboardingGuard` immediately re-queries `profiles_public.status` which can still return `pending_payment` due to DB replication lag. The guard then redirects back to the onboarding/payment page.

**Fix:** Pass `{ state: { paymentVerified: true } }` via React Router navigation from PaymentReturn. OnboardingGuard checks this state and skips the redirect specifically when status is `pending_payment` and `paymentVerified` is true.

**Update (Feb 12, 2026):** OnboardingGuard now allows all dashboard paths through for incomplete onboarding (see "Limited Dashboard for Incomplete Onboarding" section). The `paymentVerified` bypass is still needed specifically for `pending_payment` status where the DB is stale but the client should see a fully active dashboard, not the limited payment-status UI.

**Files Modified:**
| File | Change |
|------|--------|
| `src/pages/PaymentReturn.tsx` | Both auto-redirect (3s timer) and "Go to Dashboard Now" button pass `paymentVerified` state |
| `src/components/OnboardingGuard.tsx` | Skip onboarding redirect when `paymentVerified` + `pending_payment` (both useEffect and render guard); allow dashboard paths for incomplete onboarding |

**Pattern — Post-action navigation with stale DB:** When navigating after a server-side status change, pass confirmation state via React Router `navigate()` so guards don't bounce the user back due to stale reads. Only bypass the specific stale status, not all statuses.

---

## Client Onboarding Submission Fix (Feb 9, 2026)

Fixed 4 layered bugs preventing the client onboarding form from submitting successfully. Discovered during live QA testing of the Fe Squad signup flow on theigu.com.

**Bug 1 — Supabase Gateway JWT Rejection (HTTP 401):**
The `submit-onboarding` edge function was blocked by the Supabase gateway before the function code even ran. The client sent a valid ES256 JWT, but the gateway's `verify_jwt: true` setting rejected it. Evidence: response CORS headers were missing `content-type` (the function adds it, the gateway doesn't). Fix: Deployed with `--no-verify-jwt`. The function already has internal auth checks (lines 159-182 of `submit-onboarding/index.ts`).

**Bug 2 — `sync_form_submissions_safe()` trigger crash (HTTP 500 — "Failed to submit form"):**
The AFTER INSERT trigger on `form_submissions` referenced `NEW.red_flags_count`, but that column does not exist on `form_submissions` — it only exists on `form_submissions_safe`. PostgreSQL error: `record "new" has no field "red_flags_count"`. Fix: Replaced `COALESCE(NEW.red_flags_count, 0)` with literal `0`.

**Bug 3 — `ensure_default_client_role()` trigger, invalid enum 'new' (HTTP 500 — "Failed to update profile"):**
The AFTER UPDATE trigger on `profiles_public` had `OLD.status IN ('new', 'pending')`, but `'new'` is not a valid `account_status` enum value. Fix: Changed to `OLD.status = 'pending'`.

**Bug 4 — `ensure_default_client_role()` trigger, invalid enum 'client' (HTTP 500 — "Failed to update profile"):**
Same trigger inserted `role = 'client'` into `user_roles`, but `'client'` is not a valid `app_role` enum value (the correct value is `'member'`). Fix: Changed `'client'` to `'member'`.

**Bug 5 — Functions auth token not attached after initializePromise timeout:**
When `initializePromise` times out (see Auth Session Persistence section), `getSession()` returns null even though a valid session exists in localStorage. The internal `onAuthStateChange` listener never fires, so `supabase.functions.invoke()` falls back to the anon key. Fix: After `getSession()` returns null, recover the access token from localStorage and call `supabase.functions.setAuth()`. This was defense-in-depth — the primary fix was Bug 1.

**Files Modified/Created:**

| File | Change |
|------|--------|
| `src/integrations/supabase/client.ts` | Added localStorage recovery for functions auth token when getSession returns null |
| `supabase/migrations/20260209_fix_onboarding_triggers.sql` | Migration documenting all 3 trigger fixes (applied directly via SQL during QA) |

**Database Functions Fixed (applied via SQL, recorded in migration):**
- `sync_form_submissions_safe()` — `NEW.red_flags_count` → `0`
- `ensure_default_client_role()` — removed `'new'` from status check, changed `'client'` to `'member'`

**Edge Function Deployment:**
```bash
npx supabase functions deploy submit-onboarding --no-verify-jwt
```

**Result:** Client onboarding form submits successfully. User transitions from onboarding to payment page.

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
- `src/components/TestimonialsManager.tsx`
- `src/hooks/useRoleGate.ts`
- `src/hooks/useColumnConfig.ts`
- `src/hooks/useProgramCalendar.ts`
- `src/hooks/useExerciseHistory.ts`
- `src/components/coach/programs/EnhancedModuleExerciseEditor.tsx`
- `src/components/coach/programs/ProgramCalendarBuilder.tsx`
- `src/components/coach/programs/DirectClientCalendar.tsx`
- `src/components/client/EnhancedWorkoutLogger.tsx`
- `src/pages/client/WorkoutSessionV2.tsx`
