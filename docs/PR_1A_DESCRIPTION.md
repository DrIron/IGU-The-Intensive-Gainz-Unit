# Phase 1A — Coach column-ownership refactor (migrations only)

Pure SQL. No code changes. Six migrations under `supabase/migrations/` with
the `20260503120000` … `20260503120500` prefix.

Plan reference: `docs/COACH_TABLES_REFACTOR_PLAN.md` § 0 (Phase 0 audit
results) and § 3 (Migration plan, Phase 1A).

---

## What this PR does

| # | File | Purpose |
|---|---|---|
| 1 | `20260503120000_coach_refactor_audit_table.sql` | Creates `coach_refactor_conflicts` (admin-only RLS). Captures rows where `coaches.X` and `coaches_public.X` both have non-empty values that differ. |
| 2 | `20260503120100_coach_refactor_seed_missing_public.sql` | Seeds `coaches_public` rows for any `coaches.user_id` without one. Fixes the seed bug for coaches created post-migration `20260121190914`. |
| 3 | `20260503120200_coach_refactor_backfill_pattern_a.sql` | (a) detects + logs conflicts on 10 duplicate columns; (b) fills empty `coaches_public` cells from `coaches`. Does NOT auto-resolve conflicts — admin reviews. |
| 4 | `20260503120300_coach_refactor_backfill_gender.sql` | Copies `coaches.gender` → `coaches_private.gender` where the private side is NULL. |
| 5 | `20260503120400_coach_refactor_upsert_coach_full_rpc.sql` | Creates the `upsert_coach_full(p_user_id, p_public, p_private, p_admin)` SECURITY DEFINER RPC (D3). Service-role bypass + admin gate inside. The single funnel for admin coach writes that 1B/1C will route through. |
| 5b | `20260503120500_coach_refactor_check_training_completion_fix.sql` | `CREATE OR REPLACE FUNCTION check_training_completion(...)` — drops the redundant `UPDATE coaches_public SET status` line. Status canonical home is `coaches`. |

All six migrations are **idempotent** (re-running is a no-op).

---

## What this PR does NOT do

- **No column drops.** `coaches.first_name` etc. and `coaches_public.status` etc. all still exist after this PR.
- **No code changes.** No edge function or frontend modifications. Those land in 1B and 1C.
- **No view rebuilds.** `coaches_full`, `coaches_directory`, `coaches_directory_admin` unchanged.
- **No FK changes.** `coaches_private.coach_public_id` still exists; D4 lands in Phase 3.

---

## Stale-read window callout (resolved in 1C)

Migration 5b removes the second UPDATE in `check_training_completion`. After 1A merges, **`coaches_public.status` no longer updates when a coach finishes training-content completion**. Reads from `coaches_public.status` therefore get a stale view if a coach transitions from `'training'` → `'active'` between 1A and 1C ship.

**Single read site affected:** `src/components/admin/AdminBillingManager.tsx:370` —
```ts
const { data } = await supabase
  .from('coaches_public')
  .select('user_id, status')
  .eq('user_id', adminCoachUserId)
  .maybeSingle();
if (publicRow?.status === 'approved') { … }
```

(Verified by `grep -n 'coaches_public.status\|coaches_public[^_]*status' src/`. No other callers.)

**Risk assessment:** acceptable — Hasan confirmed IGU has 1 prod coach past training. The stale read is only observable if a NEW coach completes training during the same-day 1A → 1B → 1C window AND someone visits AdminBillingManager during that interval AND tries to set the affected client to payment-exempt. Probability ≈ 0.

**Mitigation:** target same-day ship of 1A → 1B → 1C. 1C migrates this read site to `coaches.status`, which is the canonical home and continues to update correctly.

---

## Manual application path

This project pushes to remote Supabase via `supabase db push`. Validate locally first:

```bash
# 1. Verify migration filenames sort correctly
ls supabase/migrations/ | grep coach_refactor | sort
# Expect:
#   20260503120000_coach_refactor_audit_table.sql
#   20260503120100_coach_refactor_seed_missing_public.sql
#   20260503120200_coach_refactor_backfill_pattern_a.sql
#   20260503120300_coach_refactor_backfill_gender.sql
#   20260503120400_coach_refactor_upsert_coach_full_rpc.sql
#   20260503120500_coach_refactor_check_training_completion_fix.sql

# 2. Dry-run via supabase CLI (optional — applies to local dev DB if set up)
supabase db reset    # nukes local; only do this in dev
supabase db push --dry-run

# 3. Apply to remote
supabase db push
```

If `supabase db push` is not available in the CI/sandbox, apply each migration manually via `psql` connected to the prod DB (or via the Supabase dashboard SQL editor) in the order listed above.

---

## Pre-merge verification checklist

Run on a Supabase branch DB or in a transaction with `ROLLBACK`:

### Migration application

- [ ] All six migrations apply cleanly (no syntax / FK errors).
- [ ] Re-running the same migrations is a no-op (verify by applying twice).
- [ ] `coach_refactor_conflicts` table exists with admin-only RLS.

### Backfill correctness

- [ ] `SELECT COUNT(*) FROM coaches c LEFT JOIN coaches_public cp ON cp.user_id = c.user_id WHERE cp.user_id IS NULL` returns `0`.
- [ ] `SELECT COUNT(*) FROM coaches c LEFT JOIN coaches_private cpr ON cpr.user_id = c.user_id WHERE cpr.user_id IS NULL` returns `0` OR each row is documented as missing-by-design.
- [ ] `SELECT * FROM coach_refactor_conflicts WHERE resolved_at IS NULL` returns `0` rows after admin manually resolves any flagged conflicts.

### Drift query (§ 9)

- [ ] § 9 pre-Phase-3 drift query returns 0 rows after backfill + admin resolution.

### RPC

- [ ] `upsert_coach_full(...)` callable as service_role → succeeds.
- [ ] `upsert_coach_full(...)` callable as authenticated admin → succeeds.
- [ ] `upsert_coach_full(...)` callable as authenticated non-admin → fails with `permission denied: admin role required` (errcode `42501`).
- [ ] Calling on an existing `user_id` updates without throwing (idempotency).
- [ ] Calling with an empty `p_private` skips coaches_private writes and doesn't crash.

### check_training_completion

- [ ] Function compiles (the `CREATE OR REPLACE` succeeded).
- [ ] Calling `check_training_completion(<test_coach_user_id>)` returns the same JSONB shape (`required_count`, `completed_count`, `all_complete`).
- [ ] If `all_complete = true`, only `coaches.status` is updated (verify `coaches_public.status` is unchanged).

### Stale-read window callout

- [ ] PR description includes the AdminBillingManager.tsx:370 callout (this section).
- [ ] Open 1B and 1C PRs to ship same-day; do not delay 1C past the day 1A merges.

---

## Rollback plan

If the migrations apply cleanly but cause unexpected behavior in prod:

```sql
-- Rollback order: reverse of apply
DROP FUNCTION IF EXISTS public.upsert_coach_full(UUID, JSONB, JSONB, JSONB);
-- (No need to revert check_training_completion; it's now safer than before)
DROP TABLE IF EXISTS public.coach_refactor_conflicts;
-- Backfills (migrations 2, 3, 4) are NOT trivially reversible:
--   - migration 2 inserted rows into coaches_public; track them via
--     `WHERE created_at >= <1A apply time>` and DELETE if needed.
--   - migrations 3 + 4 only filled empty cells, so rolling back means
--     re-NULLing those specific cells. Easier to just leave as-is.
```

In practice: the audit table and RPC are pure additions; dropping them is safe. The backfills are forward-only.

---

## Reviewer notes

- D3 originally said "all three admin write paths" route through `upsert_coach_full`. Phase 0 audit confirmed `submit-onboarding` writes only `coaches.last_assigned_at` (single column, stays direct) — so it's TWO admin write paths, not three. 1B redirects only `create-coach-account`; 1C handles `CoachManagement.tsx`. See plan § Revision note.

- The RPC body mirrors profile fields into BOTH `coaches` AND `coaches_public` during the soak window. This is intentional: `coaches.first_name` is still NOT NULL pre-Phase-3, so we can't stop writing it. Phase 3 migration 8 rewrites the RPC body to drop the mirror writes in the same transaction that drops the columns.

- The RPC body sets `coaches_private.coach_public_id = v_coach_id` (where `v_coach_id` is the freshly-inserted `coaches.id`). Same atomicity rule: Phase 3 migration 9 rewrites the RPC body to stop populating that column in the same transaction that drops it.

- `check_training_completion` is a SECURITY DEFINER function called from the coach-training-content completion flow. Triple-check the test coach can still complete training.
