# IGU pre-launch deep-dive review — findings & handover

**Last updated:** 2026-05-23
**Launch target:** 2026-07-12 (Sun) 09:00 Kuwait. Public signup opens 2026-07-14. Launch date may slip — Hasan prefers complete structural fixes over deadline-driven workarounds.

This document tracks the 10-block pre-launch audit (per `docs/pre-launch-review.md` or the original prompt set). Append findings here; bring any new P0 back to triage before fix.

---

## Status at a glance

| #  | Block                       | Audit status      | Fixes shipped to prod                 |
|----|-----------------------------|-------------------|---------------------------------------|
| 1  | Billing & payments          | ✅ Complete       | ✅ Shipped (commit d9b2836 + edge fns + migrations) |
| 2  | Onboarding & medical review | ✅ Complete       | ✅ Shipped (commit d9b2836 + edge fns + migrations) |
| 3  | Auth flow                   | ⏳ Not started    | —                                     |
| 4  | Admin tooling               | ⏳ Not started    | —                                     |
| 5  | Messaging                   | ⏳ Not started    | —                                     |
| 6  | Sessions / PT bookings      | ⏳ Not started    | —                                     |
| 7  | Teams feature               | ⏳ Not started    | —                                     |
| 8  | Coach experience            | ✅ Complete       | 🟡 All Block 8 P0/P1 IN-REPO (original + 2026-05-22 new findings + 2026-05-23 second-pass fixes). Awaiting one `db push` + `functions deploy` + commit. P2s deferred. |
| 9  | Testimonials                | ⏳ Not started    | —                                     |
| 10 | Public marketing site       | ⏳ Not started    | —                                     |

**What "shipped" means here:** edge functions deployed via `supabase functions deploy`, FE committed to main triggering Vercel auto-deploy, migrations applied to prod via `mcp__supabase__apply_migration` and verified live.

---

## What's live in prod from blocks 1-10

Edge functions (deployed direct to prod 2026-05-20):
- `reactivate-subscription` v7 — added JWT verification + admin-or-self gate + payment_exempt re-check + 30s dedupe
- `tap-webhook` v9 — silent-mutation cluster fixed (every mutation destructures `{ error }` and throws; critical `user_roles.delete` on refund now caught)
- `verify-payment` v11 — confirmation email path hardened to `.maybeSingle()`, all mutations error-checked
- `cancel-subscription` v10 — all mutations error-checked
- `process-payment-failure-drip` v8 — banned nested FK join removed, N+1 batched via `Map`
- `submit-onboarding` v17 — `medical_reviews` INSERT added, validation reordered before destructive `user_roles.delete`, PAR-Q strip enforced
- `approve-medical-review` DELETED (orphan code with P0 enum bug)

FE shipped via commit `d9b2836` on `main` (Vercel auto-deployed):
- `BillingPayment.tsx` — `.single()` → `.maybeSingle()`, nested FK joins split, hasFetched guards
- `PaymentStatusDashboard.tsx` — same
- `PaymentHistoryCard.tsx` — hasFetched guard
- `OnboardingForm.tsx` — auth-timeout pattern, nested join split, `.maybeSingle()`, hasFetched, deleteDraft error-throw, PAR-Q strip from drafts
- `onboarding/Payment.tsx` — discount UX fixed (response shape mismatch was breaking promo codes), hasFetched, nested join split
- `onboarding/MedicalReview.tsx` — auth-timeout on poll-tick
- `onboarding/AwaitingApproval.tsx` — auth-timeout on poll-tick
- `admin/MedicalReviewsPanel.tsx` — N+1 batched, rejection branch writes `cancelled` (correct enum) + cancels subscription

Migrations applied to prod 2026-05-20:
- `20260520113249_team_subscription_payments_rls.sql` — recorded as `20260521152210` (apply_migration assigns its own timestamp)
- `20260520125655_strip_parq_from_drafts.sql` — recorded as `20260521192740`. Pre-cleanup: 2 rows with plaintext PAR-Q in `onboarding_drafts.form_data`. Post-cleanup: 0.

Migrations IN-REPO awaiting `supabase db push` (2026-05-22):
- `20260522120000_block_8_coach_safe_rpcs_and_atomic_assignment.sql` — 4 SECURITY DEFINER RPCs + `coach_teams_read_active` policy hardening. See Block 8 section for full breakdown.

Edge functions IN-REPO awaiting `supabase functions deploy` (2026-05-22):
- `submit-onboarding` — coach assignment + subscription INSERT now atomic via `assign_coach_atomic` RPC.

FE changes IN-REPO awaiting commit + push (2026-05-22 → 2026-05-23):
- 5 client-facing components swapped off `coaches_client_safe` view (CoachPreferenceSection, ChooseTeamPrompt, ChangeTeamDialog, WelcomeModal, PlanBillingCard).
- 3 new-finding P0 fixes (2026-05-22): MeetOurTeam.tsx (ClickableCard), CoachContentAssignments.tsx (rows-affected check), create-manual-client/index.ts (`.maybeSingle()` → `.limit(1)`).
- 2026-05-23 second-pass fixes from auditing the same 12 surfaces a second time:
  - `MeetOurTeam.tsx:117` AvatarImage now `loading="lazy"` — public 30+-avatar grid no longer eagerly fetches every face on initial paint.
  - `create-coach-account/index.ts:114` existing-roles fetch now destructures `{ error }` and throws (was silently swallowing RLS denial).
  - `create-manual-client/index.ts:192–306` — all 5 silent `console.error`-and-continue mutations (profiles_public / profiles_private / profiles_legacy / check_existing_sub / update_status) now throw on error. Fully closes B8-N6. Subscription is no longer created on top of partially-written profile state.
  - `CoachDashboardOverview.tsx:92–161` — two N+1 patterns batched. `profiles_public` per-subscription loop → single `.in("id", clientUserIds)` query. Weight-log per-phase loop (was up to 2 queries per phase) → single `.in("phase_id", phaseIds)` query, with `checkInsDue` / `checkInsDueToday` / `inactiveFor14Days` all derived from the same in-memory map. Semantics preserved. 

---

## Block 1 — Billing & payments findings

**Audit completed 2026-05-19.**

### P0 — shipped
- **P0-1.** `reactivate-subscription` had NO JWT verification. Any authenticated user could pass another user's `userId` and initiate a TAP charge in their name. Fixed: auth block + admin/self gate + payment_exempt re-check + 30s dedupe.
- **P0-2.** `reactivate-subscription` used banned nested PostgREST FK join `profiles!inner(...)`. Fixed: split into 3 separate queries (subscriptions / services / profiles_public + profiles_private).
- **P0-3.** `apply-discount-code` response shape didn't match what `onboarding/Payment.tsx` expected — every promo code on the onboarding flow always rendered "Invalid discount code". Fixed: FE now reads `data.valid` + `data.discount.percent_off || data.discount.amount_off_kwd`.

### P1 — shipped
- **P1-1, P1-2, P1-3.** Silent-mutation cluster across `tap-webhook` / `cancel-subscription` / `verify-payment`. The `user_roles.delete` on refund was the most critical — would have left refunded users with paid access. Fixed: every mutation now destructures `{ error }` and throws.
- **P1-4.** `BillingPayment.tsx` `.single()` on profile reads + nested FK join on subscriptions. Fixed.
- **P1-5.** `PaymentStatusDashboard.tsx` — same pattern. Fixed.
- **P1-6.** `PaymentStatusDashboard.tsx` and `PaymentHistoryCard.tsx` useEffects missing hasFetched ref guard. Fixed.
- **P1-7.** `onboarding/Payment.tsx` `.single()` on profiles_public + nested `services(*)` join + no hasFetched + no auth timeout. Fixed.
- **P1-8.** `verify-payment` confirmation email path used `.single()` on optional profile read. Fixed to `.maybeSingle()`.
- **P1-9.** `process-payment-failure-drip` nested FK join on subscriptions. Fixed by splitting + batched `.in('id', ...)` services lookup.
- **P1-10.** `team_coach` had no SELECT access to `subscription_payments`. Fixed via new RLS policy (migration `20260520113249_team_subscription_payments_rls.sql`, recorded as `20260521152210`).

### P1-11 — open product decision
- Should `dietitian` have SELECT access to `subscription_payments`? Mirror policy if yes.

### P2 — deferred (cleanup; non-blocking)
- Explicit INSERT policy on `subscriptions` (currently relies on `FOR ALL` policy's USING-as-WITH-CHECK implicit behavior; fragile).
- Two overlapping coach-SELECT policies on `subscriptions` (`tpl3_coach_select_assigned` + `"Coaches can view their assigned or pending clients' subscriptions"`). Consolidate.
- No `invoices` or `refunds` tables. If Kuwait tax obligations require invoice PDFs, build them.
- `send-payment-failed-email` uses `EMAIL_FROM_COACHING`; should be `EMAIL_FROM_BILLING` for semantic correctness.
- KWD math uses native float multiplication in `create-tap-payment` and `PaymentStatusDashboard`. Tolerated by webhook's 0.001 KWD epsilon, but fils-rounding helper would be cleaner.
- `PaymentReturn` accepts any `tap_id` / `charge_id` from URL — mitigated by `verify-payment` looking up the caller's own sub regardless, but worth a chargeId-ownership check.

---

## Block 2 — Onboarding & medical review findings

**Audit completed 2026-05-19.**

### P0 — shipped
- **P0-1.** Medical-review flow non-functional end-to-end. `submit-onboarding` flagged `profiles_public.status='needs_medical_review'` but NEVER inserted into `medical_reviews`. `MedicalReviewsPanel` queried that empty table → admin saw zero flagged clients forever. `MedicalReviewsPanel` rejection branch also didn't update `profiles_public` or cancel the subscription. Fixed: `submit-onboarding` upserts `medical_reviews` row; `MedicalReviewsPanel.handleAction` rejected-branch now writes `cancelled` + deletes pending sub.
- **P0-2.** Orphan `approve-medical-review` edge fn wrote `status: 'rejected'` to `profiles_public` — but `'rejected'` is NOT in the `account_status` enum and the mutation didn't destructure `{ error }`. Function had zero callers in `src/`. Fixed: directory deleted.

### P1 — shipped
- **P1-1.** `OnboardingForm.tsx:178-180` — `supabase.auth.getUser()` with no 8s safety timeout. Fixed: `Promise.race` + retry + `setFatalError`.
- **P1-2.** Banned nested FK join on subscriptions in `OnboardingForm.tsx:207-211`. Fixed: split.
- **P1-3.** `.single()` on `profiles_public` + `profiles_private` in `OnboardingForm.tsx:241-244`. Fixed: `.maybeSingle()`.
- **P1-4.** Two mount-only useEffects in `OnboardingForm.tsx` missing hasFetched ref guard. Fixed with both `hasInitialized` and `hasLoadedDraft` (the latter waits for userId before arming).
- **P1-5.** `deleteDraft` no error destructure. Fixed.
- **P1-6.** `MedicalReview.tsx:40` and `AwaitingApproval.tsx:59` — `auth.getUser()` no timeout on poll-tick. Fixed.
- **P1-7.** PAR-Q answers stored in `onboarding_drafts.form_data` as plaintext JSONB (PHI). Fixed: PAR-Q stripped from draft save + skipped on draft restore + cleanup migration applied.
- **P1-8.** `submit-onboarding` validation ran AFTER 4 DB reads + a destructive `user_roles.delete`. Malformed payloads burned 5 round-trips and wiped role grants before being rejected. Fixed: validation now runs after auth + rate-limit, before any DB queries.

### Open / deferred
- No client-facing rejection email when admin rejects medical review. Client only learns via dashboard. Acceptable for soft launch; write `send-medical-review-rejection-email` before scale.
- `onboarding_drafts.form_data` cleanup migration deleted PAR-Q from existing rows (2 rows scrubbed). Future rows won't have PAR-Q at all (FE filtering). Documented in `MEMORY.md`.

---

## Block 8 — Coach experience (✅ Audit complete)

**Audit completed 2026-05-20 (assignment / team plan) + 2026-05-22 (12 previously unaudited surfaces).** All fixes for original P0/P1 IN-REPO awaiting `supabase db push` + `functions deploy` + git commit. 3 new-finding P0s also IN-REPO. New-finding P1s logged below for the next chat.

### Original P0/P1 — IN-REPO (2026-05-22), NOT yet on prod

**Migration:** `supabase/migrations/20260522120000_block_8_coach_safe_rpcs_and_atomic_assignment.sql`

Adds 4 SECURITY DEFINER RPCs + tightens one RLS policy:

- `list_active_coaches_for_service(p_service_id)` — used by CoachPreferenceSection. Returns active coaches with available capacity (max_clients - current_count > 0) plus the coaches_client_safe column subset. Authenticated.
- `list_active_teams_for_client()` — used by ChooseTeamPrompt + ChangeTeamDialog. Returns active teams + head-coach name (read from coaches_public via SECURITY DEFINER, bypassing the RLS-broken view) + pending+active member count. Authenticated.
- `get_coaches_for_subscription_addons(p_subscription_id)` — used by PlanBillingCard. Returns staff first/last name for active addons on caller-owned subscription. Authenticated.
- `coach_assignment_would_block(p_coach_user_id, p_service_id)` — Block 8 P1-7 helper. Pre-computes the no-dietitian IGU profit and returns true if the candidate would result in `calculate_subscription_payout` returning blocked=true. service_role only.
- `assign_coach_atomic(...)` — Block 8 P0-2. Locks `coach_service_limits` rows FOR UPDATE during candidate scoring and INSERTs the subscription in the same transaction. Handles team plans (P1-3, P1-4), 1:1 preference with capacity recheck + tier guardrail (P1-7), 1:1 auto-assign with focus_areas scoring + round-robin (replaces the N+1 P1-2 + banned FK join P1-1), and bumps `last_assigned_at` (P1-6). service_role only.
- `coach_teams_read_active` policy rewritten with `TO authenticated` (P1-5).

**FE swaps — 5 callsites (closes P0-1):**

- `src/components/onboarding/CoachPreferenceSection.tsx` — `.from('coaches_client_safe')` → `.rpc('list_active_coaches_for_service')`. Removed per-coach N+1 subscription count loop (server-side now).
- `src/components/client/ChooseTeamPrompt.tsx` — per-team coach + count loop → `.rpc('list_active_teams_for_client')`.
- `src/components/client/ChangeTeamDialog.tsx` — same swap.
- `src/components/client/WelcomeModal.tsx` — `.from('coaches_client_safe')` → `.rpc('get_coach_for_client', { p_coach_user_id })` (uses existing 20260517 RPC).
- `src/components/client/PlanBillingCard.tsx` — `.from('coaches_client_safe').in('user_id', staffIds)` → `.rpc('get_coaches_for_subscription_addons', { p_subscription_id })`.

**Edge function refactor — `supabase/functions/submit-onboarding/index.ts`:**

Coach assignment + subscription INSERT now a single `supabaseServiceRole.rpc('assign_coach_atomic', ...)` call. Replaces ~250 lines of read-then-write logic that had the TOCTOU race + N+1 + nested FK join + admin-pollution fallback. `calculateFocusAreasMatchScore` + `CoachCandidate` interface deleted (moved into RPC).

**Type-check:** `npx tsc --noEmit` passes clean across `tsconfig.app.json` + `tsconfig.node.json` (TS 5.8.3).

**Deploy steps for Hasan to run in Claude Code:**

```bash
cd ~/Projects/intensive-gainz-unit-main

# 1. Apply migration (db push for predictable version recording -- apply_migration
#    re-timestamps to apply-time, see memory/feedback_supabase_apply_migration_timestamps.md)
supabase db push

# 2. Deploy refactored edge functions (submit-onboarding + 2026-05-23 fixes)
supabase functions deploy submit-onboarding
supabase functions deploy create-coach-account
supabase functions deploy create-manual-client

# 3. Commit + push FE (Vercel auto-deploys)
git add -A
git commit -m "Block 8: ship coach-experience P0/P1 -- atomic assignment RPC + 5 coaches_client_safe callsites + new-finding P0s (incl. 2026-05-23 lazy-avatar, error-throws, N+1 batching)"
git push
```

**Verification after deploy:**

1. Sign in as a test client. Confirm coach names render in WelcomeModal + PlanBillingCard (not blank).
2. Walk a fresh signup through `/onboarding` 1:1 path — confirm coach picker populates, capacity numbers match.
3. After a signup, run drift query from CLAUDE.md to confirm `last_assigned_at` updated.
4. Manual race test: open two browser tabs, submit two 1:1 signups simultaneously against a coach with capacity=1. Confirm only one wins (the other gets `needs_coach_assignment=true`).

---

### Block 8 NEW FINDINGS — 2026-05-22 audit of previously-unaudited surfaces (+ 2026-05-23 second pass)

Files audited this chat: `create-coach-account`, `coach-invite-client`, `create-manual-client`, `components/CoachManagement.tsx` (note: in `components/` not `pages/admin/`), `pages/CoachSignup.tsx`, `pages/MeetOurTeam.tsx`, `pages/coach/CoachDashboard.tsx`, `pages/coach/PendingClientsPage.tsx`, `pages/coach/DietitianMyClientsPage.tsx`, `pages/coach/CoachContentAssignments.tsx`, `pages/coach/StudioPreview.tsx`, and the `assign_program_to_client` RPC body.

#### NEW-FINDING P0 — shipped to repo (NOT yet on prod)

- **B8-N1.** `src/pages/MeetOurTeam.tsx:105` used `<Card onClick>` instead of `<ClickableCard>`. Accessibility miss on the primary public CTA. **Fixed in-repo** — replaced with `<ClickableCard ariaLabel=...>`.
- **B8-N2.** `src/pages/coach/CoachContentAssignments.tsx:70-77` `handleDelete` did `.delete()` without rows-affected check — RLS silent-deny would leave the row in DB but disappear from local state. Same pattern as PR #117 completeWorkout fix. **Fixed in-repo** — added `.select('id')` + zero-rows toast.
- **B8-N3.** `supabase/functions/create-manual-client/index.ts:259-265` used `.maybeSingle()` on a query that could legitimately return 2 rows (legacy duplicate active subs), 406-ing and breaking idempotency. **Fixed in-repo** — switched to `.limit(1)` + array indexing.

#### NEW-FINDING P1 — open, LOG ONLY (queue for next chat)

- **B8-N4.** `supabase/functions/create-coach-account/index.ts:104` uses `auth.admin.listUsers()` to look up existence by email. Paginates entire auth table (50/page); scales linearly with user count. `create-manual-client` already avoids this pattern. Replace with a `profiles_private`/`coaches_private` email lookup + `generateLink` fallback.
- **B8-N5.** `supabase/functions/coach-invite-client/index.ts:82-85` reads `coaches_public.{coach_level, max_onetoone_clients, max_team_clients}` — `max_*` columns are deprecated Pattern-B (drop in Phase 3 of coach refactor per CLAUDE.md). Read max_* from `coaches` table instead.
- **B8-N6.** ✅ **FIXED 2026-05-23.** `supabase/functions/create-manual-client/index.ts` — all 5 silent `console.error`-and-continue paths (profiles_public, profiles_private, profiles_legacy, check_existing_sub, update_status) now destructure `{ error }`, log the real message, and throw. Function fails closed on any partial write.
- **B8-N7.** `supabase/functions/create-manual-client/index.ts:179-194 → :291-294` writes `profiles_public.status='pending'` then immediately updates to `'active'`. Intermediate state is observable to concurrent readers. Combine into one upsert with `status='active'`.
- **B8-N8.** `supabase/functions/create-manual-client/index.ts:239` reads `coaches_public.status` — deprecated Pattern-B column. Read from `coaches.status` instead.
- **B8-N9.** `src/components/CoachManagement.tsx:127` `fetchCoaches` SELECT is missing `nickname, instagram_url, tiktok_url, snapchat_url, youtube_url` — but `handleEdit:304-319` reads them, silently blanking the form on edit.
- **B8-N10.** `src/components/CoachManagement.tsx:377-389` `viewCoachClients` uses banned nested FK join `subscriptions.select('...services(name)')` (CLAUDE.md rule 1). Split into 2 queries.
- **B8-N11.** `src/pages/coach/DietitianMyClientsPage.tsx:118-121` same banned nested FK join `subscriptions.select('...services!inner(name, type)')`. Silently wrong counts.
- **B8-N12.** `src/components/CoachManagement.tsx:398-403` reads `form_submissions` by `user_id` and maps without `.order('created_at', { ascending: false })` — picks arbitrary row when a client has resubmitted.
- **B8-N13.** `src/components/CoachManagement.tsx:434-435` `handleCancelClient` uses `window.confirm` on a destructive action. AlertDialog pattern is used elsewhere in the same file (handleDelete). Inconsistent + bad mobile UX.
- **B8-N14.** `src/pages/CoachSignup.tsx:93` calls `supabase.auth.getSession()` with NO 8s safety timeout. CLAUDE.md rule 4: "Any new auth guard calling `getSession()` MUST have a safety timeout." Wrap in `withTimeout`.
- **B8-N15.** `src/pages/CoachSignup.tsx:54-58` reads `coaches.*` — fragile across Phase-3 column drops. Select only `status`.

#### NEW-FINDING P0/P1 from 2026-05-23 second pass

- **B8-N19.** ✅ **FIXED 2026-05-23.** `src/pages/MeetOurTeam.tsx:117` — public 30+-avatar grid was eagerly fetching every photo on first paint. AvatarImage now `loading="lazy"`. Cuts initial-paint network for the highest-traffic public page once launch unblocks the route.
- **B8-N20.** ✅ **FIXED 2026-05-23.** `supabase/functions/create-coach-account/index.ts:114` — existing-roles fetch was missing `{ error }` destructure. An RLS denial here would silently treat the user as `hasAdminRole=false` and stomp role grants below. Now destructures + throws.
- **B8-N21.** ✅ **FIXED 2026-05-23.** `src/components/coach/CoachDashboardOverview.tsx` — two compounding N+1 patterns. (a) `profiles_public` was fetched per-subscription inside `Promise.all(map)` → batched into a single `.in("id", clientUserIds)` query with a Map lookup. (b) `weight_logs` was queried per-phase, with up to TWO queries per phase across two separate loops (7-day + 14-day windows) → consolidated into ONE `.in("phase_id", phaseIds)` query, with `latestLogByPhase` Map driving all three counters in memory. Worst-case query count for an active coach went from `2N + 2M + small constant` (M = phases, N = clients) to `constant + 2`. Semantics preserved (verified the `=== 7` "due today" edge case against date-only `log_date` storage).

##### Block 8 false-positive cleared

The 2026-05-23 audit flagged `pb-24 md:pb-8` missing from `CoachDashboard.tsx` / `PendingClientsPage.tsx` / `DietitianMyClientsPage.tsx`. Confirmed false positive: `CoachDashboardLayout.tsx:219` already applies `p-4 md:p-6 pb-24 md:pb-8 safe-area-bottom` to the content slot that wraps these pages. `PendingClientsPage.tsx` is a centered full-screen spinner (no scrollable content). No fix required.

#### NEW-FINDING P1 — `assign_program_to_client` RPC (deserves dedicated attention)

- **B8-N16.** `assign_program_to_client` RPC + `AssignTeamProgramDialog.tsx:148-163` — team fan-out is N separate transactions via `Promise.allSettled`. Partial failures (RLS denial on member 5 of 10) leave team in mixed state. Worse, `current_program_template_id` (line 184) is updated regardless of partial success (gated only on `successCount > 0`), so the team points at a template only some members have. No partial-rollback. Recommended fix: wrap the fan-out in a SECURITY DEFINER RPC that does all-or-nothing via a single transaction.
- **B8-N17.** `assign_program_to_client` RPC `client_programs` INSERT (line 63-70 of migration `20260421130000`) has no idempotency. Re-running team fan-out after partial failure double-assigns the succeeded members. Add `ON CONFLICT (client_id, subscription_id, template_id, start_date) DO NOTHING` + return existing program_id.
- **B8-N18.** `assign_program_to_client` RPC reads `care_team_assignments` by `lifecycle_status IN ('active', 'scheduled_end')` (line 176-182), but `DietitianMyClientsPage.tsx:87` and `is_dietitian_for_client` helper gate on `status='active'`. Two different "active" columns for the same logical concept. Dietitian may not actually be able to read the rows the RPC injects.

#### NEW-FINDING P2 — cleanup

- `src/pages/coach/CoachDashboard.tsx:83-95` duplicates `withTimeout` inline. Replace with the helper from `src/lib/withTimeout.ts`.
- `src/pages/coach/PendingClientsPage.tsx` is a dead-code redirect stub (whole body navigates to `/dashboard`). Delete and replace with `<Navigate>` in App.tsx after a release with no inbound links.
- `src/components/CoachManagement.tsx:220` `useEffect(fetchCoaches, [fetchCoaches])` no hasFetched ref guard (works currently because deps are stable, fragile if toast identity ever changes).
- `src/pages/coach/StudioPreview.tsx` is clean (visual mock, no Supabase, deletable per its own header). Verify `/coach/studio-preview` is gated by `RoleProtectedRoute requiredRole="coach"` in App.tsx.

---

### Original-block P2 — deferred cleanup (carried over from 2026-05-20)

- `MedicalReview.tsx:29-31` says SLA "within 24 hours", `MedicalReviewsPanel.tsx:168` says "4 hours". Pick one.
- `coach_teams_read_active` filters on `is_active=true` — clients on a deactivated team lose visibility into their own team. No admin notification when a head coach deactivates a team with active members. One-time pre-launch check: `SELECT count(*) FROM subscriptions WHERE team_id IN (SELECT id FROM coach_teams WHERE is_active=false) AND status IN ('pending','active');`
- `coach_teams_coach_insert/update/delete` policies still missing `TO authenticated` (functionally safe via auth.uid() but should be explicit; not changed because it would conflict with the 20260219100000 disk-IO rewrite of these same policies).
- No automated handling for "coach goes inactive mid-cycle". `process-coach-inactivity-monitor` sends alerts but does NOT reassign clients.

---

## Blocks 3-7, 9-10 — NOT STARTED

Each is a self-contained block per the original review prompt set. Recommended next-target order:

3. **Auth flow** — touches every authenticated surface. Run before any further fixes that touch guards / role gates.
4. **Admin tooling** — verify role isolation (every admin page must Unauthorized for the other 5 roles).
5. **Messaging** — RLS surface area + realtime channel auth.
6. **Sessions / PT bookings** — double-booking prevention, timezone handling (Kuwait-primary), refund hook into billing.
7. **Teams feature** — highest RLS surface area. Block 1 + 8 already touched it; complete audit.
9. **Testimonials** — small surface, low risk.
10. **Public marketing site** — branding, Lighthouse, Arabic coverage, waitlist → signup cutover plan.

---

## Deferred technical debt

### Migration version-string drift (Block D6 — pure cleanup, NOT functional)

15 local migration files have version timestamps that don't match remote `supabase_migrations.schema_migrations` records. Detail in `memory/project_igu_education_arc_drift.md`. Net effect: `supabase migration list` shows PENDING for 15 already-applied files; future blind `supabase db push` would fail.

- 13 education-arc files (May 15-19) — schema and FE are live, only filenames differ from remote versions.
- 2 audit migrations (May 20) — applied 2026-05-20, recorded under `apply_migration`-assigned timestamps `20260521152210` and `20260521192740`.
- 1 file (`20260517104551_get_coach_for_client_rpc.sql`) has NO remote record at all — schema live, history untracked.
- 2 duplicate-version PAIRS (`20260516120000` ×2, `20260516160000` ×2).

Fix options (pick one in Block D6):
1. Rename 15 local files to match remote-recorded versions. Content unchanged. Includes 1→3 split for `content_links`.
2. `supabase migration repair --status applied <version>` for each mismatched version.
3. `supabase db pull` regenerates local from remote. Risky — wipes local-only files.

### Other tech debt

- 3 May-12 untracked files in `supabase/migrations/` (already applied on remote, artifacts of Desktop→Projects move). `db push` skips them but they pollute `git status`. Move to `_pending_migrations/` scratch dir.
- Triceps execution-cue bug in `20260512100932_execution_cue_refinements.sql` — Section 6 filters on `'elbow_extensors'` (zero rows) instead of `'triceps'`. Still live in prod. Needs separate fix block.
- `feat/content-links-fix` branch still exists locally. Safe to delete with `git branch -D feat/content-links-fix`.

---

## Open product decisions

- **Dietitian SELECT** on `subscription_payments` + `form_submissions` / PAR-Q? Block 1 P1-11 + Block 2 RLS gap.
- **Team-coach SELECT** on `form_submissions` (analogous to the `subscription_payments` fix already shipped)?
- **Client-facing rejection email** when admin rejects medical review. Today client only learns via dashboard.
- **Lead-coach tier guardrails** (Block 8 P1-7) — ✅ IMPLEMENTED 2026-05-22 in `assign_coach_atomic` via the `coach_assignment_would_block` helper. Pending prod deploy.

---

## How to continue in a new chat

1. Have the next chat read `CLAUDE.md` end-to-end.
2. Have it read `memory/MEMORY.md` and follow the relevant pointers — `project_igu_prelaunch_audit_2026_05.md` is the resume point.
3. This file (`docs/pre-launch-review-findings.md`) is the canonical findings log. Append to it; bring P0s back to triage.
4. The original 10-block prompt set is preserved (`docs/pre-launch-review.md` or in chat history). Paste one block per fresh Cowork chat to run a fresh audit.
5. **Most urgent open work** (in priority order):
   - **Run the Block 8 deploy.** All Block 8 P0/P1 fixes (original + 2026-05-22 + 2026-05-23) are in-repo. One `supabase db push` + `supabase functions deploy submit-onboarding create-coach-account create-manual-client` + one git commit lands everything. Re-read the verification checklist in the Block 8 section above.
   - **Address remaining Block 8 NEW-FINDING P1s** — B8-N4, B8-N5, B8-N7 through B8-N18 (B8-N6, B8-N19, B8-N20, B8-N21 ✅ closed 2026-05-23). The team-fan-out race (B8-N16/N17) is the biggest correctness risk left in this block.
   - **Block 3 (Auth flow)** is the recommended next fresh audit — touches every authenticated surface, run before any further fixes that touch guards / role gates.

---

## Workflow notes for the next chat

- Hasan operates via **copy-paste middleman** with Claude Code in his terminal. Write paste-ready blocks (no preamble) for him to paste in. Don't ask him to test or run things himself.
- He prefers **complete structural fixes** over "ship-now-monitor-later" workarounds. Launch may slip.
- The Supabase `mcp__supabase__apply_migration` tool assigns its own version timestamp (not the filename's). Use `supabase db push` for predictable versioning, `apply_migration` for surgical one-offs.
- `coaches_client_safe` view returns 0 rows to clients despite the name — always use `get_coach_for_client` RPC in client code.
- The `account_status` enum does NOT contain `'rejected'`. Medical-review rejections write `'cancelled'`.
- Edge function deploys are direct-to-prod (no Supabase branches set up). Each blocked-fix is "strictly better than current state" before deploying.
