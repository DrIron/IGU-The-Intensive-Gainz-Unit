# IGU — The Intensive Gainz Unit

Fitness coaching platform connecting coaches with clients. Handles client onboarding, intake forms, workout programming & tracking, payments (Tap), PAR-Q medical questionnaires, and coach-client relationship management.

**Production:** https://theigu.com

> **Dated narratives moved out.** For phase-by-phase history, fix writeups, and background context, see `docs/history.md`. This file is the current-state reference.

---

## Tech Stack

**Frontend:** React 19 + TypeScript, Vite 5, Tailwind + shadcn/ui, React Router v6, TanStack Query, React Hook Form + Zod, `@hello-pangea/dnd`, react-helmet-async, i18next.

**Backend:** Supabase (Postgres + Auth + Storage + Edge Functions / Deno).

**Infrastructure:** Vercel (hosting + Cron), Sentry, Resend, Tap Payments (Kuwait/GCC).

---

## Project Structure

```
/
├── src/
│   ├── auth/                 # roles.ts (CANONICAL role/permission defs), onboarding.ts
│   ├── components/
│   │   ├── ui/               # shadcn/ui + clickable-card.tsx (use instead of <Card onClick>)
│   │   ├── admin/  coach/  client/  marketing/  layouts/
│   │   ├── AuthGuard.tsx RoleProtectedRoute.tsx OnboardingGuard.tsx PermissionGate.tsx
│   │   ├── WaitlistGuard.tsx   # Pre-launch waitlist mode
│   │   └── GlobalErrorBoundary.tsx
│   ├── i18n/                 # react-i18next setup, en/ar locales
│   ├── hooks/
│   ├── integrations/supabase/  # client + generated types
│   ├── lib/
│   │   ├── routeConfig.ts    # CANONICAL route registry
│   │   ├── payments.ts
│   │   ├── errorLogging.ts
│   │   ├── utm.ts
│   │   ├── assignProgram.ts  # Shared program assignment (fan-out for teams)
│   │   ├── withTimeout.ts    # Promise timeout wrapper
│   │   ├── statusUtils.ts    # getLoadColor, formatServiceType, format*Status
│   │   └── utils.ts          # cn() etc.
│   ├── pages/                # admin/ coach/ client/ onboarding/
│   ├── App.tsx               # Route definitions + guards
│   └── main.tsx              # Sentry init, i18n init
├── supabase/
│   ├── functions/
│   │   ├── _shared/          # emailTemplate.ts, emailComponents.ts, sendEmail.ts, config.ts, rateLimit.ts
│   │   └── ...               # Edge Functions
│   ├── migrations/
│   └── config.toml
├── docs/                     # history.md + feature specs
├── .github/workflows/ci.yml
└── vercel.json               # SPA routing + cron jobs (dispatcher at /api/cron.ts)
```

---

## Key Concepts

### 1. Role-Based Access Control

Roles in `src/auth/roles.ts`:
- `admin` — full access
- `coach` — manage assigned clients, view workouts
- `client` (= `member` in `app_role` enum) — own data, complete workouts

```typescript
import { hasRole, isAdmin, getPrimaryRole, hasPermission } from '@/auth/roles';
hasPermission(roles, 'view_phi');
```

### 2. Route Protection (four layers)

```typescript
// 0. WaitlistGuard — redirects unauthenticated visitors when waitlist is ON
//    Wraps: /, /services, /testimonial, /calorie-calculator, /meet-our-team
//    Does NOT wrap: /auth, /waitlist, /reset-password, /email-confirmed, /coach-signup
<WaitlistGuard><PublicLayout><Index /></PublicLayout></WaitlistGuard>

// 1. AuthGuard — requires login only
// 2. RoleProtectedRoute — requires specific roles (uses raw fetch() to bypass Supabase client for role checks)
// 3. OnboardingGuard — enforces onboarding completion for clients
//    Dashboard paths (/dashboard, /client, /client/dashboard) pass through even when incomplete —
//    ClientDashboardLayout handles the limited UI. Non-dashboard paths redirect TO /dashboard.
```

### 3. Route Registry

All routes in `src/lib/routeConfig.ts`:

```typescript
export const ROUTE_REGISTRY = {
  '/dashboard': { roles: ['client'], layout: 'client', nav: { label: 'Dashboard', icon: Home, order: 1 } },
  // ...
};
```

### 4. Client Onboarding State Machine

`src/auth/onboarding.ts`:

```typescript
type ClientStatus =
  | 'pending'                // Intake form incomplete
  | 'needs_medical_review'   // PAR-Q flagged
  | 'pending_coach_approval'
  | 'pending_payment'
  | 'active'
  | 'suspended' | 'cancelled';
```

Note: `'new'` is NOT a valid `account_status` enum value (past trigger bugs referenced it — don't reintroduce).

### 5. Database Schema (Key Tables)

```sql
-- User profiles (split for security)
profiles_public    -- id, first_name, display_name, status, avatar_url
profiles_private   -- profile_id, email, last_name, phone, dob (PII)
-- IMPORTANT: `profiles` is a VIEW joining profiles_public + profiles_private

-- Medical (PHI - encrypted)
parq_submissions   form_submissions

-- Relationships
coach_client_relationships   user_roles

-- Payments
subscriptions   payments

-- Workouts
programs   workout_sessions   exercise_logs
exercise_prescriptions         -- column_config JSONB, sets_json JSONB (V2 per-set)

-- Workout Builder
coach_column_presets           -- Per-coach saved column configs
direct_calendar_sessions       -- Ad-hoc sessions on client calendars
direct_session_exercises
day_modules client_day_modules -- Have session_type, session_timing columns

-- Coach Configuration
specialization_tags            -- Admin-managed standardized tags
subrole_definitions            -- coach, dietitian, physiotherapist, sports_psychologist, mobility_coach
user_subroles                  -- user_id + subrole_id, status enum (pending/approved/rejected/revoked)

-- Nutrition
nutrition_phases nutrition_goals weight_logs circumference_logs adherence_logs
nutrition_adjustments coach_nutrition_notes dietitians step_logs body_fat_logs
diet_breaks refeed_days step_recommendations care_team_messages care_team_assignments

-- CMS
site_content   -- page, section, key, value, value_type

-- Marketing
leads         -- Newsletter + lead tracking with UTM params, invited_at for waitlist
referrals     -- Referral codes (IGU-NAME-XXXX) + conversion tracking

-- Compensation
professional_levels        -- Hourly rates: role × level × work_type (9 seeded)
service_hour_estimates     -- Estimated monthly hours per service × role × work_type
igu_operations_costs       -- Fixed IGU ops costs per service tier
staff_professional_info    -- Level tracking for non-coach professionals
addon_services addon_purchases addon_session_logs

-- Planning Board / Muscle Workout Builder
muscle_program_templates   -- slot_config JSONB: { weeks: WeekData[], globalClientInputs, globalPrescriptionColumns }

-- Team Plan Builder
coach_teams                -- Head coach teams: name, tags[], max_members, current_program_template_id
-- client_programs.team_id and subscriptions.team_id (nullable FKs)

-- Waitlist
waitlist_settings          -- Single-row: is_enabled, heading, subheading (anon read, admin write)
```

### 5b. Service Tiers & Compensation

| Tier | Slug | Price (KWD) | Coach | Dietitian |
|------|------|-------------|-------|-----------|
| Team Plan | `team_plan` | 12 | Head Coach (5 KWD flat) | — |
| 1:1 Online | `one_to_one_online` | 40 | Hourly | — |
| 1:1 Complete | `one_to_one_complete` | 75 | Hourly | Hourly |
| Hybrid | `hybrid` | 150 | Hourly (online + in-person) | Hourly |
| In-Person | `in_person` | 250 | Hourly + profit split | Hourly + profit split |

**Professional Levels** (admin-assigned, affects hourly rate only, NOT client pricing):
- Junior / Senior / Lead — coaches and dietitians
- In `src/auth/roles.ts`: `ProfessionalLevel`, `COACH_RATES`, `DIETITIAN_RATES`
- DB: `coaches_public.coach_level`, `staff_professional_info.level`

**Head Coach** — boolean on `coaches_public`, leads a team plan track. Fixed 5 KWD/client/month.

**Payout Functions (SECURITY DEFINER):**
```sql
calculate_subscription_payout(subscription_id UUID, discount_percentage NUMERIC DEFAULT 0)
  -- Returns JSONB: { coach_payout, dietitian_payout, igu_ops, igu_profit, total, blocked, block_reason }
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
3. Level — Junior | Senior | Lead — admin-assigned, sets hourly rate
4. Tags — self-service marketing labels, no permissions

### 6. Row Level Security

All tables have RLS enabled. Users can read/write own data; coaches can read assigned clients' non-PHI; admins read all; PHI requires explicit permission.

Helper functions:
```sql
-- Role checks
public.has_role(uuid, app_role)   public.is_admin(uuid)   public.is_coach(uuid)   public.is_dietitian(uuid)
public.has_approved_subrole(user_id, slug)   public.get_user_subroles(user_id)

-- Relationship checks
public.is_primary_coach_for_user(coach, client)
public.is_dietitian_for_client(dietitian, client)
public.is_care_team_member_for_client(staff, client)

-- Permission checks
public.can_build_programs(user_id)           -- coach/physio/mobility_coach
public.can_assign_workouts(user_id)
public.can_write_injury_notes(user_id)       -- physiotherapist only
public.can_write_psych_notes(user_id)        -- sports_psychologist only
public.can_edit_nutrition(actor, client)     -- Admin → Dietitian → Coach → Self
public.client_has_dietitian(client)

-- Compensation
public.calculate_subscription_payout(sub_id, discount%)
public.calculate_addon_session_payout(addon_id, level)
```

---

## Environment Variables

**Frontend (Vite — must be `VITE_` prefixed):**
```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
VITE_SENTRY_DSN=https://xxx@sentry.io/xxx
```

**Edge Functions (via `supabase secrets set`):**
```
TAP_SECRET_KEY=sk_live_xxx
TAP_WEBHOOK_SECRET=whsec_xxx
RESEND_API_KEY=re_xxx
PHI_ENCRYPTION_KEY=xxx (stored in Vault)
```

**Vercel (Dashboard > Settings > Environment Variables):**
- `CRON_SECRET` — random 32+ char string
- `SUPABASE_URL` — server-side only (no `VITE_` prefix)
- `SUPABASE_SERVICE_ROLE_KEY`

---

## Common Patterns

### React Query
```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ['clients', userId],
  queryFn: () => supabase.from('profiles_public').select('*'),
});
```

QueryClient defaults: `staleTime: 5min`, `gcTime: 30min`, `refetchOnWindowFocus: false`. Override per-query with `staleTime: 0` for real-time data.

### Forms
```typescript
const form = useForm<FormData>({
  resolver: zodResolver(formSchema),
  defaultValues: { ... },
});
```

### Error Logging
```typescript
import { captureException } from '@/lib/errorLogging';
try { /* risky */ } catch (error) {
  captureException(error, { context: 'payment_processing' });
}
```

### Toasts
```typescript
import { toast } from 'sonner';
toast.success('Saved'); toast.error('Something went wrong');
```

### i18n
```typescript
const { t } = useTranslation('nav');       // Navigation/Footer
const { t } = useTranslation('common');    // Shared buttons/labels (default)
<Button>{t('signIn')}</Button>
<Button>{t('common:signOut')}</Button>     // Cross-namespace
t('statusActiveWith', { serviceName })     // Interpolation

// Language stored in localStorage('igu_language'), dir/lang auto-flip on change
// Files: src/i18n/locales/{en,ar}/{namespace}.json
```

### Safe Data Fetching in useEffect (mandatory)

Without a ref guard, `useCallback`-dependent useEffects loop (see history.md — Phase 16 for the full explanation).

```typescript
import { useEffect, useRef, useCallback } from 'react';

function MyComponent() {
  const hasFetched = useRef(false);

  // Define useCallback BEFORE useEffect (temporal dead zone)
  const fetchData = useCallback(async () => { /* ... */ }, [deps]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchData();
  }, [fetchData]);
}
```

### Supabase mutations — always destructure `{ error }`

`supabase.from().update() / .insert() / .delete()` return `{ data, error }`. Awaiting without checking silently swallows RLS failures (HTTP 200, no rows affected, no exception).

```typescript
const { error } = await supabase.from('x').update(...).eq('id', id);
if (error) throw error;
```

### `.maybeSingle()` vs `.single()`

Use `.maybeSingle()` for optional rows (presets, config, optional joins). `.single()` throws on 0 rows (PostgREST 406). Only use `.single()` after `INSERT...RETURNING` or querying by a known-present PK.

### Never use nested PostgREST FK joins on `client_programs` or `profiles`

`client_programs` → `programs` and `subscriptions` → `profiles` (view) FK joins are unreliable (silent fail / wrong counts). Always use separate direct queries.

`profiles` is a **view**. FK `subscriptions_user_id_fkey` points at `profiles_legacy`, not the view. So `profiles!subscriptions_user_id_fkey(...)` fails. Pattern:
```typescript
const { data: subs } = await supabase.from('subscriptions').select('id, user_id');
for (const sub of subs) {
  const { data: profile } = await supabase.from('profiles')
    .select('email, first_name').eq('id', sub.user_id).maybeSingle();
}
```

### Parallelize RPC loops with `Promise.all`

Sequential `for` loops of RPC calls create N round-trips. Always `Promise.all` independent calls.

### ClickableCard for navigation/action cards

Never write `<Card onClick={...}>`. Use `<ClickableCard>` from `@/components/ui/clickable-card` with required `ariaLabel`. Has `role="button"`, `tabIndex={0}`, Enter/Space handler, `focus-visible:ring-2`.

### Mobile branching — `useIsMobile()`

When building modals, pickers, drawers: branch on `useIsMobile()`. Mobile gets vaul `Drawer` (bottom sheet, `max-h-92vh`, flex-column scroll, safe-area padding, `h-10 text-base` inputs). Desktop stays on Dialog/Popover.

Planning Board specifically: `MobileDayDetail.tsx` uses Drawer, `MuscleSlotCard.tsx` desktop still uses Popover.

---

## Development Workflow

```bash
npm run dev          # Start dev server (port 8080)
npm run build        # Production build
npm run lint         # ESLint
npm test             # Tests
npx tsc --noEmit     # Type check

supabase db pull     # Pull remote schema to local migrations
supabase db push     # Push migrations to remote
supabase functions serve           # Local edge function dev
supabase functions deploy <name>   # Deploy single
supabase functions deploy          # Deploy all

git add -A && git commit -m "…" && git push  # Vercel auto-deploys on main
```

---

## Important Files to Read First

1. `src/auth/roles.ts` — role and permission system
2. `src/lib/routeConfig.ts` — all routes and config
3. `src/App.tsx` — route definitions and guards
4. `src/auth/onboarding.ts` — client onboarding flow
5. `supabase/migrations/` — database schema (newest first)
6. `docs/history.md` — phase-by-phase history and fix writeups

---

## Critical Warnings & Gotchas

### Branding: always "IGU", never "Dr Iron"
Platform name is IGU (The Intensive Gainz Unit). Live site `theigu.com`. Emails, UI, navbar, meta tags — all IGU.

### Coach data lives in TWO tables — keep in sync
- `coaches` — canonical base table (has `status`, `first_name`, etc.)
- `coaches_public` — separate base table (NOT a view)
- `coaches_full` — view joining `coaches_public` + `coaches_private`; most admin UI reads from it

**If you update `coaches.status`, update `coaches_public.status` too.** Otherwise `coaches_full` returns the wrong status and filters hide the coach.

### `coaches_public` is also a VIEW (confusingly) in some auto-populated contexts
Actually a base table — but there's historical confusion because at one point `coaches_public` auto-populated from `coaches` via a view. Today: both base tables, both need manual sync.

### `profiles` is a VIEW
Joins `profiles_public` + `profiles_private`. Cannot use PostgREST FK joins — FK `subscriptions_user_id_fkey` references `profiles_legacy`, not the view. Always use separate direct queries.

### Column and enum names that have tripped past fixes
- `coaches` has `first_name`, `last_name`, `nickname` — NO `name` column
- `services` has `price_kwd` — NO `price` column
- `account_status` enum: pending, active, suspended, approved, needs_medical_review, pending_payment, cancelled, expired, pending_coach_approval, inactive — **no `'new'`**
- `app_role` enum: member, coach, admin, dietitian — **no `'client'`** (client = `'member'`)
- `form_submissions` does NOT have `red_flags_count`, `service_id`, `notes_summary` — those live on `form_submissions_safe`

### Two exercise tables
- `exercises` — legacy, mostly empty
- `exercise_library` — 107 seeded, used by workout builder's picker
- `WorkoutLibraryManager` (admin) queries BOTH

### Sentry cannot be lazy-loaded
`@sentry/react` crashes with `Cannot assign to property '10.37.0' of [object Module]` when dynamically imported (frozen ESM module namespace, Sentry's version registration mutates it). Must stay static in `main.tsx`. Also NOT in `manualChunks`.

### Auth session persistence
Supabase `getSession()` can hang on page refresh due to a circular deadlock in GoTrueClient (see `docs/history.md`). Mitigated by:
- Navigator lock bypass + `initializePromise` timeout + `setSession()` recovery in `client.ts`
- Cache-first role checks (`useRoleCache.ts`)
- **Any new auth guard calling `getSession()` MUST have a safety timeout** (see `AuthGuard.tsx` — 8s pattern)
- `RoleProtectedRoute` uses raw `fetch()` to bypass the Supabase client entirely for role checks

### OnboardingGuard — dashboard paths pass through
Clients with incomplete onboarding can visit `/dashboard`, `/client`, `/client/dashboard` — `ClientDashboardLayout` shows limited UI (registration alert, medical review, coach approval, payment status). Non-dashboard client routes redirect to `/dashboard`.

### Post-action navigation + OnboardingGuard race
After a server-side status change (e.g., payment verification), pass `{ state: { paymentVerified: true } }` via `navigate()` so OnboardingGuard doesn't bounce the user based on stale `profiles_public.status`. Only bypass the specific stale status, not all statuses. See `PaymentReturn.tsx`.

### Edge functions
- Always handle OPTIONS preflight **before** `req.json()` — OPTIONS has no body, `JSON.parse("")` throws and kills CORS response
- Resend emails must use `@mail.theigu.com` sender (only verified subdomain). Use `EMAIL_FROM_IGU`, never "Dr Iron"
- Use `--` not `—` in email copy
- Use shared email system: `supabase/functions/_shared/{emailTemplate,emailComponents,sendEmail,config}.ts`. `showUnsubscribe: true` only on marketing/drip emails
- Edge functions calling other edge functions: callee needs `--no-verify-jwt`
- Gateway rejects ES256 JWTs on some functions — deploy with `--no-verify-jwt` when function has internal auth checks (see JWT table below)

### Team-based RLS requires dedicated policies
Existing coach RLS only checks `subscriptions.coach_id` and `is_primary_coach_for_user()`. Team queries (`WHERE team_id = X`) need separate policies on both `subscriptions` and `profiles_public`. See migrations `20260212170000` and `20260212180000`.

### Planning Board state model
`MusclePlanState.weeks: WeekData[]` with `currentWeekIndex`. Each `WeekData` has its own `slots[]`. Use `getCurrentSlots(state)` (exported from `useMuscleBuilderState`). All reducer slot actions scoped to current week via `withUpdatedCurrentWeek()`. `slot_config` JSONB writes `{ weeks, globalClientInputs, globalPrescriptionColumns }` — backward compat reads old `{ slots }` and bare array. Conversion offsets dayIndex per week (W1=1-7, W2=8-14).

### Mobile bottom nav — role-specific global docks
`src/App.tsx` renders three global nav components that self-gate by `location.pathname`:
- **Client dock** (`ClientMobileNavGlobal`): `/dashboard`, `/client`, `/nutrition`, `/nutrition-client`, `/nutrition-team`, `/sessions`, `/workout-library`, `/educational-videos`, `/account`, `/billing`, `/payment-status`, `/payment-return`. Auto-hides on `/client/workout/session/*` (distraction-free logging).
- **Coach dock** (`CoachMobileNavGlobal`): `/coach`, `/coach-client-nutrition`, `/client-submission`.
- **Admin dock** (`AdminMobileNavGlobal`): `/admin/*`, `/testimonials-management`.

**Rules when adding a new authenticated route:**
1. Add its path prefix to the matching role's list (or mark intentionally nav-less, e.g. onboarding).
2. If the route is role-specific, gate it with `RoleProtectedRoute` — don't rely on the prefix list for security. `/coach-client-nutrition` is coach-only because both coaches and admins can reach it from client directories; the dock would otherwise pick the wrong nav.
3. A route reachable from multiple roles (e.g. `/client-submission/:userId`, opened from both coach and admin client directories) maps to ONE dock — pick the primary consumer.

### Mobile layout pb-24 rule
Bottom nav is `h-16` — **all layout content areas must use `pb-24 md:pb-8`** to prevent content hiding behind it. Applies to `ClientDashboardLayout`, `CoachDashboardLayout`, `AdminDashboardLayout`, `AdminPageLayout`, and any standalone page that bypasses those layouts (e.g. `AccountManagement`, `TestimonialsManagement`, `ClientSubmission`, `CoachClientNutrition`, `AccessDebug`). Pages that already use `py-24` (96px ≥ 64px dock) are fine.

### Button touch targets
`button.tsx` uses `min-h-[44px] md:min-h-0` on `default`, `sm`, `icon` sizes (Apple HIG 44px). All buttons have `active:scale-[0.98] touch-manipulation`.

### Display DB enums with a label map, not `.replace()`
JS `.replace()` only replaces the first occurrence. `one_to_one.replace('_', ' ')` → `"one to_one"`. Use an explicit `Record<string, string>` label map.

### Empty state messages — handle empty search
```tsx
// BAD: shows "No exercises found matching """
<p>No exercises found matching "{searchTerm}"</p>
// GOOD:
<p>{searchTerm ? `No exercises found matching "${searchTerm}"` : 'No exercises found'}</p>
```

### All public-facing pages must be wrapped in `<PublicLayout>` in App.tsx
Provides the "IGU" navbar and footer. Never render a public page without PublicLayout, and never add `<Navigation />` or `<Footer />` inside a page that's already wrapped (causes duplicates).

### macOS quarantine can freeze git
Downloaded/cloned repos on Desktop accumulate `com.apple.provenance` extended attributes. Gatekeeper/XProtect makes git operations hang (stats every file, security check per stat). **Fix:** `xattr -cr .` in project root, or move project off Desktop (e.g. `~/Projects/`).

---

## Edge Function Deployment / JWT Reference

Deploy without JWT: `supabase functions deploy <name> --no-verify-jwt`

| Function | JWT | Reason |
|----------|-----|--------|
| `create-coach-account` | No | Admin approval flow |
| `send-coach-invitation` | No | Called by other edge functions |
| `send-coach-application-emails` | No | Anonymous users |
| `tap-webhook` | No | Payment provider |
| `create-tap-payment` / `verify-payment` | No | Gateway rejects ES256 JWTs; internal auth checks |
| `submit-onboarding` | No | Gateway rejects ES256 JWTs; internal auth checks |
| `create-manual-client` | No | Internal admin role verification |
| `send-signup-confirmation` | No | Called from frontend + other edge functions |
| `cancel-subscription` | No | Internal admin/self verification |
| `send-waitlist-confirmation` | No | Anonymous |
| `send-waitlist-invites` | No | Internal admin auth check |
| All 10 `process-*` / `send-admin-daily-summary` / `send-weekly-coach-digest` | No | Vercel Cron with service role key |

---

## Scheduled Automation (Vercel Cron)

**Architecture:** Vercel Cron → `GET /api/cron?fn=<name>` (serverless function) → validates `CRON_SECRET` → `POST` to Supabase edge function (Bearer service role key) → edge function queries DB, sends emails via Resend, logs to `email_notifications` for dedup.

Dispatcher: `/api/cron.ts` (single function handling all 10 jobs, allowlists function names).

| Schedule (UTC) | Frequency | Edge Function | Purpose |
|----------------|-----------|---------------|---------|
| 6:00 AM | Daily | `send-admin-daily-summary` | Platform health snapshot |
| 7:00 AM | Mon | `send-weekly-coach-digest` | Per-coach client summary |
| 8:00 AM | Daily | `process-renewal-reminders` | 3-day advance billing notice (monthly dedup) |
| 8:30 AM | Daily | `process-coach-inactivity-monitor` | Alert if coach inactive 7+ days (weekly dedup) |
| 9:00 AM | Mon | `process-testimonial-requests` | After 4+ weeks active (lifetime dedup) |
| 9:00 AM | Mon | `process-referral-reminders` | After 2+ weeks active (lifetime dedup) |
| 9:30 AM | Daily | `process-payment-failure-drip` | Day 1/2/5/9 drip |
| 10:00 AM | Daily | `process-abandoned-onboarding` | Day 1/3/7 drip |
| 10:30 AM | Daily | `process-inactive-client-alerts` | Coach alert when client inactive 5+ days |
| 11:00 AM | Daily | `process-lead-nurture` | Day 1/3/7 for newsletter leads |

**Dedup:** All functions check `email_notifications` before sending. Each uses a `notification_type` string (e.g., `abandoned_onboarding_day1`).

**Testing:**
```bash
curl "https://theigu.com/api/cron?fn=send-admin-daily-summary" \
  -H "Authorization: Bearer $CRON_SECRET"

# Or directly:
curl -X POST https://ghotrbotrywonaejlppg.supabase.co/functions/v1/<name> \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

---

## Code Style

1. TypeScript strict, `error: unknown` not `any`
2. Functional components + hooks
3. Tailwind + `cn()` for conditional classes
4. `@/` alias for `src/`
5. Try-catch + structured logging (`captureException`)
6. React Hook Form + Zod for forms
7. React Query for server state

---

## Security Considerations

1. **PHI:** Medical data encrypted at rest, restricted RLS
2. **PII:** Email, phone, DOB in separate `profiles_private` table
3. **Payments:** Webhook signature verification required
4. **Auth:** Supabase + RLS; never ship service role key to frontend
5. **Secrets:** Never in frontend code; use Supabase Vault/secrets

---

## Getting Help

- Supabase: https://supabase.com/docs
- shadcn/ui: https://ui.shadcn.com
- Tap Payments: https://developers.tap.company
- React Router: https://reactrouter.com

When reporting issues: specify role (admin/coach/client), include file paths, note PHI/PII involvement, note frontend vs edge function.

---

## Related Docs

- `docs/history.md` — phase-by-phase narratives and fix writeups
- `docs/IGU_Discovery_Report.md` — platform audit
- `docs/Dashboard_UX_Plan.md` — dashboard UX specs
- `docs/LAUNCH_CHECKLIST.md` — pre-launch tasks
- `docs/WORKOUT_BUILDER_SPEC.md` — workout builder system specification
