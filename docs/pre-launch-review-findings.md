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
| 3  | Auth flow                   | ✅ Complete       | 🟡 2 P0s fixed in-repo 2026-05-23 (B3-N1 + B3-N2), tsc clean, awaiting commit. 8 P1 + 4 P2 still open. |
| 4  | Admin tooling               | ⏳ Not started    | —                                     |
| 5  | Messaging                   | ⏳ Not started    | —                                     |
| 6  | Sessions / PT bookings      | ⏳ Not started    | —                                     |
| 7  | Teams feature               | ⏳ Not started    | —                                     |
| 8  | Coach experience            | ✅ Complete       | ✅ Shipped 2026-05-23: edge functions deployed, FE pushed (commit 68584a2 on main), migration applied via MCP `apply_migration` after `db push` blocked on the 15-entry version-string drift. P2s deferred. **D6 drift cleanup closed 2026-05-23 — `db push` unblocked.** |
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

**Shipped to prod 2026-05-23 — Block 8 deploy:**

Edge functions deployed (`supabase functions deploy`):
- `submit-onboarding` — coach assignment + subscription INSERT now atomic via `assign_coach_atomic` RPC.
- `create-coach-account` — B8-N20 (existing-roles fetch destructure + throw).
- `create-manual-client` — B8-N6 fully closed (all 5 silent paths now throw).

FE committed + pushed (commit `68584a2` on main, Vercel auto-deployed):
- 5 client-facing components swapped off `coaches_client_safe` view (CoachPreferenceSection, ChooseTeamPrompt, ChangeTeamDialog, WelcomeModal, PlanBillingCard).
- 3 new-finding P0 fixes (2026-05-22): MeetOurTeam.tsx (ClickableCard), CoachContentAssignments.tsx (rows-affected check), create-manual-client/index.ts (`.maybeSingle()` → `.limit(1)`).
- 2026-05-23 second-pass fixes:
  - `MeetOurTeam.tsx:117` AvatarImage now `loading="lazy"` (B8-N19).
  - `create-coach-account/index.ts:114` existing-roles fetch destructures `{ error }` and throws (B8-N20).
  - `create-manual-client/index.ts:192–306` — all 5 silent paths now throw (B8-N6).
  - `CoachDashboardOverview.tsx:92–161` (B8-N21) — two N+1 patterns batched.

Migration applied 2026-05-23 via MCP `apply_migration` (NOT db push -- see incident below):
- `20260522120000_block_8_coach_safe_rpcs_and_atomic_assignment.sql` (filename in repo). 5 SECURITY DEFINER RPCs (`list_active_coaches_for_service`, `list_active_teams_for_client`, `get_coaches_for_subscription_addons`, `coach_assignment_would_block`, `assign_coach_atomic`) + `coach_teams_read_active` policy `TO authenticated`. **Post-recovery verification:** all 5 RPCs live in `information_schema.routines` with SECURITY DEFINER; policy `polroles = {authenticated}`; smoke test against `one_to_one_online` returned 1 coach + 2 teams.

### ⚠️ 2026-05-23 deploy incident -- `db push` blocked by drift, recovered via MCP

`supabase db push` failed with "Remote migration versions not found in local migrations directory" -- the 15-entry version-string drift tracked in `memory/project_igu_education_arc_drift.md` finally blocked a real ship. CLI suggested either `migration repair --status reverted` for each of 15 versions, OR `db pull`.

The deploy script ran sequentially, so edge functions + FE went out anyway. For an unknown duration between `functions deploy` and the MCP-apply recovery, prod was in a broken state: FE called RPCs that didn't exist; `submit-onboarding` called `assign_coach_atomic` that didn't exist. Anyone hitting an onboarding flow during that window got 500s. **Verify in Sentry / Supabase function logs whether any real users hit this.**

Recovered by running the migration body through MCP `apply_migration` directly (project `ghotrbotrywonaejlppg`). The MCP tool bypasses the CLI's drift check but assigns its own apply-time UTC timestamp, so this adds one more entry to the drift table -- now 16 entries that don't match local filenames.

**Drift cleanup (Block D6) is now elevated from cosmetic to blocking.** The next `db push` attempt will fail the same way. Recommended next-chat action -- option 1:

1. **`supabase migration repair --status reverted <each-of-the-16-versions>`** -- deletes remote bookkeeping rows for the 16 mismatched versions, then `supabase db pull` regenerates local filesystem from remote OR you re-apply via `db push` so local filenames win. Per Supabase docs this is the documented fix. The migrations are still applied to the actual schema; this only rewrites the migration-history table.
2. **`supabase db pull`** alone -- regenerates local from remote. Risky -- would replace local filenames with remote's apply-time timestamps. Untracked migrations in `_pending_migrations/` are safe.
3. **Manually rename 16 local files** to match remote-recorded versions. Tedious but no remote bookkeeping changes.

**Until D6 is resolved, every future migration MUST be applied via MCP `apply_migration`, not `db push`.** Add this caveat to the deploy block of any future block-N findings.

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

## Block D6 — migration drift cleanup ✅ CLOSED 2026-05-23

Drift went from 16 → 0. Both the education-arc drift AND the 7 pre-existing bare-date duplicates were resolved in the same pass; the cumulative `supabase/migrations/` ↔ remote `supabase_migrations.schema_migrations` diff is empty (verified by simulating the CLI's `assertRemoteInSync` walk: 325 local versions = 325 remote versions, no extras either side).

### What was done

**File ops (committed in this branch — staged, awaiting commit):**

1. **13 renames** to align local filenames with the remote-recorded versions:

   | Old | New |
   |-----|-----|
   | `20260515120000_unify_goal_type_vocab.sql`                        | `20260516065935_unify_goal_type_vocab.sql` |
   | `20260516120000_simplify_video_access.sql`                        | `20260516064945_simplify_video_access.sql` |
   | `20260516130000_get_playlist_videos_with_access.sql`              | `20260516065920_get_playlist_videos_with_access.sql` |
   | `20260516140000_video_duration_and_continue_watching.sql`         | `20260516103347_video_duration_and_continue_watching.sql` |
   | `20260516150000_admin_power_tools.sql`                            | `20260516141703_admin_power_tools.sql` |
   | `20260516160000_backfill_phase_completion_dates.sql`              | `20260516182245_backfill_phase_completion_dates.sql` |
   | `20260516160000_required_viewing_and_assignments.sql`             | `20260516181925_required_viewing_and_assignments.sql` |
   | `20260516170000_playlist_assignments_support.sql`                 | `20260516183543_playlist_assignments_support.sql` |
   | `20260516180000_subscription_aware_assignments.sql`               | `20260517190835_subscription_aware_assignments.sql` |
   | `20260519120000_content_link_unique_constraints.sql`              | `20260519125833_content_link_unique_constraints.sql` |
   | `20260520113249_team_subscription_payments_rls.sql`               | `20260521152210_team_subscription_payments_rls.sql` |
   | `20260520125655_strip_parq_from_drafts.sql`                       | `20260521192740_strip_parq_from_drafts.sql` |
   | `20260522120000_block_8_coach_safe_rpcs_and_atomic_assignment.sql`| `20260523084526_block_8_coach_safe_rpcs_and_atomic_assignment.sql` |

   Renames also resolve the two duplicate-version pairs (`20260516120000` ×2, `20260516160000` ×2) since the conflicting siblings move to distinct remote-canonical versions.

2. **1 → 3 split** of `20260517100000_content_links.sql`: the single local file always was applied to remote as three separate transactions. Split at the section markers to match the 3 remote rows:
   - `20260519112530_content_links.sql` (sections 1 + 2 — schema)
   - `20260519112611_content_links_rpcs.sql` (sections 3 + 4 — RPCs)
   - `20260519112644_content_links_summary_rpc.sql` (section 5 — summary RPC)

3. **7 deletions** of pre-existing bare-date duplicates from `supabase/migrations/`. The canonical scratch copies live in `_pre_existing_drift/` and are unaffected; this only removes the duplicate copies inside the CLI-watched dir so it stops trying to re-apply them:
   - `20260416_hip_flexor_execution_cues.sql`
   - `20260419_forearms_upperback_execution.sql`
   - `20260420_lower_traps_rhomboids_teres_execution.sql`
   - `20260421_core_execution.sql`
   - `20260422_glutes_execution.sql`
   - `20260503_rest_seconds_max.sql`
   - `20260505_add_t_bar_row_mid_back.sql`

**Remote bookkeeping (applied via MCP `execute_sql`, project `ghotrbotrywonaejlppg`):**

4. **1 INSERT** into `supabase_migrations.schema_migrations` for `20260517104551_get_coach_for_client_rpc` (the only local file that previously had no remote record at all -- the RPC has been live since PR #118 / squash 418971a but was never recorded in history). Body inserted as a 4-element `statements` text array. Equivalent to `supabase migration repair --status applied 20260517104551`. No schema change.

### Why renames + 1 bookkeeping insert (not `repair --status reverted` + `db pull`)

The original recommendation in `memory/project_igu_education_arc_drift.md` was `repair --status reverted <16 versions>` followed by `db pull`. After reading the Supabase CLI source (`apps/cli-go/internal/migration/repair/repair.go`, `apps/cli-go/internal/db/pull/pull.go`, `apps/cli-go/pkg/migration/apply.go`):

- `repair --status reverted <v>` is a single `DELETE FROM supabase_migrations.schema_migrations WHERE version = ANY($1)`. Bookkeeping only -- no schema change.
- `repair --status applied <v>` upserts `(version, name, statements)` from the local file body. Bookkeeping only -- does **not** run the SQL.
- The CLI's drift check (`FindPendingMigrations` for `db push`, `assertRemoteInSync` for `db pull`) compares VERSION STRINGS only -- it does not compare the stored `statements` body against the local file content.

So the cleanest minimal-churn path was: rename local files until every version on disk matches a version in remote bookkeeping, plus one bookkeeping insert for the lone untracked file. That avoids any `--status reverted` of legitimate remote rows (would have to re-upsert all 16 anyway via `--status applied`) and avoids `db pull` (which would have generated a redundant schema-dump migration).

### Verification (paste in Claude Code after `git pull`)

```bash
cd ~/Projects/intensive-gainz-unit-main
git pull

# 1. Migration list should show every row paired (Local | Remote both present)
supabase migration list

# 2. Dry-run push should print "Remote database is up to date."
supabase db push --dry-run
```

If either step shows drift, rollback is:

```bash
# Revert all local file ops (restores working tree to pre-D6 state):
git restore --staged --worktree supabase/migrations/

# Reverse the bookkeeping insert (run from MCP execute_sql or psql):
# DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260517104551';
```

### Other tech debt (open)

- The 7 bare-date `.sql` files in `_pre_existing_drift/` still need a fate decision: are they SUPERSEDED by `20260512100817_exercise_library_v2_sync.sql` (likely, per the scratch-dir README) or are they PENDING work that was never run on prod? Read each, diff against remote schema, then either delete the scratch copies (if superseded) or convert to proper timestamped migrations (if pending).
- Triceps execution-cue bug in `20260512100932_execution_cue_refinements.sql` -- Section 6 filters on `'elbow_extensors'` (zero rows) instead of `'triceps'`. Still live in prod. Needs separate fix block.
- `feat/content-links-fix` branch still exists locally. Safe to delete with `git branch -D feat/content-links-fix`.

---

## Block 3 — Auth flow findings

**Audit completed 2026-05-23.** Surfaces audited: `AuthGuard.tsx`, `RoleProtectedRoute.tsx`, `OnboardingGuard.tsx`, `WaitlistGuard.tsx`, `src/integrations/supabase/client.ts`, `useAuthSession`, `useRoleCache`, `useUserRole`, `useRoleGate`, `Auth.tsx`, `ResetPassword.tsx`, `EmailConfirmed.tsx`, `CoachSignup.tsx`, `OnboardingStatus.tsx`. Edge-function auth gates were already audited in Blocks 1/2/8 and are tracked under those blocks.

The core guard machinery (`AuthGuard` 8s pattern, `RoleProtectedRoute` raw-fetch role check, `useRoleCache` tampering guard, `client.ts` navigator-lock bypass + `initializePromise` race + `setSession()` recovery) is structurally sound. Findings concentrate on (a) callsites that bypass the documented timeout / RLS-safety patterns, (b) the secondary auth pages, and (c) `OnboardingStatus`.

### NEW-FINDING P0 — fixed in-repo 2026-05-23, awaiting commit

- **B3-N1 ✅ FIXED.** `src/components/OnboardingStatus.tsx:62-68` was using the banned nested PostgREST FK join `subscriptions.select('...services(name, type)')` (CLAUDE.md non-negotiable rule #1). Split into a separate `services.select('name, type').eq('id', subscription.service_id).maybeSingle()` query keyed on `subscription.service_id`. Removed both `(subscription as any)?.services?.{name,type}` casts. While in the file, also flipped the `profiles_public` `.single()` on line 51 to `.maybeSingle()` (same defensive reasoning as B3-N2 -- the `handle_new_user` trigger can race with this read on fresh signups).

- **B3-N2 ✅ FIXED.** `.single()` on `profiles_public` swapped to `.maybeSingle()` in three places, with the null-profile case explicitly routed to `/onboarding` (was silently falling through to `/dashboard`):
  - `src/pages/Auth.tsx:164` (in `handleRedirectAfterAuth`, the `checkExistingSession` path).
  - `src/pages/Auth.tsx:508` (in `handleSignIn`, post-credentials redirect).
  - `src/pages/EmailConfirmed.tsx:88` (in `handleContinue`).

  Verification: `npx tsc --noEmit` passes clean.

### NEW-FINDING P1 — open, IN-REPO triage required

- **B3-N3.** `src/pages/CoachSignup.tsx:93` and `:136` — `getSession()` / `getUser()` with no 8s safety timeout (B8-N14 carry-over). CLAUDE.md: "Any new auth guard calling `getSession()` MUST have a safety timeout." If the GoTrueClient deadlock fires while a coach is finishing their profile, the page hangs on the "Loading..." state forever. **Fix:** wrap in the `Promise.race` 8s pattern from `AuthGuard.tsx:64-67` (or use `withTimeout` from `src/lib/withTimeout.ts`).

- **B3-N4.** `src/components/OnboardingGuard.tsx:196-261` `useOnboardingStatus` hook duplicates the main guard's data-fetch logic but has none of its hardening — no per-query timeout, no `hasFetched` ref guard, and the `getSession()` call on line 206 has no 8s safety timeout. Anyone consuming this hook gets the pre-Phase-16 behavior; the main guard has the post-fix behavior. **Fix:** either delete the hook (callers can use `useAuthGuardSession` + the same query pattern) or refactor it to call the same `queryTimeout` helper the main guard uses.

- **B3-N5.** `src/hooks/useClientAccess.ts:120` -- `getSession()` with no safety timeout. Used inside the client-access gate; a deadlock here hangs the entire client area.

- **B3-N6.** `src/pages/EmailPending.tsx:36` and `EmailConfirmed.tsx:46`/`:67` -- `getSession()` no timeout. These are the email-confirmation polling pages — most likely to hit a fresh tab with cold Supabase init.

- **B3-N7.** `src/components/OnboardingStatus.tsx:30-37` polls `loadStatus()` every 3 seconds on mount with no `hasFetched` guard, no visibility-state check, and no exponential backoff. Network-and-RLS-quota cost is low for one tab, but the page is the default landing surface for a `pending_payment` client and the interval keeps firing even when the tab is backgrounded. **Fix:** gate on `document.visibilityState === 'visible'` plus a `setTimeout`-driven loop you can stop, not `setInterval`.

- **B3-N8.** `src/pages/Auth.tsx:115-136` reads `localStorage.getItem('igu_user_roles')` / `localStorage.getItem('igu_cached_user_id')` directly to make redirect decisions on the timeout fallback path. This bypasses `useRoleCache.getCachedRoles()` which has TTL expiration and the stored-token tampering guard (see `RoleProtectedRoute.tsx:346-349`, the `storedToken && cachedRoles` check). A user who manually sets `igu_user_roles=["admin"]` in localStorage AND has any valid Supabase session token AND triggers the roles-query timeout would get redirected to `/admin`. RLS still blocks data reads, so the actual attack surface is "see the admin shell with no data", but the inconsistency is a smell. **Fix:** route the fallback through `useRoleCache` like the rest of the codebase.

- **B3-N9.** `src/components/RoleProtectedRoute.tsx:140-155` `hasRequiredRole()` defines `isClient = !isAdmin && !isCoach`. A user whose `user_roles` row has ONLY `dietitian` (no `coach`, no `admin`) is treated as a `client` and would be granted access to client-only routes. The role hierarchy in CLAUDE.md § 5b says dietitians should always also have `coach`, so this is a defense-in-depth gap, not a known-broken path. **Fix:** add an explicit `isDietitian = userRoles.includes('dietitian')` check and treat dietitian-only users as having no client access (route them to coach surface, with `is_dietitian` flag driving the UI).

- **B3-N10.** `src/pages/Auth.tsx:308, 375, 519, 548`; `CoachSignup.tsx:185`; `EmailConfirmed.tsx:55`; `OnboardingStatus.tsx:28`. `catch (error: any)` / `useState<any>()` violations of CLAUDE.md "TypeScript strict, `error: unknown` not `any`". Cluster cleanup -- type-narrow with `instanceof Error` like `ResetPassword.tsx:132` does.

### NEW-FINDING P2 — cleanup

- `src/pages/ResetPassword.tsx:177` / `:189` -- HTML `minLength={6}` on the password inputs while the JS validator on line 98 requires `length < 8`. JS wins, so the form submits then rejects -- UX gap. Tighten to `minLength={8}`.
- Three role-fetching hooks coexist with subtly different semantics: `useUserRole`, `useRoleGate`, `useRoleCache` (plus `RoleProtectedRoute`'s own raw-fetch path and `Auth.tsx`'s retry loop). `useUserRole.ts:46-49` and `useRoleGate.ts:135-138` query `user_roles` directly via the Supabase client (which can deadlock on init), while `RoleProtectedRoute` uses `fetch('/rest/v1/rpc/get_my_roles')` to bypass the client. Consolidate around the RPC -- it's more robust.
- `src/pages/NotFound.tsx:20` and `src/pages/admin/SystemHealth.tsx:200` -- `getSession()` no timeout. Low-risk surfaces (404 page sets nav UI; admin diagnostics is manual entry only), but worth wrapping for consistency.
- `Auth.tsx:195-290` main mount useEffect depends on `[handleRedirectAfterAuth, searchParams]`. Both identities change on every render, so the effect could re-fire if React re-renders during the redirect window. `redirectingRef.current` prevents the redirect itself from re-triggering, but `loadServices()` / `checkWaitlist()` / `checkExistingSession()` could double-fire. They're idempotent, so not a correctness bug -- just adds a `hasFetched` ref guard would tighten.

### Confirmed-good patterns

- `src/integrations/supabase/client.ts` -- navigator-lock bypass + 10s `initializePromise` race + `setSession()` recovery path. Comments are clear, semantics match the Block 1/2 audit findings, no changes recommended.
- `src/components/AuthGuard.tsx` -- 8s timeout on `INITIAL_SESSION` null branch, mounted-flag cleanup, intentional empty-deps comment. Canonical pattern.
- `src/components/RoleProtectedRoute.tsx` raw-`fetch()` role check with `Promise.race` timeout + RPC primary / direct query fallback. Cache-first authorization with isAuthorizedRef ratchet that prevents revocation from a transient empty server response. Tampering guard at lines 346-349 (cached roles require a stored auth token). Solid.
- `src/components/WaitlistGuard.tsx` -- 3s `getUser()` race, fail-open on error, `hasFetched` ref. Correct.
- `src/pages/ResetPassword.tsx` -- `withTimeout` wrappers, `hasChecked` ref, password complexity matching `signUpSchema`, PKCE-flow handling. Clean except for the HTML-min-length P2 above.

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
   - **Block 3 (Auth flow) — audit + P0 fixes complete 2026-05-23, awaiting commit.** 2 P0s (B3-N1 + B3-N2) fixed in-repo, tsc clean. 8 P1s (B3-N3..N10) and 4 P2s still open -- not blocking, can ship in a follow-up alongside Block 4 fixes. See "Block 3 -- Auth flow findings" section.
   - **Block 4 (Admin tooling)** recommended next fresh audit. Verify role isolation -- every admin page must `Unauthorized` for the other 5 roles. Bring forward `useRoleGate` / `useUserRole` consolidation question from B3-P2.
   - **Block D6 ✅ CLOSED + verified 2026-05-23.** `supabase db push --dry-run` printed "Remote database is up to date." `supabase migration list` shows every row paired Local | Remote. Commit `2956e8f` on main.
   - **Sentry / function-log check from 2026-05-23 incident ✅ DONE.** FE Sentry has 2 events in 30d (both synthetic DSN probes), zero hits on any of the new Block 8 RPC names or `PGRST202` / "function does not exist". Postgres logs (24h) have zero ERROR/FATAL/`42883` entries. API log window all 200s. Pre-launch traffic was effectively zero. No apology email needed.
   - **Address remaining Block 8 NEW-FINDING P1s** -- B8-N4, B8-N5, B8-N7 through B8-N18 (B8-N6, B8-N19, B8-N20, B8-N21 ✅ closed 2026-05-23). Team-fan-out race (B8-N16/N17) is the biggest correctness risk.

---

## Workflow notes for the next chat

- Hasan operates via **copy-paste middleman** with Claude Code in his terminal. Write paste-ready blocks (no preamble) for him to paste in. Don't ask him to test or run things himself.
- He prefers **complete structural fixes** over "ship-now-monitor-later" workarounds. Launch may slip.
- The Supabase `mcp__supabase__apply_migration` tool assigns its own version timestamp (not the filename's). Use `supabase db push` for predictable versioning, `apply_migration` for surgical one-offs.
- `coaches_client_safe` view returns 0 rows to clients despite the name — always use `get_coach_for_client` RPC in client code.
- The `account_status` enum does NOT contain `'rejected'`. Medical-review rejections write `'cancelled'`.
- Edge function deploys are direct-to-prod (no Supabase branches set up). Each blocked-fix is "strictly better than current state" before deploying.
