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

## Current State (Jan 2026)

### Completed Phases
- Phase 0: Build stability, ESLint fixes
- Phase 1: Access control consolidation
- Phase 2: Database RLS alignment
- Phase 3: Navigation and responsive UI
- Phase 4: Client onboarding flows
- Phase 5: Payment integration (Tap)
- Phase 6: Observability (Sentry, error logging)
- Phase 7: CI/CD pipeline (GitHub Actions)

### Known Limitations
- No automated tests for components (only smoke tests)
- No staging environment (production only)
- Bundle size is large (~2.4MB) - needs code splitting

---

## Auth Session Refresh Fix - In Progress

### Problem
- Fresh sign-in works perfectly (query completes in ~200ms)
- Page refresh causes user_roles query to timeout/hang
- Root cause: getSession() hangs on page refresh, and Supabase client loses auth context

### Fixes Applied (Database)
- is_admin() function now has SECURITY DEFINER (bypasses RLS)
- has_role() function now has SECURITY DEFINER
- is_admin_internal() helper function created

### Fixes Applied (Code)
- RoleProtectedRoute.tsx: Added 5s timeout for user_roles query
- RoleProtectedRoute.tsx: Added 2s timeout for getSession() call
- RoleProtectedRoute.tsx: Now uses setSession() with tokens from onAuthStateChange before querying
- Extensive debug logging added

### Current Branch
claude/fix-dashboard-session-timeout-qC5p5

### Latest Commit
97832e1 fix: use setSession to ensure auth headers before query

### Next Steps
1. Test if setSession() fix resolves the refresh issue
2. If not, may need to investigate why Supabase client loses auth context on refresh
3. Clean up debug logging once fixed

### Other Issues Found
- Public homepage queries (testimonials, team_plan_settings) return 401 - need public RLS policies
- These are separate from the auth refresh issue

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
