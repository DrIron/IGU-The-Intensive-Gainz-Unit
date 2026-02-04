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
│   │   ├── coach/            # Coach-specific components
│   │   ├── client/           # Client-specific components
│   │   ├── layouts/          # Layout components (PublicLayout, etc.)
│   │   ├── AuthGuard.tsx     # Auth-only route protection
│   │   ├── RoleProtectedRoute.tsx  # Role-based route protection
│   │   ├── OnboardingGuard.tsx     # Onboarding flow enforcement
│   │   ├── PermissionGate.tsx      # Feature-level permission checks
│   │   └── GlobalErrorBoundary.tsx # Error boundary with Sentry
│   ├── hooks/                # Custom React hooks
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

### Admin QA Results (Feb 3, 2026)

10 known issues found across admin dashboard pages:

**Critical (2)**:
1. Testimonials page hangs on load
2. "Error loading services" spam in console

**Medium (4)**:
1. Status shows "Unknown" briefly on page load
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

**In Progress**:
- Coach approval/rejection email flow QA
- Coach dashboard QA
- Client onboarding & dashboard QA

**Remaining**:
- Fix critical issues (testimonials hang, services error spam)
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
