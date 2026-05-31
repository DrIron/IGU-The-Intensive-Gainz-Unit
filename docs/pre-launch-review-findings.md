# IGU pre-launch deep-dive review — findings & handover

**Last updated:** 2026-05-31 (Block 7 audit appended)
**Launch target:** 2026-07-12 (Sun) 09:00 Kuwait. Public signup opens 2026-07-14. Launch date may slip — Hasan prefers complete structural fixes over deadline-driven workarounds.

This document tracks the 10-block pre-launch audit (per `docs/pre-launch-review.md` or the original prompt set). Append findings here; bring any new P0 back to triage before fix.

---

## Status at a glance

| #  | Block                       | Audit status      | Fixes shipped to prod                 |
|----|-----------------------------|-------------------|---------------------------------------|
| 1  | Billing & payments          | ✅ Complete       | ✅ Shipped (commit d9b2836 + edge fns + migrations) |
| 2  | Onboarding & medical review | ✅ Complete       | ✅ Shipped (commit d9b2836 + edge fns + migrations) |
| 3  | Auth flow                   | ✅ Complete       | ✅ 2 P0s shipped 2026-05-23 (commit 5bcffc7: B3-N1 + B3-N2). 8 P1 + 4 P2 still open. |
| 4  | Admin tooling               | ✅ Complete (audit) | ✅ 10 P0s shipped 2026-05-23 (commit 6de43dd: B4-N1..N10 — silent-mutation cluster + 3 banned-FK-join splits). 7 P1s + 5 P2s still open. Role isolation at the gate ✅ verified intact. |
| 5  | Messaging                   | ✅ Complete (audit) | ❌ NOT shipped. 4 P0s logged (B5-N1..N4): realtime publication empty, banned nested FK joins + getUser-no-timeout in CareTeamMessagesPanel, sequential mark-as-read loop, ccm_update_own client_id move vector. 8 P1s + 5 P2s open. |
| 6  | Sessions / PT bookings      | ⏳ Not started    | —                                     |
| 7  | Teams feature               | ✅ Complete (audit) | ❌ NOT shipped. 5 P0s (anon team browser shows "Coach", coach_id orphan after ChooseTeamPrompt/ChangeTeamDialog, `assign_program_to_client` unguarded, subscription column-write hole — billing bypass confirmed live, client-side once-per-cycle gate). 7 P1s + 7 P2s open. |
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

## Block 4 — Admin tooling findings

**Audit completed 2026-05-23.** Surfaces audited: every `/admin*` route in `src/App.tsx`, every file in `src/pages/admin/` (11 pages) and `src/components/admin/` (54 components), the `RoleProtectedRoute` admin gate, the `get_my_roles` RPC body (verified live via MCP `execute_sql`), `user_roles` RLS policies (10 policies, all admin-gated for write), `useRoleCache` / `useAuthCleanup` cache lifecycle, and the `useUserRole` / `useRoleGate` / `useFeatureAccess` consumers.

### Role isolation — ✅ verified intact at the gate

The 6-role isolation requirement (each `/admin*` route Unauthorized for `coach`, `client`, `dietitian`, `physiotherapist`, `sports_psychologist`, `mobility_coach`) is met by construction:

- `RoleProtectedRoute.tsx:140-155` `hasRequiredRole(userRoles, 'admin')` reduces to `userRoles.includes('admin')`. None of the 5 non-admin roles include the `admin` enum value in `user_roles`, so all 5 are rejected.
- Subroles (physiotherapist, sports_psychologist, mobility_coach) live in `user_subroles`, NOT `user_roles`. `get_my_roles()` queries only `user_roles` (verified live: SECURITY DEFINER, `SELECT array_agg(role::text) FROM public.user_roles WHERE user_id = auth.uid()`). So a physio-subrole user with core role `coach` returns `['coach']` from the RPC → admin gate rejects.
- Dietitians: `user_roles.role = 'dietitian'` IS an `app_role` enum value, so they show up in the array. But the admin gate checks `includes('admin')` specifically, so `['dietitian']` or `['coach', 'dietitian']` are both rejected.
- `user_roles` RLS write policies all gate on `has_role(auth.uid(), 'admin')` or `is_admin(auth.uid())` (10 policies in total — some overlapping, no harmful gaps). So no client/coach/subrole user can self-elevate via INSERT.
- `BLOCKED_ROUTE_PREFIXES` in `src/auth/roles.ts:181-185` is a second layer: `/admin` is in `coach.blocked` and `client.blocked`. `isRouteBlocked()` re-checks at every `RoleProtectedRoute` render. Defense in depth.

**Explicit admin routes in App.tsx (12 wrapped in `RoleProtectedRoute requiredRole="admin"`):** `/admin`, `/admin/:section`, `/admin/client-diagnostics`, `/admin/email-log`, `/admin/workout-qa`, `/admin/debug/roles`, `/admin/security-checklist`, `/admin/diagnostics`, `/admin/diagnostics/site-map`, `/admin/health`, `/admin/content-engagement`, `/testimonials-management`. All other `/admin/*` paths from `routeConfig.ts` (dashboard, clients, coaches, billing, pricing-payouts, etc.) dispatch through the `/admin/:section` wildcard into `AdminDashboard` → `AdminDashboardLayout`'s switch. Wildcard-dispatched paths inherit the admin gate from the wildcard route — verified.

### NEW-FINDING P0 — silent admin mutations (cluster)

Same class as Block 1's `silent-mutation cluster` (P1-1/2/3). RLS denials on these mutations return HTTP 200 with no rows, no exception — destructured `{ error }` + `throw` is the only path to surface them. The Block 1 fixes covered `tap-webhook` / `verify-payment` / `cancel-subscription`. This block extends the same fix to admin write paths.

- **B4-N1.** ✅ **FIXED 2026-05-23.** `src/components/admin/PaymentOverride.tsx:181-184` — `supabase.from("profiles_public").update(profileUpdate).eq("id", userId)` had NO `{ error }` destructure. The same handler destructures + throws on the subscription update three lines above (line 159-164), so this is an inconsistency, not a top-level miss. **Impact:** admin marks user as paid → subscription flips to `active` → profile-status update silently fails under RLS → next client login bounces through `OnboardingGuard` (sees stale `pending_payment` or `needs_medical_review`) → user stuck. Fix: destructure `{ error }` and throw. While in the file, also fix B4-N2 + B4-N3 below as one cluster.

- **B4-N2.** ✅ **FIXED 2026-05-23.** `src/components/admin/PaymentOverride.tsx:189-204` — `supabase.from("subscription_payments").insert({...})` was silent. Payment record disappears under RLS error; payment history misses the manual override.

- **B4-N3.** ✅ **FIXED 2026-05-23.** `src/components/admin/PaymentOverride.tsx:208-221` — `supabase.from("security_audit_log").insert({...})` was silent. Compliance audit entry lost on failure — same risk as the Block 1 `user_roles.delete` refund path the original audit flagged as critical.

- **B4-N4.** ✅ **FIXED 2026-05-23.** `src/components/admin/AdminBillingManager.tsx:211-217` `logAuditAction()` helper did `await supabase.from("admin_audit_log").insert({...})` with no destructure. Every admin billing action (grace extension, manual payment, etc.) feeds this helper — all of them silently swallow audit failures.

- **B4-N5.** ✅ **FIXED 2026-05-23.** `src/components/admin/ClientStatusOverride.tsx:121-131` — `admin_audit_log.insert(...)` was silent. Same pattern as B4-N4.

- **B4-N6.** ✅ **FIXED 2026-05-23.** `src/components/admin/SystemHealthView.tsx:660-666` — `phi_compliance_scans.insert(...)` was silent. Compliance-scan history could lose entries on RLS error.

- **B4-N7.** ✅ **FIXED 2026-05-23.** `src/components/admin/CoachReassignmentSection.tsx:201-204` — `coaches.update({ last_assigned_at })` was wrapped in try/catch with no `{ error }` destructure. Fix preserves best-effort intent: destructure + log (don't throw — reassignment has already committed; this is fairness tracking, not critical path). CLAUDE.md is explicit: RLS denials are HTTP 200, no throw — the catch only catches network/parse errors. P1 within the cluster: `last_assigned_at` drift is non-critical but the same pattern repeated everywhere is the real problem.

### NEW-FINDING P0 — banned nested PostgREST FK joins on `subscriptions`

CLAUDE.md non-negotiable rule: "Never use nested PostgREST FK joins on `client_programs` / `subscriptions` / `profiles`. Silent wrong counts." Block 1 P1-7 / P1-9 already fixed this pattern in `BillingPayment.tsx` / `process-payment-failure-drip`. Three admin surfaces still violate:

- **B4-N8.** ✅ **FIXED 2026-05-23.** `src/components/admin/SubscriptionBreakdown.tsx:23` — was `from("subscriptions").select("service_id, services(name, type)")`. Split into two queries (`subscriptions.service_id` then `services.in("id", uniqueServiceIds)`). Empty-state branch added for the no-active-subs case. Admin dashboard's subscription-by-service breakdown silently under-counts when the PostgREST embed flakes. Fix: split into two queries — fetch `subscriptions.service_id` separately, then `.in("id", uniqueServiceIds)` against `services`.

- **B4-N9.** ✅ **FIXED 2026-05-23.** `src/components/admin/DiscountAnalytics.tsx:294` — was `from('subscriptions').select('id, status, services(name)')`. Split into two queries; `serviceNamesById` Map drives the enrichment.

- **B4-N10.** ✅ **FIXED 2026-05-23.** `src/components/admin/AdminMetricsCards.tsx:49` — was `from("subscriptions").select("service_id, services(name, price_kwd)")`. This is the admin landing-page MRR/active-counts panel (highest-visibility violation of the three). Split into two queries; `priceById` Map drives the revenue sum.

### NEW-FINDING P1 — admin guards bypass `getSession()` timeout pattern

CLAUDE.md non-negotiable: "Any new auth guard calling `getSession()` MUST have a safety timeout (see AuthGuard.tsx 8s pattern)." Block 3 (B3-N3 .. B3-N6) flagged this on auth-flow secondary pages. Block 4 finds the same gap throughout admin:

- **B4-N11.** `src/components/admin/AdminPageLayout.tsx:33` — `await supabase.auth.getSession()` no timeout, no `hasFetched` ref guard. Used by `ContentEngagement.tsx`, `RolesDebug.tsx`, `ClientDiagnostics.tsx`. RoleProtectedRoute granted access via cache-first, then AdminPageLayout's inner gate hangs forever on `getSession()` deadlock → all three admin pages permanently show "Loading...". Fix: wrap `getSession()` in `withTimeout` (or use the `useAuthGuardSession` hook from `useAuthSession.ts` like the main shell does). While there, add `useRef<boolean>` hasFetched guard to the line 62-64 useEffect.

- **B4-N12.** `getSession()` / `getUser()` without timeout — cluster across 17 admin callsites (mostly inside action handlers, lower risk than guards but they freeze the action on deadlock):
  - `components/admin/SecuritySmokeTests.tsx:46`
  - `components/admin/PayoutRatesManager.tsx:289`
  - `components/admin/SystemHealthView.tsx:655`
  - `components/admin/SubroleApprovalQueue.tsx:136`
  - `components/admin/RoutesDebugPanel.tsx:41`
  - `components/admin/ClientStatusOverride.tsx:97`
  - `components/admin/WaitlistManager.tsx:101`
  - `components/admin/PricingPayoutsPage.tsx:239` and `:311`
  - `components/admin/PaymentOverride.tsx:133`
  - `components/admin/AdminBillingManager.tsx:208`
  - `components/admin/ExerciseQuickAdd.tsx:102`
  - `components/admin/MedicalReviewsPanel.tsx:106` (canonical pattern elsewhere — fix here too for consistency)
  - `components/admin/PreLaunchSecurityGate.tsx:60` (gate-like; raise priority within the cluster)
  - `pages/admin/RolesDebug.tsx:29`
  - `pages/admin/WorkoutBuilderQA.tsx:57`
  - `pages/admin/SystemHealth.tsx:200` (carry-over from B3-P2)
  - `pages/admin/SiteMapDiagnostics.tsx:62`

  Cluster fix: wrap all in the existing `withTimeout` from `src/lib/withTimeout.ts`. Aim for 8s default per CLAUDE.md.

### NEW-FINDING P1 — role-cache invalidation gaps

- **B4-N13.** Server-side role revocation (admin DELETEs a `user_roles` row) does NOT propagate to the revoked user's open tabs in realtime. The revoked user keeps cached `['admin']` (or whatever) until next route navigation triggers `RoleProtectedRoute.verifyRolesWithServer`. Because the `ensure_default_client_role` trigger keeps at least one `member` row, the server response is non-empty → `hasRequiredRole` returns false → `handleUnauthorized` redirects. **So revocation IS handled at next navigation**, but the current tab/page keeps working. Acceptable for IGU's threat model (admins are trusted, revocations are rare), but document it.
  Suggested fix (if elevated to blocker): admin-side role mutations call `supabase.channel('user_roles_changes').send(...)` broadcast; receiving tabs subscribe and force `verifyRolesWithServer`. Or simpler: shrink `TIMEOUTS.CACHE_TTL` from 24h → 5min. CLAUDE.md QueryClient defaults already use 5min staleTime, so 5min would be consistent — but it costs an extra round-trip per page navigation.

- **B4-N14.** `useRoleCache.getCachedRoles()` returns STALE data even after TTL expiry (line 144-147: "Cache expired, but returning stale data for immediate use"). Combined with `verifyRolesWithServer`'s "never revoke on empty server response" guard, a revoked admin who suffers a network glitch during background verify could keep admin-grant indefinitely. RLS server-side still blocks data reads, so attack surface is "see admin shell with no data" — but inconsistency is a smell. Pair with B4-N13 fix.

### NEW-FINDING P1 — `useRoleGate` / `useUserRole` consolidation (B3-P2 carry-forward)

- **B4-N15.** **Four** role-fetching code paths coexist:
  1. `RoleProtectedRoute.fetchUserRoles` — raw `fetch('/rest/v1/rpc/get_my_roles')` with 4s `AbortController` (CANONICAL — bypasses Supabase client deadlock).
  2. `useRoleCache` — `localStorage` layer with 24h TTL.
  3. `useUserRole` (1 consumer: `ClientSubmission.tsx`) — `supabase.auth.getSession()` (with 8s timeout — added recently) + `.from('user_roles').select('role')`.
  4. `useRoleGate` / `useFeatureAccess` (2 consumers: `Unauthorized.tsx`, `PermissionGate.tsx`) — same `getSession()` + direct table query pattern.

  Paths 3 and 4 query `user_roles` via the Supabase client (which can deadlock on init — the whole reason path 1 exists). They have `hasFetched` ref guards locally, but each duplicates logic that exists elsewhere with subtle differences (e.g. `useUserRole` uses `isMounted` flag, `useRoleGate` uses ref). Three places that must stay in sync to avoid drift.

  **Suggested consolidation:** build a single `useCanonicalRoles()` that:
  1. Reads from `useRoleCache` first (cache layer, with TTL + tampering guard).
  2. Calls the same raw-`fetch('/rest/v1/rpc/get_my_roles')` function `RoleProtectedRoute` uses (export it from a shared module).
  3. Exposes the derived flags (`isAdmin`, `isCoach`, `isClient`, `roles`, `userId`, `loading`).

  Then migrate `useUserRole` (1 callsite) and `useRoleGate` (2 callsites) to delegate. 4 code paths → 1. Low blast radius (only 3 consumer files).

  This was also flagged in `Auth.tsx:115-136` (B3-N8) — the timeout-fallback path reads `localStorage` directly, bypassing `useRoleCache`'s tampering guard. The consolidation fix should close that gap too.

### NEW-FINDING P2 — cleanup

- **B4-N16.** `src/pages/admin/AdminDashboard.tsx:44` `useState<any>(null)` (currentUser typed any), line 119 `catch (timeoutErr)` (implicit any). Violates CLAUDE.md "error: unknown not any". Layer of `any` propagates into `AdminDashboardLayout.tsx:41` `user: any` prop.

- **B4-N17.** `src/pages/admin/WorkoutBuilderQA.tsx:90` and `:298` — `.eq(...).limit(1).single()` on optional rows. QA tool only — mild risk. Switch to `.maybeSingle()` for consistency.

- **B4-N18.** `src/components/admin/ProfessionalLevelManager.tsx:185-189` — admin write of `coaches_public.coach_level / is_head_coach / head_coach_specialisation` directly via `.from('coaches_public').update(...)`. CLAUDE.md § "Coach data — column-ownership refactor" says admin coach writes "MUST go through `upsert_coach_full`" and explicitly lists `create-coach-account` and `CoachManagement.tsx` as the two callsites. ProfessionalLevelManager is a third admin coach-write callsite that bypasses the RPC. The columns it writes are canonical on `coaches_public` (not Pattern-B), so atomicity isn't strictly needed — but the rule's spirit is "all admin coach writes funnel through one path." Either extend `upsert_coach_full` to accept level-only patches, or document this as a third sanctioned exception (alongside `submit-onboarding`'s `last_assigned_at` and `CoachProfile.tsx`'s self-service).

- **B4-N19.** `LaunchTestChecklist` is `lazy()`-imported in `src/App.tsx:55` but no `<Route path="/admin/launch-checklist">` exists in App.tsx. It's reachable only via `/admin/:section` → `AdminDashboard` → `AdminDashboardLayout`'s switch at line 124-125. Works, but inconsistent with peer admin pages that have explicit `<Route>`s (e.g. `/admin/health` → `SystemHealth`, `/admin/diagnostics` → `DiagnosticsIndex`). Either remove the dangling `lazy()` import or add the explicit route.

- **B4-N20.** Most admin components that fetch on mount lack `hasFetched` ref guards (Phase 16 pattern). 12 admin files have it; ~22 admin files have empty-deps `useEffect` without it. Most rely on `useCallback` dep stability for idempotency — fragile but currently working. Audit gradually; not blocking.

### Confirmed-good patterns

- `MedicalReviewsPanel.tsx` (canonical — `hasFetched` ref, batched profile fetch, `.maybeSingle()` on optional sub fetch, `{ error }` destructure + throw on every mutation, idempotency guards via `eq('status', 'needs_medical_review')`).
- `RoleProtectedRoute.tsx` admin gate (`hasRequiredRole('admin')` is a strict `includes('admin')` check; tampering guard at 346-349; cache-first with isAuthorizedRef ratchet).
- `get_my_roles()` RPC body (SECURITY DEFINER, `SET search_path = ''`, queries `user_roles` for `auth.uid()` only).
- `user_roles` RLS (10 policies, all writes admin-gated; minor overlap but no harmful gap).
- `useAuthCleanup.ts` `onAuthStateChange('SIGNED_OUT')` listener clears the cache defensively, in addition to the explicit `signOutWithCleanup()` path.
- `ProfessionalLevelManager.tsx` `fetchData` (hasFetched, error destructure on all selects, batched profile names via `.in("id", staffUserIds)`).
- `AdminMetricsCards.tsx` apart from the banned join — N+1 elsewhere is batched.

### Deploy notes

Per the 2026-05-23 incident, **every migration through end of B-block work must apply via MCP `apply_migration`, not `db push`** — until D6's drift cleanup is committed AND verified. D6 was committed (`2956e8f` on main) and verified clean 2026-05-23, so `db push` should now work for future migrations. Block 4 introduces no migrations; all fixes are FE / edge-function level.

---

## Block 5 -- Messaging findings

**Audit completed 2026-05-23.** Surfaces audited: migrations `20260207100007_care_team_messages.sql`, `20260504000000_coach_client_messages.sql`, `20260504100000_unread_counts_for_staff.sql`, `20260504200000_coach_client_message_edit_history.sql`; the 3 SECURITY DEFINER RPCs (`mark_coach_client_thread_read`, `get_unread_message_count`, `get_unread_message_counts_for_staff`) and the `record_coach_client_message_edit` trigger pulled live via MCP `execute_sql`; the `send-coach-client-message-email` edge function; FE files `src/components/messaging/CoachClientThread.tsx`, `src/pages/ClientMessages.tsx`, `src/components/client-overview/tabs/MessagesTab.tsx`, `src/components/nutrition/CareTeamMessagesPanel.tsx`, `src/hooks/useUnreadMessageCount.ts`, `src/hooks/useStaffUnreadCounts.ts`; the `supabase_realtime` publication + `REPLICA IDENTITY` settings; live RLS probes against `auth.users` test accounts; pg_policy + pg_proc + pg_trigger dumps.

### Verified-good (live probes)

- **Client cannot read `care_team_messages`** -- live probed with a real client UID (`SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', ...)`). Inserted a probe row keyed to that client; the SELECT returned 0 rows. The policy `care_team_messages_team_select USING (is_care_team_member_for_client(auth.uid(), client_id) AND auth.uid() != client_id)` holds under both interpretations -- client-as-self (the `!= client_id` clause fails) and client-as-other (the `is_care_team_member` clause fails).
- **Client cannot read another client's `coach_client_message_edits`** -- live probed the same way; 0 rows returned.
- **Edit trigger fires correctly** -- live probed: UPDATE that changed `message` produced exactly one `coach_client_message_edits` row with `previous_message = 'original-text'`; a follow-up UPDATE that changed only `read_by` produced zero new rows (the `IS DISTINCT FROM` guard works).
- **Sender enforcement on INSERT** -- `ccm_insert WITH CHECK (sender_id = auth.uid() AND deleted_at IS NULL AND (auth.uid() = client_id OR is_care_team_member_for_client(...)))` blocks third-party spoofing, locks first-INSERT `deleted_at` to NULL, and rejects writes by users with no relationship to the thread.
- **Edits table is append-only from user code** -- `coach_client_message_edits` has only `ccme_select` + `ccme_admin_all` policies; no INSERT/UPDATE/DELETE policies, so user-initiated writes are blocked. The trigger runs SECURITY DEFINER, so it bypasses RLS for its INSERT.
- **No DELETE policy on `coach_client_messages`** -- soft-delete via `deleted_at` UPDATE is the only retraction path, as documented. ✅
- **`mark_coach_client_thread_read` authorisation gate** -- live-dumped: `RAISE EXCEPTION 'Not authorised for this thread'` if `auth.uid()` is neither the client nor a care-team member. SECURITY DEFINER. ✅
- **OPTIONS handled before req.json()** in `send-coach-client-message-email/index.ts:68-70` ✅. Internal JWT validation present (line 73-89). Throttle key matches CLAUDE.md spec: `(recipient.user_id, NOTIFICATION_TYPE, context_id=client_id)` at line 147-150. Dedup-read failures fail OPEN (line 152-156, `console.warn` then continue). EMAIL_FROM_COACHING used (line 174).

### NEW-FINDING P0 -- realtime publication is EMPTY (messaging in-app freshness silently broken)

- **B5-N1.** `supabase_realtime` publication has zero tables (`puballtables=false`, `pg_publication_tables` returns no rows for `supabase_realtime`). All three messaging realtime subscriptions are no-ops in production:
  - `src/components/messaging/CoachClientThread.tsx:168-218` -- INSERT + UPDATE subscriptions filtered on `client_id=eq.X` receive zero events.
  - `src/hooks/useUnreadMessageCount.ts:62-78` -- per-thread unread badge realtime is dead.
  - `src/hooks/useStaffUnreadCounts.ts:71-84` -- coach client directory unread badge realtime is dead.

  Symptom users see: a sent message doesn't appear in the recipient's thread until either (a) the 5-minute fallback poll fires, (b) the recipient blurs/refocuses the tab (`visibilitychange` handler), or (c) a full page reload. CLAUDE.md § "Messages system" promises "Realtime subscription on `postgres_changes event='*' filter='client_id=eq.X'`. Applies INSERTs and UPDATEs in place" -- that contract is currently false.

  Fix (migration):
  ```sql
  ALTER PUBLICATION supabase_realtime ADD TABLE public.coach_client_messages;
  -- REPLICA IDENTITY FULL so UPDATE events ship the OLD row with non-PK columns
  -- (the realtime layer matches `filter=client_id=eq.X` against OLD on UPDATEs,
  --  so without FULL, UPDATE events drop on the floor).
  ALTER TABLE public.coach_client_messages REPLICA IDENTITY FULL;
  ```
  Same migration should also `ADD TABLE public.coach_client_message_edits` if "edited" chip is expected to refresh live (low-priority for launch -- the chip is opened on demand). `care_team_messages` is staff-only and has no realtime callsites today, so leave it out.

  Verification after apply:
  ```sql
  SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
  -- expect a row for coach_client_messages (and any other tables you add).
  SELECT relreplident FROM pg_class WHERE relname = 'coach_client_messages';
  -- expect 'f' (full).
  ```

### NEW-FINDING P0 -- `CareTeamMessagesPanel.tsx` cluster (silent-mutation + banned FK joins + getUser-no-timeout + N+1 await loop)

Same class as Block 4's silent-mutation cluster (B4-N1..N7) + banned-FK-join cluster (B4-N8..N10) + auth-timeout cluster (B4-N11/N12).

- **B5-N2.** `src/components/nutrition/CareTeamMessagesPanel.tsx:75` -- `const { data: { user } } = await supabase.auth.getUser()` has NO 8s timeout. CLAUDE.md non-negotiable: "Auth guards must have a safety timeout (see AuthGuard.tsx 8s pattern)." Mirrors B4-N11/N12. GoTrueClient deadlock = `loadData` hangs forever, panel stuck on `Loader2`. Fix: wrap in `withTimeout` (8s) from `src/lib/withTimeout.ts`.

- **B5-N3.** Banned nested PostgREST FK joins on `subscriptions` (project rule #1):
  - `:104-116` -- `from('subscriptions').select('coach_id, coaches_client_safe:coach_id(...)').eq('user_id', clientId).eq('status', 'active').maybeSingle()`. `subscriptions` is on the banned list -- silent wrong-coach risk under PostgREST embed failure. Split into two queries: subscription first, then `coaches_client_safe` by `id` (or better, switch to `get_coach_for_client` RPC per `memory/project_coaches_client_safe_rls.md`, since `coaches_client_safe` is RLS-broken for client callers and currently coach-side-only by accident).
  - `:89-101` -- `from('care_team_assignments').select('staff_user_id, specialty, coaches_client_safe:staff_user_id(...)').eq('client_id', clientId).in('lifecycle_status', ['active','scheduled_end'])`. `care_team_assignments` itself isn't on the banned list, but the embed to `coaches_client_safe` is the same RLS-broken view (per memory). Split into two queries -- second one `.in('id', staffIds)` against `coaches_client_safe` from the coach side, or against `get_coach_for_client` per staff id if rendered client-side. (This panel is staff-only today, so `coaches_client_safe` returns rows -- but the RLS-fragile view is one policy change away from breaking silently.)

  Note: `lifecycle_status` is used here, while `is_care_team_member_for_client` (RLS gatekeeper) uses `status`. See B5-N6 for the cross-block consequence.

- **B5-N4.** Sequential `await` in for loop -- CLAUDE.md non-negotiable: "Parallelize Supabase calls in loops with Promise.all". `CareTeamMessagesPanel.tsx:169-175`:
  ```ts
  for (const msg of unreadMessages) {
    const newReadBy = [...(msg.read_by || []), userId];
    await supabase.from('care_team_messages').update({ read_by: newReadBy }).eq('id', msg.id);
  }
  ```
  N sequential UPDATEs every time the panel mounts. With 10 unread, that's ~5s of network. AND each UPDATE has no `{ error }` destructure -- silent mutation cluster: if RLS denies (e.g. the viewer lost their care-team row mid-session), the badge stays without any signal. Fix: `await Promise.all(unreadMessages.map(...))` AND destructure `{ error }` + log per row.

  Better fix: a `mark_care_team_thread_read` SECURITY DEFINER RPC analogous to `mark_coach_client_thread_read` -- one round trip, atomic, no client-side N+1.

### NEW-FINDING P0 -- `ccm_update_own` lets the SENDER move their own message to another thread

- **B5-N5.** `coach_client_messages` `ccm_update_own` is written as:
  ```sql
  CREATE POLICY ccm_update_own ON public.coach_client_messages FOR UPDATE
    USING (sender_id = auth.uid())
    WITH CHECK (sender_id = auth.uid());
  ```
  The WITH CHECK does not pin `client_id`. Live-probed: a client trying to move their own message into another client's thread is REJECTED -- but only because PostgreSQL's "updated row must remain visible under the SELECT policy" rule catches it (the post-update row has `client_id = other_client`, which fails `ccm_select` for the sender, so the UPDATE errors with `42501 new row violates row-level security policy`). The error is a happy accident of SELECT visibility, NOT the WITH CHECK doing its job.

  **Real abuse vector:** a staff user X who is care-team-member for both client A AND client C. X sends a message in A's thread, then edits the row to set `client_id = C`. The post-update row passes `ccm_select` for X (X is on C's care team), so PostgreSQL allows the move. X has effectively rewritten history -- the original message body and `created_at` are preserved, but the thread it belongs to was rewritten. Compliance/audit ramifications: the `coach_client_message_edits` trigger only fires when `message IS DISTINCT FROM`, so the move leaves no audit trail.

  Could not live-probe this end-to-end because `care_team_assignments` is currently empty in prod (no real client has been assigned a multi-coach team yet) -- but the policy logic is verifiable by reading.

  Fix options:
  1. Tighten the WITH CHECK: `WITH CHECK (sender_id = auth.uid() AND client_id = (SELECT client_id FROM public.coach_client_messages WHERE id = coach_client_messages.id))`. PostgreSQL allows referencing the OLD row inside a policy via a self-subquery, but this is awkward.
  2. **Recommended:** add a `BEFORE UPDATE` trigger that rejects `NEW.client_id IS DISTINCT FROM OLD.client_id`. Also reject `NEW.sender_id IS DISTINCT FROM OLD.sender_id` and `NEW.created_at IS DISTINCT FROM OLD.created_at` in the same trigger for completeness -- these are append-only fields the UI never touches.
  3. Same hardening applies to `care_team_messages` `care_team_messages_team_update` (USING-only, no WITH CHECK, so PostgreSQL defaults WITH CHECK to USING -- which still permits `client_id` changes within the set of clients the staff user serves).

### NEW-FINDING P1 -- cross-block: `care_team_assignments.status` vs `lifecycle_status` (B8-N18 carry-forward)

- **B5-N6.** Carries forward `B8-N18` ("two different 'active' columns in care_team_assignments"). The two columns are NOT kept in sync by any trigger (live-verified via `information_schema.triggers` -- only `trg_auto_create_addon_modules`, `trg_manage_care_team_relationships`, `trg_validate_care_team_subrole`, and `update_care_team_assignments_updated_at`; no sync trigger). The messaging stack splits its usage:
  - `is_care_team_member_for_client` RPC (the RLS gatekeeper for `coach_client_messages` SELECT + INSERT + UPDATE, `coach_client_message_edits` SELECT, `care_team_messages` SELECT + INSERT + UPDATE, plus the mark-read and unread-count RPCs) checks `cta.status = 'active'`.
  - `supabase/functions/send-coach-client-message-email/index.ts:220` checks `.eq('status', 'active')` -- consistent with RLS. ✅
  - `src/hooks/useNutritionPermissions.ts:92,109` checks `lifecycle_status`. ❌ divergent from messaging RLS.
  - `src/components/nutrition/CareTeamMessagesPanel.tsx:101` checks `lifecycle_status`. ❌ divergent (caught here as part of B5-N3).
  - `src/components/coach/MyAssignmentsPanel.tsx:80` reads `lifecycle_status`. (Not a permission check, but shows the FE convention.)

  **Consequence:** a future ramp-down flow that flips only `lifecycle_status` to `'ended'` while leaving `status = 'active'` (or vice versa) will leave the ex-staff member able to read/write the thread (per RLS) while the FE permission hook treats them as no-longer-active -- or the opposite, where the FE thinks they're active but RLS blocks them silently. Today the table is empty (live count: 0 rows), so the divergence is theoretical, but the launch arc adds rows fast.

  **Cleanest fix:** retire `status` (drop the column after migrating data) and have `is_care_team_member_for_client` + the edge function check `lifecycle_status IN ('active','scheduled_end')` -- matching `useNutritionPermissions`. Alternative: keep `status` as the canonical RLS column and add a BEFORE INSERT/UPDATE trigger that mirrors changes from one column to the other. Either way: do not ship Block 5 messaging fixes without a Block-8/5 joint decision on this column.

### NEW-FINDING P1 -- `mark_care_team_message_read` shape inconsistency (no thread-level RPC)

- **B5-N7.** `care_team_messages` has only a per-message mark-read RPC (`mark_care_team_message_read(p_message_id)`, defined in migration `20260207100007`), while `coach_client_messages` has a thread-level `mark_coach_client_thread_read(p_client_id)`. The result: `CareTeamMessagesPanel.tsx:164-176` rolls a client-side N+1 loop over `unreadMessages` (see B5-N4). Fix: add a `mark_care_team_thread_read(p_client_id)` RPC modeled exactly on `mark_coach_client_thread_read` -- SECURITY DEFINER, SET search_path, auth gate via `is_care_team_member_for_client` + `auth.uid() != p_client_id`, one UPDATE statement that array-appends `auth.uid()` to every unread row's `read_by`. Then collapse the FE loop into one `rpc.invoke`.

### NEW-FINDING P1 -- realtime UPDATE filter requires REPLICA IDENTITY FULL

- **B5-N8.** Even after B5-N1's publication fix, `CoachClientThread.tsx:198-212` subscribes to UPDATEs with `filter='client_id=eq.X'`. Supabase's realtime layer matches the filter against the OLD row payload. With `REPLICA IDENTITY DEFAULT` (current state, verified live: `relreplident = 'd'`), the OLD payload contains only the primary key, so the filter cannot match -- UPDATE events drop silently. INSERT events are unaffected (always carry the full new row), so new-message rendering will work but in-place edits / soft-deletes / read-receipt updates will not. Fix: `ALTER TABLE public.coach_client_messages REPLICA IDENTITY FULL;` -- bundled with the B5-N1 migration.

### NEW-FINDING P1 -- sender can self-grant `read_by` entries on their OWN messages

- **B5-N9.** `ccm_update_own` permits the sender to UPDATE any column on their own row, including `read_by`. CLAUDE.md § "Messages system" says "Mark-as-read lives in a SECURITY DEFINER RPC ... so readers don't need UPDATE on the row body" -- but the sender (writer) of a row can still write `read_by = ARRAY['fake-coach-uid']` on their own outgoing message via a direct `supabase.from('coach_client_messages').update({ read_by: ... })`. A client could thus suppress their coach's unread badge for their own outgoing messages (low impact since the coach is the recipient and `get_unread_message_count` uses `auth.uid() = ANY(read_by)` for the CALLER, not the sender). Wider concern: a sender could tamper with downstream UI that relies on `read_by` as a receipt-of-read signal. Fix path is the same as B5-N5: a BEFORE UPDATE trigger that whitelists which columns may change on UPDATE -- only `message`, `edited_at`, `deleted_at` for the sender; `read_by` writes go exclusively through `mark_coach_client_thread_read`.

### NEW-FINDING P1 -- silent insert in edge function logbook

- **B5-N10.** `supabase/functions/send-coach-client-message-email/index.ts:185-196`:
  ```ts
  const { error: logError } = await admin
    .from('email_notifications')
    .insert({ user_id: recipient.user_id, notification_type: NOTIFICATION_TYPE, context_id: message.client_id, sent_at: ..., status: 'sent' });
  if (logError) { console.error('email_notifications insert:', logError.message); }
  ```
  The `{ error }` IS destructured, but the failure path is log-only -- no throw, no retry. Consequence: if the dedup-row INSERT fails (RLS, FK, transient), the email already left the user's inbox but no throttle row exists. Next send within the 30-min window will re-email. Acceptable trade-off (the alternative is throwing AFTER the email has already shipped, which `tap-webhook v9` would do but isn't appropriate here). Document the trade-off as a comment, optionally with a retry-once branch. Lower priority than B5-N1..N5.

### NEW-FINDING P1 -- `is_resolved` toggle in CareTeamMessagesPanel is a silent-mutation candidate

- **B5-N11.** `CareTeamMessagesPanel.tsx:225-232` -- `supabase.from('care_team_messages').update({ is_resolved: ..., resolved_by: ..., resolved_at: ... }).eq('id', messageId)` destructures `{ error }` and throws ✅ but RLS denials are silent (HTTP 200, no row, no error). Same class as `completeWorkout` (PR #117, see `memory/project_workout_complete_silent_fail.md`). If the toggling user lost their care-team relationship since loadData, the toggle no-ops. Fix: switch to `.update(...).select()` and rows-affected check (`if (!data || data.length === 0) throw new Error('Toggle blocked')`), then surface via toast.

### NEW-FINDING P1 -- `currentUserId` from `getUser()` not from `useAuthSession`

- **B5-N12.** `CareTeamMessagesPanel.tsx:53,77,197` -- `currentUserId` is fetched via the one-shot `supabase.auth.getUser()` inside `loadData`, then used as `sender_id` on INSERT. If `getUser` happens to land before `client.ts`'s `setSession` recovery fires (the race PR #103 fixed elsewhere), the panel renders with `currentUserId = null` and the first send INSERTs `sender_id: null` -- RLS blocks it (FK constraint actually) but the error is a server-side rejection visible only via toast. Mirrors the pattern `CoachClientThread.tsx` already uses (`useAuthSession`). Fix: swap to `useAuthSession()` for `currentUserId`.

### NEW-FINDING P1 -- `mark_coach_client_thread_read` mark-read fires DURING load (race vs. realtime)

- **B5-N13.** `CoachClientThread.tsx:141-147` -- `supabase.rpc('mark_coach_client_thread_read', ...)` is fire-and-forget inside `load`, not awaited. Realtime subscription (when B5-N1 ships) will deliver INSERT events that arrive AFTER `load` started but BEFORE mark-read RPC runs server-side. Those messages will be in the local `messages` state but their `read_by` won't include the viewer until next refresh -- the unread badge could flicker. Minor UX issue. Fix: await the mark-read RPC inside `load` before clearing `setLoading(false)`, or fire it after the realtime channel attaches.

### NEW-FINDING P2 -- cleanup

- **B5-N14.** All four SECURITY DEFINER messaging RPCs (`mark_coach_client_thread_read`, `get_unread_message_count`, `get_unread_message_counts_for_staff`, `record_coach_client_message_edit`) use `SET search_path TO 'public'` rather than `SET search_path = ''`. Supabase's official guidance is `''` (empty) so all references must be schema-qualified, which prevents an attacker who controls a `"$user"`-schema function from shadowing helpers like `is_care_team_member_for_client`. The current `public` value is consistent with the rest of the IGU codebase and the project instructions explicitly say `SET search_path = public`, so this is a project-wide convention, not a Block-5 miss. **Flag it as a launch-time follow-up across all SECURITY DEFINER RPCs**, not a Block-5 blocker. Authenticated users can't `CREATE FUNCTION` in any schema today, so not exploitable. Decision needed: align with Supabase docs (`''`) or document the deviation in CLAUDE.md.

- **B5-N15.** Messaging RPCs don't follow CLAUDE.md § "For RPCs: ... RETURNS JSONB" -- they return `void` / `int` / `TABLE(uuid, bigint)` respectively. Functionally correct, but inconsistent with the project convention. Low priority -- conversion would churn three call sites.

- **B5-N16.** `loadCareTeamRecipients` in `send-coach-client-message-email/index.ts:215-238` fetches `care_team_assignments` and `subscriptions` in parallel ✅ but each has no `{ error }` destructure. Best-effort behavior -- on a partial query failure the recipient list silently shortens. Add error logging via `if (assignmentsRes.error) console.error(...)`.

- **B5-N17.** `loadSenderDisplayName` in same file (line 288-298) calls `.maybeSingle()` but doesn't destructure `{ error }`. Falls back to literal "Someone" on miss. Acceptable but inconsistent.

- **B5-N18.** `useUnreadMessageCount` / `useStaffUnreadCounts` have no `hasFetched` ref guard (Phase 16 pattern). They depend on `fetchCount`'s `useCallback` dep-stability for idempotency; double-mount in StrictMode would double-fetch. Low blast radius -- the RPC is idempotent and cheap.

### Confirmed-good patterns

- `CoachClientThread.tsx` -- `hasFetched.current = clientUserId` (ref-keyed not bool), `useAuthSession` for viewerUserId, INSERT followed by `.single()` is correct per CLAUDE.md rule for post-INSERT RETURNING, optimistic edit with rollback on `updateError`, INSERT/UPDATE error destructured + surfaced to UI via `error` state.
- `ClientMessages.tsx` -- thin shell, uses `useAuthSession` (no `getSession`/`getUser` race), routes `viewerIsClient` correctly, renders Not-signed-in vs. Loader vs. Thread without falling through.
- `MessagesTab.tsx` -- same.
- `send-coach-client-message-email` -- correct JWT validation pattern (anon client with caller's Authorization header), `.maybeSingle()` on message lookup, sender-mismatch 403, recipient dedup via Set (primary coach + care-team-row coach only emailed once), per-thread throttle keyed on `(recipient, thread)`, dedup-read fails OPEN.
- `mark_coach_client_thread_read` -- explicit `RAISE EXCEPTION 'Not authorised for this thread'` on caller scope miss; rest of the RPC is one UPDATE statement, no leaks.
- `record_coach_client_message_edit` trigger -- `IS DISTINCT FROM` guard prevents spurious edit rows on read_by-only / deleted_at-only UPDATEs; uses OLD.message + auth.uid() + now() (not NEW.\*).
- `coach_client_message_edits` -- no INSERT/UPDATE/DELETE RLS policies, append-only via trigger.

### Deploy notes

Block 5 introduces one new migration (B5-N1: publication + replica identity) and one BEFORE-UPDATE trigger (B5-N5/N9: column-write whitelist on coach_client_messages and care_team_messages). Both must apply via `supabase db push` now that D6 is closed (verified: `supabase db push --dry-run` returned "Remote database is up to date." as of `2956e8f` on main).

Recommended ship order:
1. **B5-N1** (publication + REPLICA IDENTITY) -- 1 migration, no FE change. Smoke test: open `/messages` in two browser tabs as two different users in the same thread, verify INSERT propagates within 1s.
2. **B5-N5 + B5-N9** (BEFORE UPDATE trigger pinning `client_id` / `sender_id` / `created_at` / `read_by` on coach_client_messages) -- 1 migration. Smoke test: run a contrived UPDATE that mutates client_id via psql under the `authenticated` role -- expect rejection.
3. **B5-N7** (`mark_care_team_thread_read` RPC) -- 1 migration. Then collapse `CareTeamMessagesPanel.tsx:164-176` to a single RPC call. Closes B5-N4 cleanly.
4. **B5-N2 + B5-N3 + B5-N11 + B5-N12** -- FE-only cluster, one commit to `CareTeamMessagesPanel.tsx`.
5. **B5-N6** -- cross-block decision required before applying. Touch `is_care_team_member_for_client` body OR add the sync trigger. Do not ship without joint Block-5/Block-8 alignment.

---

## Block 7 -- Teams feature findings

**Audit completed 2026-05-31.** Surfaces audited: migrations `20260212140000_team_plan_builder.sql`, `20260212160000_team_change_tracking.sql`, `20260212170000_team_subscriptions_rls.sql`, `20260212180000_team_profiles_rls.sql`, `20260222110000_team_browser_columns.sql`, `20260219100000_fix_disk_io_performance.sql` (team-related sections), `20260501_deactivate_legacy_team_services.sql`, `20260515000000_subscription_payments_team_rls.sql`, `20260517104551_get_coach_for_client_rpc.sql`, `20260523084526_block_8_coach_safe_rpcs_and_atomic_assignment.sql`, `20260215110000_assign_program_rpc.sql`, `20260319100000_fix_assign_program_rpc.sql`, `20260319160000_get_current_week_bounds_rpc.sql` (cross-ref), `20260212120000_muscle_program_templates.sql`, `20260419100000_convert_rpc_v2_sessions.sql`; FE files `src/hooks/useTeams.ts`, `src/pages/TeamsPage.tsx`, `src/components/TeamBrowserCard.tsx`, `src/components/onboarding/TeamSelectionSection.tsx`, `src/components/client/ChooseTeamPrompt.tsx`, `src/components/client/ChangeTeamDialog.tsx`, `src/components/coach/teams/CoachTeamsPage.tsx`, `src/components/coach/teams/TeamDetailView.tsx`, `src/components/coach/teams/CreateTeamDialog.tsx`, `src/components/coach/teams/AssignTeamProgramDialog.tsx`, `src/components/TeamPlanSettings.tsx`, `src/components/coach/CoachMyClientsPage.tsx`, `src/lib/assignProgram.ts`; live MCP `execute_sql` probes against prod (`ghotrbotrywonaejlppg`) for RPC bodies, RLS policies on `subscriptions` / `coach_teams` / `session_bookings` / `coach_time_slots` / `direct_calendar_sessions`, and client-impersonation UPDATE attempts.

### Verified-bad (live probes)

- **Anon + non-member calls to `get_coach_for_client` return NULL.** Both `SET LOCAL ROLE anon` and `SET LOCAL ROLE authenticated` with a non-member JWT against a real team coach UID returned `null`. Means the public /teams page renders "Coach" instead of the real head coach name for every viewer except current members of that team.
- **Orphaned team subscription exists in prod right now.** `subscriptions.id = 352de8b3-2980-403c-a619-f47962a1f9f9` (status `active`) has `team_id = 77034189-…` set but `coach_id IS NULL` AND `needs_coach_assignment = false`. Will not appear in admin triage queues, but team head coach can only see this row via the team-id SELECT policy -- no `is_primary_coach_for_user` access for workout writes, nutrition reads, care-team membership ops.
- **Client can downgrade their own tier in one UPDATE.** As `auth.uid()=8f4602e6-…` (real active client), `UPDATE subscriptions SET service_id = '<team_plan id>'` succeeded -- billing bypass confirmed live (e.g., 75 KWD 1:1 Complete → 12 KWD Team Plan). Same probe successfully changed `status` to `cancelled` and wiped `coach_id` to NULL.
- **`assign_program_to_client` body contains zero auth checks.** `pg_get_functiondef` dump shows no `RAISE` / `IF auth.uid()` / admin gate; the function is SECURITY DEFINER + GRANT EXECUTE TO authenticated, so any authed user can call with arbitrary `p_client_id` + `p_template_id` and the function will INSERT into `client_programs` on their behalf.

### Verified-good (live probes)

- **`coach_teams` policy mix is correct on roles.** `coach_teams_read_active` is `TO authenticated` (per Block 8 P1-5 tightening), `"Anyone can read public active teams"` is the public anon path bounded by `is_active = true AND is_public = true`. The two coexist intentionally -- the second is the public /teams browser path. (Note: useTeams still uses neither RPC and N+1s through anon-broken `get_coach_for_client`; see B7-N1 / B7-N8.)
- **`coach_teams_coach_update` has WITH CHECK.** Cannot transfer team ownership: `WITH CHECK (auth.uid() = coach_id)` prevents the new row's coach_id from being changed to another user. (`muscle_program_templates` lacks the equivalent -- see B7-N16.)
- **`session_bookings` / `coach_time_slots` / `direct_calendar_sessions` UPDATE policies work for the head coach** in the normal team path because `assign_coach_atomic` Branch A sets `subscriptions.coach_id = team_coach.user_id` AND `session_bookings.coach_id` defaults to the time-slot owner (also the head coach). The B6-N7 "team-coach RLS gap" carry-over is mostly theoretical given the single-coach-per-team data model -- it would bite only if/when the team plan grows multi-coach (not on the launch roadmap). **Becomes a real gap when combined with B7-N2**: orphan subs (team_id set, coach_id NULL) lose the primary-coach path AND `direct_calendar_sessions`'s `is_care_team_member_for_client` doesn't cover a team-only relationship -- so head coach sees the team member's profile but cannot create / update direct sessions for them. Folded into B7-N2's fix; not split out.

### P0 -- must ship before launch

- **B7-N1 [P0]** `src/hooks/useTeams.ts:73-75` -- anon + non-member calls to `get_coach_for_client(team.coach_id)` return NULL. /teams page shows "Coach" as the coach name for every team to every visitor except current members. Live-verified. **Fix:** new SECURITY DEFINER RPC `list_public_teams_for_browser()` callable by `anon` + `authenticated` that bundles team rows + coach name + member count in one round-trip, filtered to `is_active = true AND is_public = true`. Mirrors `list_active_teams_for_client()` shape. Replaces the `useTeams.ts` Promise.all loop. Closes B7-N8 simultaneously.
- **B7-N2 [P0]** ✅ FIXED 2026-05-31 — `join_team(p_subscription_id, p_team_id)` SECURITY DEFINER RPC (migration `20260531140000` + grant `20260531140010`) now syncs `coach_id = coach_teams.coach_id` alongside `team_id` + `last_team_change_at` + `needs_coach_assignment=false`, atomically under `FOR UPDATE` row locks. One-shot backfill (`20260531140200`) synced all existing orphans; live-verified `352de8b3-…` now has `coach_id = 92605b68-…` and **0 orphans remain** platform-wide. FE (`ChooseTeamPrompt`, `ChangeTeamDialog`) swapped to the RPC. NOTE: `assign_coach_atomic` Branch A (migration `20260523084526`, Block 8 rebuild) **already** syncs `coach_id` from `coach_teams.coach_id` on the team-selected signup path — the only live write-path gap was the two FE components + legacy/backfill rows, so `assign_coach_atomic` was left unchanged. `src/components/client/ChooseTeamPrompt.tsx:95-99`, `src/components/client/ChangeTeamDialog.tsx:118-126`, plus `assign_coach_atomic` Branch A2 (no `p_selected_team_id`) -- the UPDATE only sets `team_id`, never `coach_id`. Result: legacy migration backfill rows (per `20260212160000`) + needs_coach_assignment=true onboarding completions land with `team_id` set + `coach_id` NULL (or stale Alice when client moved A→B). Head coach loses every `is_primary_coach_for_user`-gated capability. Real prod row: 352de8b3-…. **Fix:** route team-join + team-change through a SECURITY DEFINER RPC `join_team(p_subscription_id, p_team_id)` that (a) locks the destination team's csl row, (b) re-checks capacity, (c) updates `subscriptions.team_id` AND `subscriptions.coach_id = coach_teams.coach_id` AND `subscriptions.last_team_change_at`, (d) enforces the once-per-billing-cycle rule server-side. Backfill: one-shot UPDATE on existing rows with `team_id IS NOT NULL AND coach_id IS DISTINCT FROM (SELECT coach_id FROM coach_teams)` to sync.
- **B7-N3 [P0]** ✅ FIXED 2026-05-31 — migration `20260531130000_block7_n3_assign_program_auth_gate.sql` (`CREATE OR REPLACE`, verbatim prod body + gate; live-verified: admin & primary-coach PASS, non-coach & wrong-coach raise `42501`). NOTE: the gate intentionally rejects the B7-N2 orphan sub `352de8b3-…` (coach_id NULL → head coach is not primary); fix that orphan via cluster (3)'s `join_team` RPC + backfill. `supabase/migrations/20260319100000_fix_assign_program_rpc.sql` -- `assign_program_to_client` SECURITY DEFINER + GRANT EXECUTE TO authenticated has **no authorization guard** in its body. Any authed user can call with arbitrary `p_client_id` + `p_template_id` to overwrite a victim's `client_programs`. Live-verified body dump shows zero auth checks. **Fix:** add at top of function: `IF NOT (auth.uid() = p_coach_id AND public.is_primary_coach_for_user(p_coach_id, p_client_id)) AND NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF;`. Team fan-out from AssignTeamProgramDialog runs as the head coach so still passes. Defense-in-depth even if FE callsites already gate -- same rationale as Block 8's RPC authz layer.
- **B7-N4 [P0]** ✅ FIXED 2026-05-31 — `enforce_subscription_column_whitelist` BEFORE UPDATE trigger (migration `20260531140100`). Implemented as **deny-by-default** rather than an enumerated reject-list: column-by-column review found that a client should never directly write ANY `subscriptions` column (every mutation has an authorized server path — `join_team` RPC, the `cancel-subscription`/`verify-payment`/`tap-webhook` service-role edge fns, or admin/coach tooling), so the trigger rejects ALL client-as-self direct writes and auto-protects future columns. Bypass order is critical: `auth.uid() IS NULL` (service_role/migrations — verified `is_admin(NULL)=false`, so without this the billing edge fns + the backfill would have been blocked) → admin → `app.in_join_team` flag → caller≠OLD.user_id. Live-verified: the impersonated real client's `service_id` downgrade, `status='cancelled'`, and `coach_id=NULL` UPDATEs all now raise `42501`. RLS hole on `subscriptions` lets clients column-write their own row arbitrarily. Policy `"Block unauthorized subscription access"` is `FOR ALL` with USING `auth.uid() = user_id OR admin OR (coach AND coach_id = auth.uid())` and **no WITH CHECK whitelist** (defaults to USING expression). For a client UPDATE, the only constraint is the new row's `user_id` must equal `auth.uid()` -- every other column is writable. Live-verified: real client UPDATEs of `service_id` to `team_plan` (downgrade attack), `status` to `cancelled`, `coach_id` to NULL all succeeded. **Fix:** mirror B5-N5 -- add BEFORE UPDATE trigger `enforce_subscription_column_whitelist` that, when `auth.uid() = OLD.user_id AND NOT is_admin(auth.uid())`, throws if any of `{service_id, coach_id, status, team_id (without going through join_team RPC), needs_coach_assignment, coach_assignment_method, weekly_session_limit, session_duration_minutes, session_booking_enabled, started_at, next_billing_date, ...}` changed. Only `last_team_change_at` should remain writable by the user (and even that should be routed through the new `join_team` RPC). Combined with B7-N2's RPC route, the FE's direct `subscriptions.update(...)` calls in ChooseTeamPrompt + ChangeTeamDialog can be deleted.
- **B7-N5 [P0]** ✅ FIXED 2026-05-31 — the `join_team` RPC enforces a 28-day (`~1 billing cycle`) gap server-side: re-calling within the window raises `P0001` "Team change too soon" (skipped for admin). Live-verified. FE `ChangeTeamDialog` additionally computes `last_team_change_at + 28d` and disables the change button + shows the next-allowed date inline (UX only; RPC is authoritative). `src/components/client/ChangeTeamDialog.tsx:114-127` -- "once per billing cycle" enforcement is dialog copy only. `handleChangeTeam` writes `last_team_change_at = now()` without checking `OLD.last_team_change_at >= subscription.next_billing_date - interval '1 month'`. Combined with B7-N4, client can re-call the UPDATE unlimited times. **Fix:** the `join_team` RPC from B7-N2 enforces the gap server-side: `IF v_last_change > now() - interval '<billing-period>' AND NOT is_admin(auth.uid()) THEN RAISE 'Team change too soon'; END IF;`.

### P1 -- ship before launch, not blocking

- **B7-N6 [P1]** ✅ FIXED 2026-05-31 — the `join_team` RPC locks the destination `coach_teams` row `FOR UPDATE` (serializing concurrent joins) and re-checks `COUNT(active+pending members) >= max_members` under that lock; over-capacity joins raise `P0001` "Team is full". Live-verified the capacity-full rejection deterministically (true concurrency is guaranteed by the row lock). `ChooseTeamPrompt.handleJoinTeam` + `ChangeTeamDialog.handleChangeTeam` -- client-side max_members check is racy. Two concurrent joins to a 29/30 team both pass and the team ends at 31. Fold into the B7-N2 `join_team` RPC by FOR UPDATE locking the team's `coach_service_limits` row (same pattern as `assign_coach_atomic`).
- **B7-N7 [P1]** `src/components/coach/teams/AssignTeamProgramDialog.tsx:148-189` -- fan-out is N parallel `assign_program_to_client` calls + a single team pointer UPDATE that runs ONLY if successCount > 0. Three failure modes:
  (a) Partial team-program state (some members on new program, some on old) if any individual call fails.
  (b) Re-running the dialog to retry the failed members re-runs the fan-out for everyone, duplicating `client_programs` for the already-succeeded members (assign_program_to_client has no idempotency check -- see B7-N19).
  (c) The team pointer update has its own error-toast separate from the per-member fan-out, so coach sees "Program assigned" plus "Team pointer update failed" together with no clear next-step. **Fix:** new SECURITY DEFINER RPC `assign_team_program_atomic(p_team_id, p_template_id, p_start_date)` that loops members + assignments inside one transaction with idempotency on `(subscription_id, source_template_id, start_date)`. Returns per-member success/failure rather than the FE driving the loop.
- **B7-N8 [P1]** `src/hooks/useTeams.ts:67-114` -- N+1 round-trips even on the public browser: one `get_coach_for_client` RPC + one `subscriptions` count per team. Already broken for anon (B7-N1). Fold into B7-N1's `list_public_teams_for_browser()` RPC. Authed-only callers (`TeamSelectionSection` with `publicOnly: false`) already have `list_active_teams_for_client()` -- migrate them to it too.
- **B7-N9 [P1]** ✅ FIXED 2026-05-31 — migration `20260531130100_block7_n9_convert_muscle_plan_auth_gate.sql` (`CREATE OR REPLACE`, verbatim prod body + gate; live-verified: coach-self & admin PASS, cross-coach & anon raise `42501`). `supabase/migrations/20260419100000_convert_rpc_v2_sessions.sql` -- `convert_muscle_plan_to_program_v2` SECURITY DEFINER + GRANT EXECUTE TO authenticated has no auth gate; accepts `p_coach_id` from client. A malicious authed user can create `program_templates` rows owned by another coach. Lower blast radius than B7-N3 (no PII / client data is written) but same defense-in-depth pattern. **Fix:** prepend `IF auth.uid() != p_coach_id AND NOT is_admin(auth.uid()) THEN RAISE 'Not authorised'; END IF;`.
- **B7-N10 [P1]** `coach_time_slots.coach_id` + `session_bookings.coach_id` + `session_bookings.client_id` REFERENCE `public.profiles(id)` per migration `20260112085741`. `profiles` is a VIEW (per CLAUDE.md), and Postgres FKs on views are not allowed -- meaning either the FK silently references `profiles_legacy` (no longer the source of truth for active rows) or the constraint was reset later. Need verification + alignment to `auth.users(id)` like every other coach/client FK in the codebase. Same gap class as the `profiles_legacy` FK on `subscriptions_user_id_fkey` documented in CLAUDE.md.
- **B7-N11 [P1]** `src/components/coach/teams/CoachTeamsPage.tsx:29` + `CreateTeamDialog.tsx:35` -- `MAX_TEAMS = 3` is client-side only. A head coach can bypass by direct `coach_teams.insert(...)` via the JS console. **Fix:** BEFORE INSERT trigger `enforce_team_count_limit` on `coach_teams` that rejects if `(SELECT COUNT(*) FROM coach_teams WHERE coach_id = NEW.coach_id AND is_active = true) >= 3`.
- **B7-N12 [P1]** `src/components/coach/teams/TeamDetailView.tsx:105-127` -- soft-delete (`is_active = false`) leaves stale `subscriptions.team_id` references on active member subs. Members are stranded on an inactive team; team browser filters them out, coach UI hides them, but `is_primary_coach_for_user` still holds (coach_id still set). Members keep paying but see no team program updates. **Fix:** either (a) `RESTRICT` deletion when active subs exist + show "X active members must move first"; or (b) move all member subs to `team_id = NULL` + flag `needs_team_choice = true` on each + email them via existing care-team digest path.

### P2 -- post-launch cleanup

- **B7-N13 [P2]** `src/hooks/useTeams.ts:118-119`, `src/components/client/ChooseTeamPrompt.tsx:79`, `src/components/client/ChangeTeamDialog.tsx:92,137`, `src/pages/TeamsPage.tsx:85`, `src/components/TeamPlanSettings.tsx:52,89` -- catch into `console.error` instead of `captureException` from `@/lib/errorLogging`. Cross-block pattern; same as Block 5 silent-mutation sweep follow-up.
- **B7-N14 [P2]** `src/pages/TeamsPage.tsx:68-81` -- anon waitlist insert has no rate limit. Unique key `(team_id, email)` prevents straight dupes but disposable-email spam is free. Probably acceptable pre-launch; flag for post-launch if real abuse appears.
- **B7-N15 [P2]** `src/pages/TeamsPage.tsx:166-202` -- inline waitlist email-capture modal is a hand-rolled `<div className="fixed inset-0 …">` with no focus trap, no Escape handler, no `aria-modal`, no `role="dialog"`. **Fix:** swap for the `Dialog` primitive used elsewhere.
- **B7-N16 [P2]** `supabase/migrations/20260212120000_muscle_program_templates.sql:38-40` + `20260219100000_fix_disk_io_performance.sql:116-119` -- `coach_update_own_templates` UPDATE policy has `USING (coach_id = auth.uid())` but **no WITH CHECK**. A coach can UPDATE their own template's `coach_id` to another user, silently transferring ownership. Same pattern that `coach_teams_coach_update` got right. **Fix:** `ALTER POLICY ... WITH CHECK (coach_id = auth.uid())`. Same audit pass should also re-check every UPDATE policy missing a WITH CHECK in this migration.
- **B7-N17 [P2]** `src/components/TeamPlanSettings.tsx:70` -- `supabase.auth.getUser()` no 8s timeout. Same GoTrueClient-deadlock class as B5-N2 / B4-N11 / B3-N3..N10. Hits every admin save of team-plan registration settings.
- **B7-N18 [P2]** `src/components/coach/teams/CreateTeamDialog.tsx:110-132` + `src/components/coach/teams/TeamDetailView.tsx:109-117` + `src/components/coach/teams/AssignTeamProgramDialog.tsx:181-189` -- UPDATEs destructure `{ error }` and throw, but no rows-affected check. If RLS denies silently (HTTP 200, 0 rows, no error), coach sees success toast. Same class as B6-N3 and the completeWorkout silent failure pattern that shipped as PR #117. **Fix:** add `.select('id')` and verify `data.length > 0` before the success toast.
- **B7-N19 [P2]** `assign_program_to_client` body -- creates a new `client_programs` row every invocation with no idempotency check on `(subscription_id, source_template_id, start_date)`. AssignTeamProgramDialog retry-loops + ChangeTeamDialog repeat-clicks will duplicate. Becomes critical when fixing B7-N7 if the new atomic RPC needs to be re-runnable. **Fix:** check for an existing matching `client_programs` row at the top of the function; UPDATE its `start_date` or return its id instead of inserting.

### Recommended ship order

1. **B7-N1 + B7-N8** -- one migration (new `list_public_teams_for_browser()` RPC) + `useTeams.ts` rewrite. Closes the visible "Coach" bug on /teams and the N+1.
2. **B7-N3 + B7-N9** -- two-line `IF auth.uid() ...` add to both SECURITY DEFINER RPCs. Defense-in-depth; no FE changes.
3. ✅ SHIPPED 2026-05-31 — **B7-N2 + B7-N4 + B7-N5 + B7-N6** -- migrations `20260531140000` (join_team fn) + `…140010` (grant) + `…140100` (whitelist trigger) + `…140200` (orphan backfill) + FE swap in ChooseTeamPrompt/ChangeTeamDialog. All 7 live probes pass (see PR). Whitelist implemented as deny-by-default. Browser smoke (real client auth) still pending as a manual check before launch.
4. **B7-N7 + B7-N19** -- `assign_team_program_atomic` RPC + idempotency on `assign_program_to_client`. Touches the same fan-out logic.
5. **B7-N10 + B7-N12** -- migration: realign FK targets to `auth.users(id)` + add team-delete behaviour (RESTRICT or member move-out). Touches coach_time_slots, session_bookings, direct_calendar_sessions schema.
6. **B7-N11** -- team-count trigger.
7. **B7-N13..N18** -- bundle into the cross-block silent-mutation / a11y / auth-timeout sweep that lands after Blocks 9 + 10 audits per the audit-master plan.

### Cross-block themes uncovered

- **Subscription column-write hole (B7-N4) is the highest-priority Block-7 finding.** It mirrors B5-N5 (message column whitelist) but for the table that gates billing, role assignment, and access boundaries. Worth a one-time pass over every "self can SELECT/UPDATE own row" RLS policy in the schema for the same defaulted-WITH-CHECK pattern -- `pg_policy WHERE polcmd IN ('w','*') AND polwithcheck IS NULL` is a one-shot query that should be empty.
- **SECURITY DEFINER RPCs without auth gates (B7-N3, B7-N9)** is a pattern -- worth grep across `supabase/migrations/*` for `SECURITY DEFINER` blocks that take a `p_*_id uuid` parameter representing the caller's identity without verifying `auth.uid() = p_*_id` or admin. Likely more than these two.
- **Team flows assume single coach per team.** Multiple policies + assumptions (e.g., `assign_coach_atomic` Branch A picking `coach_teams.coach_id` as the universal subscription coach_id, session_bookings.coach_id assumed identical to time-slot-owner) collapse if the team data model ever grows to multi-coach. Not a launch blocker -- document this constraint somewhere durable (probably CLAUDE.md § "Teams").

---

## Blocks 9-10 -- NOT STARTED

9. **Testimonials** -- small surface, low risk.
10. **Public marketing site** -- branding, Lighthouse, Arabic coverage, waitlist → signup cutover plan.

Block 6 audit complete -- findings live in `memory/project_igu_prelaunch_audit_2026_05.md` (P0s B6-N1 + N2 + N8 + N12 + N4-PathB shipped; N3 / N5 / N6 / N7 / N9 / N10 / N15 still open per the recommended ship order in that memory).

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
   - **Block 4 (Admin tooling) — audit complete 2026-05-23, no fixes yet.** Role isolation at the gate ✅ verified intact (admin gate uses strict `userRoles.includes('admin')`, rejects all 5 other roles). 10 P0s, 7 P1s, 5 P2s logged. **Highest-priority cluster:** B4-N1..N3 silent profile/payment/audit mutations in `PaymentOverride.tsx` (one admin action can wedge a client). **Next:** B4-N4..N7 (more silent mutations), B4-N8..N10 (banned nested FK joins on subscriptions in 3 admin dashboards). See "Block 4 -- Admin tooling findings" section.
   - **Block 5 (Messaging)** is the next recommended fresh audit. RLS surface area + realtime channel auth.
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
