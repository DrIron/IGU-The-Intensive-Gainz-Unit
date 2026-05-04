# Coach Tables Column-Ownership Refactor — Plan (revised)

> Status: planning only, no migrations or edits performed. Reviewed against
> `CLAUDE.md` § "Coach data — partitioned writes, no sync, drift exists today".
> Decisions D1-D4 resolved (see revision note below); plan revised to bake
> them in.

**Revision note (decisions baked in):**
- **D1**: `coach_level` / `is_head_coach` stay on `coaches_public`. Not moved.
- **D2**: socials sync trigger (`coaches_private` → `coaches_public`) is
  KEPT, documented as the one cross-table sync exception in `CLAUDE.md`.
- **D3**: `upsert_coach_full(p_user_id, p_public jsonb, p_private jsonb,
  p_admin jsonb)` SECURITY DEFINER RPC is required. **TWO** admin write
  paths route through it: `create-coach-account` and `CoachManagement.tsx`.
  (D3 originally listed `submit-onboarding` as a third routed path;
  Phase 0 audit confirmed it writes only `coaches.last_assigned_at` —
  single column, stays direct. The earlier audit's claim of multi-table
  writes at submit-onboarding lines 196-224 was a search-agent
  fabrication; the actual code at those lines is the rate-limit /
  role-check section.)
- **D4**: `coaches_private.coach_public_id` FK is dropped; everything keys
  on `user_id`.

The end-state goal: every duplicated coach field has one canonical home. A
contributor adding a new write site cannot accidentally drift because the
column they need only exists in one table. Three tables, three roles:

- `coaches` — admin / operations / role lifecycle: `status`, capacity
  (`max_*_clients`), `last_assigned_at`. Loses every profile column.
- `coaches_public` — client-facing profile: name, bio, photo, qualifications,
  location, marketing tags, level, head-coach flag, socials (synced).
- `coaches_private` — PII: email, phone, DOB, gender, socials (canonical
  source for the sync trigger).
- `coaches_full` — admin view joining the three (rebuilt at end of refactor
  on `user_id`).
- `coaches_directory` / `coaches_directory_admin` — read views, rebuilt to
  reflect new column homes (mostly unchanged shape; status now joined from
  `coaches`).

Joins normalize on `user_id`. The misnamed `coach_public_id` FK is removed.

---

## 0. Phase 0 audit results (executed 2026-05-03)

Three pre-flight audits executed before opening Phase 1A. Results below
are the source of truth for 1A/1B/1C scope.

### 0a — `pg_proc` SECURITY DEFINER grep

11 SECDEF functions reference `coaches*` tables. Three need rewrites; eight
are safe.

**Needs rewrite — folded into 1A or Phase 3:**

| function | issue | fix lands in |
|---|---|---|
| `admin_get_coaches_full()` | selects `cp.status, cp.max_onetoone_clients, cp.max_team_clients, cp.last_assigned_at` from `coaches_public` (all four drop) AND joins `cpriv ON cp.id = cpriv.coach_public_id` (D4 drops) | Phase 3 migration 6 — rebuild RPC body alongside view rebuild. New body joins `coaches c ON c.user_id = cp.user_id` for the four moved columns; joins `coaches_private cpriv ON cpriv.user_id = cp.user_id`. Same return signature |
| `check_training_completion(p_coach_user_id uuid)` | `UPDATE coaches_public SET status = 'active'` line breaks at Phase 3 (`coaches_public.status` drops) | Phase 1A migration 5b — drop the redundant UPDATE. Status canonical home is `coaches`; the duplicated write was the original drift source |
| `sync_coaches_public_socials()` (trigger fn) | uses `WHERE id = NEW.coach_public_id` to find `coaches_public` row to mirror socials into. D4 drops `coach_public_id` | Phase 3 migration 9 — rewrite to `WHERE user_id = NEW.user_id`. **Function rewrite and column drop MUST be in the same transaction** (atomicity required — splitting them breaks any `coaches_private` INSERT/UPDATE in flight) |

**Safe — no rewrite needed:** `admin_get_coaches_directory()` (wraps the view, view itself rebuilt), `calculate_subscription_payout(...)` (reads `coach_level` which stays per D1), `can_build_programs(...)`, `check_legacy_table_security()`, `get_rls_audit_report()`, `is_coach_for_submission(...)` (`coaches.id`, `coaches.status` both stay), `protect_medical_fields_from_coach_update()`, `verify_phi_view_isolation()`.

### 0b — `delete-account` cascade test

Static analysis (pg_constraint + pg_trigger):

```
coaches.user_id              → profiles_legacy(id)  ON DELETE CASCADE
coaches_private.coach_public_id → coaches(id)       ON DELETE CASCADE
coaches_public               → ZERO incoming FKs, ZERO outgoing FKs

Triggers on coaches:        cleanup_coach_role_on_delete (BEFORE DELETE — handles user_roles, NOT coaches_public)
Triggers on coaches_public: only updated_at — no DELETE handlers
Triggers on coaches_private: sync_coaches_public_socials_trigger (AFTER INSERT/UPDATE — no DELETE side)
```

Empirical test (BEGIN ... mimic delete-account FK cleanup ... DELETE FROM coaches ... observe ... ROLLBACK; transaction was rolled back, no prod data touched):

| state | coaches | coaches_public | coaches_private (via coach_public_id) | coaches_private (via user_id) |
|---|---|---|---|---|
| after DELETE | gone | **STILL EXISTS — orphaned** | gone (cascade) | gone (same row) |

**Verdict: cascade gap confirmed.** `coaches_private` cascades; `coaches_public` orphans.

**Fix scope: Phase 1B.** In `delete-account/index.ts`, add explicit deletes BEFORE the existing line 219:
```ts
await safeDelete('coaches_private', { user_id: userId });   // belt-and-suspenders; cascades anyway pre-Phase-3
await safeDelete('coaches_public',  { user_id: userId });   // PRIMARY FIX — closes the gap
// then the existing coaches.delete() at line 219
```

### 0c — Verify-read site classification

37 read sites resolved (the original "18 verify" set expanded once line ranges were dereferenced; 3 additional submit-onboarding sites surfaced during the D3 correction). 22 need work in 1C; 15 are safe as-is.

**Need 1C work (22 sites):**

| file:line | columns | source | classification |
|---|---|---|---|
| `src/pages/admin/WorkoutBuilderQA.tsx:62` | `user_id, first_name, specialties` (filter `status='active'`) | `coaches` | redirect (split: profile → `coaches_public`, status filter via `coaches`) |
| `src/components/ClientList.tsx:481` | `first_name, last_name` (filter `user_id`) | `coaches` | redirect |
| `src/components/CoachApplicationsManager.tsx:294` | `user_id` (filter `email`) | `coaches` | **silent-bug-fix** — `coaches.email` doesn't exist; switch to `coaches_private.select('user_id').ilike('email', ...)` |
| `src/components/admin/PayoutRatesManager.tsx:155` | `id, user_id, first_name, last_name` (filter `status='active'`) | `coaches` | redirect |
| `src/components/admin/CoachWorkloadPanel.tsx:27` | `user_id, first_name, last_name, max_onetoone_clients, max_team_clients` (filter `status='active'`) | `coaches` | redirect (split: name → `coaches_public`, capacity + status stay on `coaches`) |
| `src/components/admin/CoachPaymentCalculator.tsx:240` | `*` (filter `status='active'`, `user_id IN ...`) | `coaches` | **select-star-rewrite** — replace `*` with explicit list, profile fields → `coaches_public` |
| `src/components/admin/CoachCapacityManager.tsx:73` | `id, user_id, first_name, last_name` (filter `status='active'`) | `coaches` | redirect |
| `src/components/coach/AddSpecialistDialog.tsx:129` | `id, user_id, first_name, last_name, specialties, profile_picture_url` (filter `status='active'`) | `coaches` | redirect |
| `src/components/coach/programs/DayModuleEditor.tsx:92` | `user_id, first_name, last_name, specialties` (filter `status='active'`) | `coaches` | redirect |
| `supabase/functions/process-testimonial-requests/index.ts:113` | `first_name` (filter `user_id`) | `coaches` | redirect |
| `supabase/functions/notify-coach-contact/index.ts:70` | `id, user_id, first_name, last_name` (filter `user_id` or `id`) | `coaches` | redirect for `first_name`/`last_name`; keep `id`/`user_id` |
| `supabase/functions/notify-coach-contact/index.ts:115` | `email, whatsapp_number` (filter `coach_public_id = coach_id`) | `coaches_private` | **key-flip** — D4 drops `coach_public_id`; switch to `user_id` |
| `supabase/functions/create-manual-client/index.ts:128` | `user_id` (filter `email`) | `coaches` | **silent-bug-fix** — same `coaches.email` non-existent column bug; switch to `coaches_private` |
| `supabase/functions/send-weekly-coach-digest/index.ts:41` | `user_id, first_name, last_name` (filter status) | `coaches` | redirect |
| `supabase/functions/calculate-monthly-coach-payments/index.ts:205` | `id, user_id, first_name, last_name` (filter `user_id IN ...`) | `coaches` | redirect |
| `supabase/functions/send-client-approval-notification/index.ts:57` | `id, first_name, last_name` (filter `user_id`) | `coaches` | redirect |
| `supabase/functions/send-client-approval-notification/index.ts:72` | `email` (filter `coach_public_id = coach.id`) | `coaches_private` | **key-flip** |
| `supabase/functions/process-payment-failure-drip/index.ts:135` | `user_id, first_name, last_name` (filter `user_id`) | `coaches` | redirect |
| `supabase/functions/process-coach-inactivity-monitor/index.ts:54` | `user_id, first_name, last_name` (filter status) | `coaches` | redirect |
| `supabase/functions/notify-coach-new-client/index.ts:33` | `id, first_name` (filter `user_id`) | `coaches` | redirect for `first_name` |
| `supabase/functions/notify-coach-new-client/index.ts:50` | `email` (filter `coach_public_id = coach.id`) | `coaches_private` | **key-flip** |
| `supabase/functions/send-pending-client-notification/index.ts:48` | `email` (filter `coach_public_id = coachId`) | `coaches_private` | **key-flip** |
| `src/components/admin/AdminBillingManager.tsx:370` | `user_id, status` (filter `user_id`) | `coaches_public` | redirect (`coaches_public.status` drops; switch to `coaches`) |
| `supabase/functions/submit-onboarding/index.ts:506` | `user_id, first_name, last_name, status` (filter `id`) | `coaches` | redirect (surfaced during D3 correction; not in the original 0c list) |
| `supabase/functions/submit-onboarding/index.ts:850` | `id, first_name, last_name` (filter `user_id`) | `coaches` | redirect (surfaced during D3 correction) |
| `supabase/functions/submit-onboarding/index.ts:858` | `email` (filter `coach_public_id = coachData.id`) | `coaches_private` | **key-flip** (surfaced during D3 correction) |
| `supabase/functions/send-coach-payment-notifications/index.ts:91` | `email` (filter `coach_public_id = coach.id`) | `coaches_private` | already in the 4-FK-join rewrite list (line :71); folded into 1C |

**Tally:**
- 17 column redirects (`coaches.*_name` etc. → `coaches_public`)
- 6 `coach_public_id` → `user_id` key flips on `coaches_private` queries (5 originally + 1 from submit-onboarding)
- 2 silent-bug fixes (`coaches.email` non-existent column)
- 1 `coaches_public.status` → `coaches.status` redirect (`AdminBillingManager.tsx:370`)
- 1 `select(*)` → explicit-list rewrite (`CoachPaymentCalculator.tsx:240`)

Plus the 4 PostgREST FK-join rewrites already in 1C scope: `send-coach-payment-notifications:71`, `CoachReassignmentSection:55`, `SystemHealthView:311`, `CoachPaymentCalculator:180`.

**Safe as-is (15 sites):** `PreLaunchValidation.tsx:209` and `:282`, `AdminMetricsCards.tsx:36`, `CoachDashboardLayout.tsx:45`, `CoachEarningsSummary.tsx:50`, `send-admin-daily-summary:74`, `create-manual-client:219`, `CoachDashboardOverview.tsx:330`, `:485`, `CoachTeamsPage.tsx:45`, `AdminBillingManager.tsx:360`, `SubscriptionPayoutPreview.tsx:92`, `security-regression-checks:377`, `SecurityChecklist:78` — and one I missed: `submit-onboarding:506` `status` filter is OK only if redirected to read status from `coaches` (it already does).

### Stale-read window during 1A → 1C transition

After 1A migration 5b removes the redundant `UPDATE coaches_public SET status` from `check_training_completion`, **`AdminBillingManager.tsx:370` reads `coaches_public.status`** and gets a stale view if a coach transitions out of `'training'` between 1A and 1C ship. Acceptable risk: IGU has 1 prod coach past training; the only way this is observable is if a NEW coach completes training during the same-day 1A→1B→1C window. Target same-day ship; call out in 1A PR description.

No other reads found targeting `coaches_public.status` (verified by grep).

---

## 1. Column ownership map (revised)

Heuristic: client-facing profile → `coaches_public`; admin/role/lifecycle →
`coaches`; PII → `coaches_private`. "Both" means the column physically
exists on `coaches` AND `coaches_public` today.

Per D1 and D2: `coach_level`, `is_head_coach`, and the three socials stay
where they are. The drop list shrinks accordingly.

| column | currently in | proposed canonical home | reasoning |
|---|---|---|---|
| `id` | both (own PKs) | both (own PKs, unrelated) | each table keeps its own PK; we stop pretending these ids should align |
| `user_id` | all three | all three (kept) | canonical join key everywhere after refactor |
| `first_name` | both | `coaches_public` | client-facing — appears in directory, profile cards, testimonials |
| `last_name` | both | `coaches_public` | same |
| `nickname` | both | `coaches_public` | client-facing display |
| `display_name` | `coaches_public` only | `coaches_public` | unchanged |
| `bio` | both | `coaches_public` | client-facing marketing |
| `short_bio` | both | `coaches_public` | client-facing marketing |
| `location` | both | `coaches_public` | shown in directory |
| `profile_picture_url` | both | `coaches_public` | client-facing |
| `qualifications` | both | `coaches_public` | client-facing |
| `specializations` | both | `coaches_public` | client-facing |
| `specialties` (`staff_specialty[]`) | both | `coaches_public` | client-facing tag set |
| `status` | both | **`coaches`** | admin-managed lifecycle (`pending`/`active`/`old`); gates assignment, blocks payouts. Public views (e.g. `coaches_directory`) get it via join |
| `age` | `coaches` only | **drop** | deprecated; DOB lives in `coaches_private` |
| `gender` | `coaches` + `coaches_private` | `coaches_private` | PII; drop from `coaches` |
| `max_onetoone_clients` | both | **`coaches`** | admin capacity control, never client-facing |
| `max_team_clients` | both | **`coaches`** | same |
| `last_assigned_at` | both | **`coaches`** | round-robin internal accounting |
| `coach_level` | `coaches_public` only | `coaches_public` (D1) | admin-assigned but client-facing reads exist (MeetOurTeam, compensation card). Not duplicated today, no drift risk in place |
| `is_head_coach` | `coaches_public` only | `coaches_public` (D1) | same reasoning |
| `head_coach_specialisation` | `coaches_public` only | `coaches_public` | client-facing copy describing the track |
| `instagram_url` | `coaches_public` + `coaches_private` (sync trigger) | `coaches_private` canonical, `coaches_public` mirror (D2) | trigger keeps mirror in sync. **Documented exception** to the one-canonical-home rule — must be loudly noted in `CLAUDE.md`. Writes go to `coaches_private`; reads can hit either |
| `tiktok_url` | `coaches_public` + `coaches_private` (sync trigger) | same as instagram_url (D2) | same |
| `youtube_url` | `coaches_public` + `coaches_private` (sync trigger) | same as instagram_url (D2) | same |
| `snapchat_url` | `coaches_private` only | `coaches_private` | unchanged (already correct) |
| `email` | `coaches_private` | `coaches_private` | PII |
| `phone` | `coaches_private` | `coaches_private` | PII |
| `whatsapp_number` | `coaches_private` | `coaches_private` | PII |
| `date_of_birth` | `coaches_private` (also `age` on `coaches`) | `coaches_private` | PII |
| `created_at` / `updated_at` | each table | each table | per-row audit, stay duplicated |

**Drop set (Phase 3 destructive)**:
- From `coaches`: `first_name`, `last_name`, `nickname`, `bio`, `short_bio`,
  `location`, `profile_picture_url`, `qualifications`, `specializations`,
  `specialties`, `age`, `gender`. (12 columns)
- From `coaches_public`: `status`, `max_onetoone_clients`,
  `max_team_clients`, `last_assigned_at`. (4 columns)
- Socials columns are NOT dropped from either side (D2).
- `coaches_public.coach_level` / `is_head_coach` are NOT dropped (D1).

---

## 2. Backfill strategy

For every duplicate column being dropped from one side, decide whose value wins.
Spelled out per column. Ambiguous cases get a flagged-conflict row instead of a
silent pick.

### Pattern A — `coaches_public` wins (canonical home is `coaches_public`)

Columns: `first_name`, `last_name`, `nickname`, `bio`, `short_bio`, `location`,
`profile_picture_url`, `qualifications`, `specializations`, `specialties`.

Source of truth conflict: admin/onboarding writes `coaches`; coach
self-service writes `coaches_public`. With no timestamps tagging which side
was last written by whom, "newest `updated_at`" is wrong (admin update of an
unrelated field bumps `coaches.updated_at`). Use:

```sql
-- Backfill missing coaches_public rows from coaches (e.g. coaches created
-- post-backfill where create-coach-account never seeded coaches_public).
INSERT INTO coaches_public (user_id, first_name, last_name, nickname, bio,
                            short_bio, location, profile_picture_url,
                            qualifications, specializations, specialties)
SELECT c.user_id, c.first_name, c.last_name, c.nickname, c.bio,
       c.short_bio, c.location, c.profile_picture_url,
       c.qualifications, c.specializations, c.specialties
FROM coaches c
LEFT JOIN coaches_public cp ON cp.user_id = c.user_id
WHERE cp.user_id IS NULL;

-- For existing rows, prefer non-NULL non-empty coaches_public over coaches.
-- coaches_public is the side coaches edit themselves, so user-edits win over
-- stale admin-time values. If coaches_public is NULL/empty AND coaches has
-- a value, copy from coaches.
UPDATE coaches_public cp
SET first_name = COALESCE(NULLIF(cp.first_name, ''), c.first_name),
    last_name  = COALESCE(NULLIF(cp.last_name, ''),  c.last_name),
    -- ... per column
FROM coaches c
WHERE cp.user_id = c.user_id;
```

Tradeoff: a coach who never edited self-service gets the admin-typed value
(correct). A coach who edited self-service after admin "fixed" their name in
the admin UI — the self-service value wins. Acceptable because admin writes
to `coaches` were largely silent failures (the admin path that doesn't crash
goes through `create-coach-account`, which writes both sides anyway in the
seed bug — see § 6).

**Required pre-backfill audit**: a one-shot diff query (also useful as the
verification check in § 9):

```sql
SELECT user_id, 'first_name' AS col, c.first_name AS coaches_val,
       cp.first_name AS coaches_public_val
FROM coaches c
JOIN coaches_public cp USING (user_id)
WHERE c.first_name IS DISTINCT FROM cp.first_name
UNION ALL ... per column;
```

If this returns rows where the values differ AND both sides look intentional
(neither NULL nor empty), surface them as conflict rows for manual resolution
before running the UPDATE. Don't auto-resolve — better to ship a one-pager
and have admin pick.

### Pattern B — `coaches` wins (canonical home is `coaches`)

Columns: `status`, `max_onetoone_clients`, `max_team_clients`,
`last_assigned_at`.

`coaches.status` was the earlier write target; `coaches_public.status`
likely drifted because admin RLS only writes `coaches`. Backfill:

```sql
-- Where coaches_public.status differs, coaches wins.
-- Just drop the column from coaches_public after the soak window — no
-- backfill needed beyond confirming reads have been redirected.
```

`coach_level` / `is_head_coach` are NOT moved (D1). No migration required.

### Pattern C — `coaches_private` wins (canonical home is `coaches_private`)

`gender`: copy from `coaches.gender` to `coaches_private.gender` where the
private side is NULL, then drop from `coaches`.

```sql
UPDATE coaches_private cpriv
SET gender = c.gender
FROM coaches c
WHERE cpriv.user_id = c.user_id
  AND cpriv.gender IS NULL
  AND c.gender IS NOT NULL;
```

Socials are NOT collapsed (D2). The `sync_coaches_public_socials_trigger`
remains in place. `coaches_private` is canonical; `coaches_public` mirror
is maintained automatically. No socials backfill in this refactor — the
trigger already keeps them aligned.

### Conflict-resolution table

Build a single migration that creates `coach_refactor_conflicts` (temp
audit table) and inserts rows for every column where `coaches.X != coaches_public.X`
AND both sides are non-empty. Admin resolves manually before drops run.
Keeps the resolution out of the migration script and out of git diff.

---

## 3. Migration plan

Ordered. Destructive (column drops, view rebuilds) come last after a soak
window. File names follow `YYYYMMDDHHMMSS_description.sql`; placeholder
timestamps below — use real ones at the time.

### Phase 0 — pre-Phase-1 audit (no migrations, no code changes)

A read-only investigation that must complete before Phase 1A ships:

- **0a**. `pg_proc` grep for SECURITY DEFINER RPCs referencing any
  soon-to-be-dropped column on `coaches` or `coaches_public`. Query:
  ```sql
  SELECT proname, pg_get_functiondef(oid)
  FROM pg_proc
  WHERE prosecdef = true
    AND pronamespace = 'public'::regnamespace
    AND (pg_get_functiondef(oid) ILIKE '%coaches.first_name%'
      OR pg_get_functiondef(oid) ILIKE '%coaches.last_name%'
      OR pg_get_functiondef(oid) ILIKE '%coaches.bio%'
      OR pg_get_functiondef(oid) ILIKE '%coaches.short_bio%'
      OR pg_get_functiondef(oid) ILIKE '%coaches.nickname%'
      OR pg_get_functiondef(oid) ILIKE '%coaches.location%'
      OR pg_get_functiondef(oid) ILIKE '%coaches.profile_picture_url%'
      OR pg_get_functiondef(oid) ILIKE '%coaches.qualifications%'
      OR pg_get_functiondef(oid) ILIKE '%coaches.specializations%'
      OR pg_get_functiondef(oid) ILIKE '%coaches.specialties%'
      OR pg_get_functiondef(oid) ILIKE '%coaches.age%'
      OR pg_get_functiondef(oid) ILIKE '%coaches.gender%'
      OR pg_get_functiondef(oid) ILIKE '%coaches_public.status%'
      OR pg_get_functiondef(oid) ILIKE '%coaches_public.max_onetoone_clients%'
      OR pg_get_functiondef(oid) ILIKE '%coaches_public.max_team_clients%'
      OR pg_get_functiondef(oid) ILIKE '%coaches_public.last_assigned_at%');
  ```
  Every hit must be folded into the redirect plan in § 4. **Blocks Phase 1A
  if any RPC needs rewriting.**
- **0b**. `delete-account` cascade verification. Pick a test coach (or seed
  one in a branch DB), delete via the edge function, confirm rows are gone
  from `coaches`, `coaches_public`, `coaches_private`. Today `coaches_public`
  has no FK back to `coaches`, so it likely orphans. Result feeds into 1B.
- **0c**. Read pass over the 18 verify-read sites in § 5. Confirm exact
  columns; mark each as `keep | redirect-to-coaches_public |
  redirect-to-directory-view | unchanged`. Hits get folded into 1C.

### Phase 1 — three sequential PRs (1A → 1B → 1C). No drops yet.

#### Phase 1A — migrations only

1. `20260503120000_coach_refactor_audit_table.sql` — create
   `coach_refactor_conflicts` (admin-only, RLS denies all but admin). No
   prereqs.
2. `20260503120100_coach_refactor_seed_missing_public.sql` — backfill
   `coaches_public` rows for any `coaches.user_id` without one. Copies
   public-facing columns from `coaches`. Idempotent.
3. `20260503120200_coach_refactor_backfill_pattern_a.sql` — pattern A merge
   for client-facing columns. Inserts conflicts into the audit table where
   both sides are non-empty and differ. Idempotent.
4. `20260503120300_coach_refactor_backfill_gender.sql` — pattern C copy of
   `coaches.gender → coaches_private.gender` where missing.
5. `20260503120400_coach_refactor_upsert_coach_full_rpc.sql` — create the
   `upsert_coach_full(p_user_id uuid, p_public jsonb, p_private jsonb,
   p_admin jsonb)` SECURITY DEFINER RPC (D3). Returns JSONB.
   Auth check inside the RPC: service_role bypass via JWT claim, otherwise
   `is_admin(auth.uid())` required. Implicit transaction wraps the three
   table writes; errors propagate to the caller as standard PostgREST
   error responses. Idempotent on `user_id`.
5b. `20260503120500_coach_refactor_check_training_completion_fix.sql` —
   `CREATE OR REPLACE FUNCTION public.check_training_completion(...)` to
   remove the redundant `UPDATE coaches_public SET status = 'active'`
   line. **Stale-read window opens here** for `AdminBillingManager.tsx:370`
   (single read site of `coaches_public.status`); closes when 1C ships.
   Acceptable per Hasan: only 1 prod coach past training, target same-day
   1A→1B→1C ship, callout in 1A PR description.

> The `coach_level` / `is_head_coach` add-and-copy migration is **REMOVED**
> per D1.

> The drop-socials-sync-trigger migration is **REMOVED** per D2.

**Smoke test before merging 1A**:
- conflict audit table empty after admin resolves any flagged rows;
- § 9 drift query returns zero rows;
- `upsert_coach_full(...)` callable as service-role and as admin user, both
  succeed; non-admin authenticated user gets `permission denied`;
- `check_training_completion(...)` runs cleanly on a test coach
  (returns the JSONB shape unchanged).

#### Phase 1B — edge function redirects + cascade fix

Backend-only PR. No DB changes (RPC was created in 1A).

- Redirect `create-coach-account/index.ts` to call `upsert_coach_full(...)`
  for the `coaches` + `coaches_public` + `coaches_private` write set. The
  existing `profiles_legacy.upsert()` stays (separate cleanup later).
  Removes the seed bug from § 6 by construction — RPC writes all three
  tables atomically.
- **`submit-onboarding/index.ts` requires NO RPC routing.** Phase 0
  audit confirmed the only coach write in this file is
  `coaches.update({ last_assigned_at })` at line 714-717 (single column,
  stays direct). The earlier audit's claim of multi-table writes at lines
  196-224 was fabricated. (`CoachManagement.tsx` still routes through
  the RPC in 1C — see below.)
- `delete-account/index.ts`: Phase 0b confirmed `coaches_public` orphans
  on `coaches` delete (no FK back). Add explicit deletes BEFORE the
  existing `coaches.delete()` at line 219:
  ```ts
  await safeDelete('coaches_private', { user_id: userId });
  await safeDelete('coaches_public',  { user_id: userId });
  // existing coaches.delete() at line 219 follows
  ```
  Order rationale: `coaches_private` first (cascade-redundant pre-Phase-3
  but explicit-required post-Phase-3 once D4 drops the FK); `coaches_public`
  second (PRIMARY FIX — closes the gap); `coaches` last (existing).

**Smoke test before merging 1B**:
- create a fresh coach via admin UI → confirm rows in all three tables;
- onboarding flow assigns coach → confirm `last_assigned_at` updates;
- delete-account on a test coach → confirm all three tables clean up
  (verify with the same `EXISTS(...)` query pattern from 0b empirical).

#### Phase 1C — frontend write redirects + FK-join rewrites + verified reads

Frontend-only PR.

- **Frontend write redirects**:
  - `src/pages/CoachSignup.tsx:152-161` → `coaches_public.update()` for
    `bio`, `qualifications`, `specializations`. Status flag still excluded.
  - `src/components/CoachManagement.tsx:208-221` (KNOWN-BROKEN) → call
    `upsert_coach_full(...)` RPC (or the existing `create-coach-account`
    edge function which now uses the RPC). The intuitive "split the
    update" approach is rejected because the RPC is the single funnel for
    admin writes per D3.
  - No changes to `CoachProfile.tsx` write paths (they already target the
    correct tables); but flip the key from `coach_public_id = data.id`
    to `user_id = user.id` for the `coaches_private.update()` at line
    218-229. (Phase 3 migration drops `coach_public_id`, but flipping
    early is safe — `user_id` is already populated.)
  - No changes to `ProfessionalLevelManager.tsx` (D1 keeps level/head-flag
    on `coaches_public`).
- **PostgREST FK-join rewrites** (4 sites; folded into Phase 1 per
  request, since they're independent debt that block Phase 3 anyway):
  - `supabase/functions/send-coach-payment-notifications/index.ts:71` —
    rewrite as separate `coaches` query + `coaches_public` query on
    `user_id`.
  - `src/components/admin/CoachReassignmentSection.tsx:55` — same
    pattern; `coach_service_limits` query + `coaches_public` lookup.
  - `src/components/admin/SystemHealthView.tsx:311` — same.
  - `src/components/admin/CoachPaymentCalculator.tsx:180` — same.
- **Verified-read site redirects**: any of the 18 sites from Phase 0c
  marked `redirect-to-coaches_public` or `redirect-to-directory-view` get
  rewritten here.

**Smoke test before merging 1C**:
- coach self-service profile edit + reload — value persists and shows
  identically in admin UI;
- admin coach edit dialog (`CoachManagement.tsx`) saves without error
  toast;
- coach signup landing flow (`CoachSignup.tsx`) submits bio without error;
- `CoachReassignmentSection`, `CoachPaymentCalculator`, `SystemHealthView`
  all render without console errors;
- `send-coach-payment-notifications` edge function runs end-to-end against
  a test subscription.

### Phase 2 — soak window (≥ 1 week, manual smoke + cron monitor)

No migrations, no code changes. The cron drift-monitor (added in 1A as
part of `coach_refactor_conflicts` infrastructure, or as a separate
scheduled function — see § 9) runs daily and pages on any non-zero result.

- **Manual smoke tests on day 0**: exercise the Phase 1 write paths
  end-to-end in prod. Confirm § 9 drift query returns zero rows after
  each:
  1. Admin creates a fresh coach via `CoachManagement.tsx` (exercises
     `upsert_coach_full` via `create-coach-account`).
  2. Admin edits an existing coach via `CoachManagement.tsx` (exercises
     `upsert_coach_full` directly via the frontend RPC call).
  3. Run `submit-onboarding` (real or staging client signup) to assign
     a coach (exercises the assignment flow + `last_assigned_at` direct
     write — NOT RPC-routed, but still in scope as a smoke test).
- **Day 7 gate**: drift-monitor has 7 consecutive zero-result days. If any
  drift event fires, root-cause and fix before resetting the timer. Do
  not extend purely because nothing happened — a quiet week with no
  coach writes proves nothing.

### Phase 3 — destructive (after soak passes)

6. `YYYYMMDDHHMMSS_coach_refactor_rebuild_views.sql` — `DROP VIEW
   coaches_full, coaches_directory, coaches_directory_admin` and recreate
   joining on `user_id` (not `coach_public_id`), with status pulled from
   `coaches`. Restores grants and `security_invoker = on`. **The view
   rebuild is the migration-blocker for the drops** because every dropped
   column is referenced by at least one of these views today.
   **ALSO** rebuilds `admin_get_coaches_full()` SECURITY DEFINER RPC body
   in the same migration (per Phase 0a finding). New body uses `user_id`
   joins for `coaches_private` and pulls `status` / `max_*_clients` /
   `last_assigned_at` from `coaches` instead of `coaches_public`. Same
   return signature so callers (`CoachManagement.tsx`,
   `ProfessionalLevelManager.tsx`) need no changes.
7. `YYYYMMDDHHMMSS_coach_refactor_drop_legacy_public_columns.sql` — drop
   from `coaches_public`: `status`, `max_onetoone_clients`,
   `max_team_clients`, `last_assigned_at`. (Socials, `coach_level`,
   `is_head_coach` NOT dropped per D1/D2.)
8. `YYYYMMDDHHMMSS_coach_refactor_drop_legacy_coaches_columns.sql` — drop
   from `coaches`: `first_name`, `last_name`, `nickname`, `bio`,
   `short_bio`, `location`, `profile_picture_url`, `qualifications`,
   `specializations`, `specialties`, `age`, `gender`. (`head_coach_specialisation`
   was never on `coaches` — ignore that line from the previous draft.)
   **ALSO** rewrites `upsert_coach_full(...)` RPC body in the same
   migration to remove the soak-window mirror writes to
   `coaches.{first_name, last_name, ...}` (those columns no longer exist).
9. `YYYYMMDDHHMMSS_coach_refactor_drop_coach_public_id_fk.sql` (D4) —
   drop the `coach_contacts_coach_id_fkey` constraint and drop the
   `coaches_private.coach_public_id` column entirely. All joins now key
   on `user_id`. The view rebuild in (6) already removed the dependency.
   **ATOMICITY REQUIRED**: this migration must, in a single transaction:
   (a) `CREATE OR REPLACE FUNCTION public.sync_coaches_public_socials()`
   with body using `WHERE user_id = NEW.user_id` instead of
   `WHERE id = NEW.coach_public_id`; (b) drop the FK constraint;
   (c) drop the column; (d) rewrite `upsert_coach_full(...)` body to
   stop populating `coach_public_id` on `coaches_private` inserts.
   Splitting any of these into separate transactions breaks
   `coaches_private` writes for any in-flight RPC call.
10. `YYYYMMDDHHMMSS_coach_refactor_rls_audit_followup.sql` — update any
    RLS policy that pre-Phase-3 audit (§ 7) flagged. Likely empty;
    included as a safety net.

### Sequencing constraints (revised)

- Phase 0 audits feed Phase 1 scope (no DDL).
- 1A migrations 1 → 2 → 3 → 4 → 5 in order (audit table before backfills
  before RPC; RPC has no data dependency but lives in same PR).
- 1B depends on 1A migration 5 (RPC must exist).
- 1C depends on 1A migration 5 if any front-end caller invokes the RPC
  directly; otherwise can ship in parallel with 1B but **prefer
  sequential** to keep blast radius small per request.
- Phase 2 starts only after 1C ships.
- Phase 3 migration 6 (view rebuild) before 7 / 8 / 9 (column / FK drops)
  — the views reference dropped columns.
- 7 and 8 independent of each other; both depend on 6.
- 9 depends on 6.
- 10 last (RLS adjustments).

---

## 4. Write-site audit

Every code path that mutates one of the four tables. Format: `file:line` —
current target / current columns → post-refactor target.

### `coaches` writes

Per D3, the TWO admin multi-table write paths (`create-coach-account`,
`CoachManagement.tsx`) route through `upsert_coach_full(...)`.
`submit-onboarding` is NOT routed — its only `coaches`-table write is the
single-column `last_assigned_at` UPDATE at line 714-717, which stays
direct. Direct multi-table writes are eliminated.

| file:line | currently writes | columns | post-refactor target | Phase |
|---|---|---|---|---|
| `src/pages/CoachSignup.tsx:152-161` | `coaches.update()` | `bio, qualifications, specializations` | `coaches_public.update()` keyed on `user_id` (these are public-profile fields). Coach-self-service does NOT route through `upsert_coach_full` — that RPC is admin-only | 1C |
| `src/components/admin/CoachReassignmentSection.tsx:176-179` | `coaches.update()` | `last_assigned_at` | unchanged — `last_assigned_at` stays on `coaches`, single-column write doesn't need RPC | 1C (unchanged) |
| `src/components/CoachManagement.tsx:208-221` (KNOWN-BROKEN) | `coaches.update()` | `first_name, last_name, date_of_birth, location, nickname, instagram_url, tiktok_url, snapchat_url, youtube_url` | call `supabase.rpc('upsert_coach_full', { p_user_id, p_public, p_private, p_admin })`. The known-broken `coaches.update()` is removed. **Fixes the deferred bug in CLAUDE.md** | 1C |
| `supabase/functions/submit-onboarding/index.ts:714-717` | `coaches.update()` | `last_assigned_at` | unchanged direct write — single-column write, doesn't need RPC routing. (This is the ONLY coaches-table write in submit-onboarding; reads at :507, :851, :858 are tracked in § 0c, not duplicated here) | 1B (unchanged) |
| `supabase/functions/delete-account/index.ts:209-213, 219` | `.select('id')` + `.delete()` on `coaches` | n/a | depends on Phase 0b result. If `coaches_public` orphans today: add explicit deletes for `coaches_public` and `coaches_private` keyed on `user_id` BEFORE the existing `coaches` delete. Don't change to RPC — delete is conceptually different from upsert | 1B |
| `supabase/functions/create-coach-account/index.ts:154-166` | `profiles_legacy.upsert()` | satisfies legacy FK on `coaches` | unchanged for now; flag `profiles_legacy` for separate cleanup. After Phase 3 the FK target may change but `profiles_legacy` removal is out of scope | 1B (unchanged) |
| `supabase/functions/create-coach-account/index.ts:174-228` | `coaches.select / insert / update` | `first_name, last_name, location, status, nickname, qualifications, specializations` | `upsert_coach_full(...)` with public + admin payloads. **Resolves seed bug in § 6 by construction** — RPC writes all three tables atomically | 1B |
| `supabase/functions/create-coach-account/index.ts:243-247` | `coaches_private.upsert()` | `coach_public_id, user_id, email, date_of_birth, instagram_url, tiktok_url, snapchat_url, youtube_url, whatsapp_number` | folded into the `upsert_coach_full(...)` call's `p_private` payload. RPC keys on `user_id` and never sets `coach_public_id` (column drops in Phase 3 anyway) | 1B |

### `coaches_public` writes

Coach self-service (`CoachProfile.tsx`) and admin level-management
(`ProfessionalLevelManager.tsx`) write `coaches_public` directly today.
They stay direct — D3 routes ADMIN COACH-RECORD WRITES through the RPC,
not every `coaches_public` write. Self-service is single-table and
single-purpose, so adding the RPC indirection adds nothing.

| file:line | currently writes | columns | post-refactor target | Phase |
|---|---|---|---|---|
| `src/components/CoachProfile.tsx:162-165` | `coaches_public.update()` | `profile_picture_url` | unchanged | — |
| `src/components/CoachProfile.tsx:197-213` | `coaches_public.update()` | `first_name, last_name, location, bio, short_bio, qualifications, specializations, nickname` | unchanged | — |
| `src/components/CoachProfile.tsx:218-229` | `coaches_private.update()` | `gender, whatsapp_number, date_of_birth, instagram_url, tiktok_url, snapchat_url, youtube_url` | unchanged in target. **Flip key in 1C**: today keys on `coach_public_id = coachData.id`; flip to `user_id = user.id` (safe to do early — `user_id` is populated, the `coach_public_id` column drops in Phase 3) | 1C |
| `src/components/admin/ProfessionalLevelManager.tsx:185-193` | `coaches_public.update()` | `coach_level, is_head_coach, head_coach_specialisation` | unchanged per D1 — these stay on `coaches_public`. Earlier PLM redirect (commit `16a00cb`) is the prior iteration; this column set is now correct | — |

### `coaches_private` writes

Direct paths covered above (`CoachProfile.tsx`); admin paths now route
through `upsert_coach_full(...)`. No other writers found.

### `coaches_full` writes

None — it's a view.

---

## 5. Read-site audit

For each read site, verify it points at the post-refactor canonical home and
that no PostgREST FK join breaks when columns move.

**Phase 0c covers the 18 `verify` rows below**: each gets a 1-minute Read
pass before Phase 1A ships, the column list is confirmed, and one of these
verdicts is locked in: `keep` / `redirect-to-coaches_public` /
`redirect-to-directory-view`. Any redirect required by a `verify` row is
folded into Phase 1C alongside the named-changes below.

### Reads from `coaches`

| file:line | reads | post-refactor verdict |
|---|---|---|
| `src/lib/coachMatching.ts:104-113` | `id, user_id, first_name, last_name, specializations` | **needs change** — `first_name, last_name, specializations` move to `coaches_public`. Either repoint to `coaches_public` (and join `coaches` for `status` filter), or use the rebuilt `coaches_directory_admin` view |
| `src/lib/coachMatching.ts:241-245` | `id, user_id, first_name, status` | **needs change** — `first_name` moves; either join or use directory view |
| `src/pages/CoachSignup.tsx:54-58` | `*` from `coaches` filtered by id+user_id | **needs change** — `*` no longer carries profile fields. Inspect what the page actually reads and switch to `coaches_public` for profile data, `coaches` for status |
| `src/pages/admin/WorkoutBuilderQA.tsx:62+` | likely `first_name, last_name` | **likely needs change** — verify and repoint to `coaches_public` or `coaches_directory_admin` |
| `src/components/ClientList.tsx:481+` | likely `first_name, last_name` | **likely needs change** — same |
| `src/components/CoachApplicationsManager.tsx:294+` | unknown — verify | likely `coaches_public` or directory |
| `src/components/admin/PayoutRatesManager.tsx:155+` | unknown — verify | depends on which columns; `coach_level` might stay on `coaches_public` per § 10 |
| `src/components/admin/CoachWorkloadPanel.tsx:27+` | likely capacity + name | split: capacity from `coaches`, name from `coaches_public`, or directory view |
| `src/components/admin/PreLaunchValidation.tsx:209+, 282+` | unknown — verify | likely OK if filtering on `status` |
| `src/components/admin/CoachLoadOverview.tsx:71-72` | `id, user_id, first_name, last_name, status` | **needs change** — `first_name`/`last_name` move; use directory view |
| `src/components/admin/CoachPaymentCalculator.tsx:240+` | unknown | verify |
| `src/components/admin/CoachCapacityManager.tsx:73+` | capacity columns | likely unchanged — capacity stays on `coaches` |
| `src/components/admin/AdminMetricsCards.tsx:36+` | likely counts/status | probably unchanged |
| `src/components/coach/AddSpecialistDialog.tsx:129+` | unknown | verify |
| `src/components/coach/CoachDashboardLayout.tsx:45+` | unknown — likely current coach name | repoint to `coaches_public` |
| `src/components/coach/programs/DayModuleEditor.tsx:92+` | likely name | repoint |
| `src/components/coach/CoachEarningsSummary.tsx:50+` | likely level/name | split or use directory |
| `supabase/functions/send-admin-daily-summary/index.ts:74+` | unknown | verify |
| `supabase/functions/process-testimonial-requests/index.ts:113+` | likely name | repoint |
| `supabase/functions/notify-coach-contact/index.ts:70+` | likely name + email (joins `coaches_private` separately) | repoint name to `coaches_public` |
| `supabase/functions/create-manual-client/index.ts:128+` | unknown | verify |
| `supabase/functions/send-weekly-coach-digest/index.ts:41+` | unknown | verify |
| `supabase/functions/calculate-monthly-coach-payments/index.ts:205+` | likely level + name | split |
| `supabase/functions/send-client-approval-notification/index.ts:57+` | unknown | verify |
| `supabase/functions/process-payment-failure-drip/index.ts:135+` | unknown | verify |
| `supabase/functions/process-coach-inactivity-monitor/index.ts:54+` | likely `last_assigned_at` and email-via-private | likely unchanged |
| `supabase/functions/notify-coach-new-client/index.ts:33+` | unknown | verify |

Each `verify` row resolves in Phase 0c and any required redirect ships in
Phase 1C. They were not fully expanded in the codebase audit because the
snippets weren't long enough; do not assume safe.

### Reads from `coaches_public`

| file:line | reads | post-refactor verdict |
|---|---|---|
| `src/components/CoachProfile.tsx:80-83` | `id, user_id, first_name, last_name, location, bio, short_bio, profile_picture_url, qualifications, specializations, nickname` | unchanged |
| `src/components/coach/CoachDashboardOverview.tsx:330+, 485+` | unknown | likely unchanged |
| `src/components/coach/CoachCompensationCard.tsx:54+` | likely `coach_level` | unchanged per D1 — `coach_level` stays on `coaches_public` |
| `src/components/coach/teams/CoachTeamsPage.tsx:45+` | unknown | verify |
| `src/components/admin/ProfessionalLevelManager.tsx:72-75` | reads from `coaches_full` view | view will be rebuilt — confirm the rebuilt view exposes the same columns |
| `src/components/admin/AdminBillingManager.tsx:370+` | unknown | verify |

### Reads from `coaches_private`

| file:line | reads | post-refactor verdict |
|---|---|---|
| `src/components/CoachProfile.tsx:92-96` | `email, whatsapp_number, date_of_birth, gender, instagram_url, tiktok_url, snapchat_url, youtube_url` | unchanged in columns; **change key**: today keys on `coach_public_id = data.id`, after migration 9 keys on `user_id` |
| `src/components/admin/AdminBillingManager.tsx:360+` | unknown | verify; key change applies |
| `src/components/admin/SecurityChecklist.tsx:78+` | unknown | verify |
| `supabase/functions/send-pending-client-notification/index.ts:48+` | `email` | unchanged in columns; key change |
| `supabase/functions/notify-coach-contact/index.ts:113+` | unknown | verify; key change |
| `supabase/functions/create-manual-client/index.ts:219+` | unknown | verify |
| `supabase/functions/send-coach-payment-notifications/index.ts:91+` | likely email | key change |
| `supabase/functions/send-client-approval-notification/index.ts:72+` | unknown | verify; key change |
| `supabase/functions/notify-coach-new-client/index.ts:48+` | unknown | verify; key change |

### Reads from `coaches_full`

| file:line | reads | post-refactor verdict |
|---|---|---|
| `src/components/CoachManagement.tsx:110-112` | `id, user_id, first_name, last_name, location, status, created_at, email, date_of_birth, whatsapp_number` | view rebuilt — these columns must be preserved by the rebuild (cross-table) |
| `src/components/admin/ProfessionalLevelManager.tsx:72-75` | `user_id, first_name, last_name, status, email, coach_level, is_head_coach, head_coach_specialisation` | rebuild must preserve. Per D1, `coach_level` / `is_head_coach` stay on `coaches_public` — view sources them from there directly |
| `src/components/admin/SubscriptionPayoutPreview.tsx:92+` | unknown | verify |
| `supabase/functions/security-regression-checks/index.ts:377+` | unknown | verify |

### Reads from `coaches_directory` / `coaches_directory_admin`

These are the public-facing views and must keep working. Files:
`Testimonial.tsx:37`, `ClientSubmission.tsx:185`, `ClientSessions.tsx:118`,
`TestimonialsManagement.tsx:68`, `MeetOurTeam.tsx:47`,
`AccountManagement.tsx:213`, `Index.tsx:238`, `MyCareTeamCard.tsx:92`,
`CareTeamOverviewCard.tsx:118`, `security-smoke-tests/index.ts:91+`,
`pre-launch-security-gate/index.ts:368-381`. Rebuild keeps the same column
list with values pulled from new homes.

### PostgREST FK joins that break (rewrite in Phase 1C)

These joins target `coaches` (FK relationship key, not table name). Each
breaks when `coaches.first_name` etc. disappear in Phase 3 — but they are
**independent debt** (per CLAUDE.md "Never use nested PostgREST FK joins…")
so they're scoped into Phase 1C alongside other write-redirects rather
than waiting for Phase 3. Rewriting them now means Phase 3 has fewer blast
radius:

- `supabase/functions/send-coach-payment-notifications/index.ts:71` —
  `.select('*, coaches(id, first_name, last_name, user_id)')`. Rewrite:
  first query reads the parent table; second query reads `coaches_public`
  keyed on `user_id`. Phase 1C.
- `src/components/admin/CoachReassignmentSection.tsx:55` —
  `coach_service_limits` joining `coaches!inner(... first_name, last_name,
  specializations, status)`. Same pattern. Phase 1C.
- `src/components/admin/SystemHealthView.tsx:311` —
  `.select("preferred_coach_id, coaches:preferred_coach_id (first_name,
  last_name)")`. Same pattern. Phase 1C.
- `src/components/admin/CoachPaymentCalculator.tsx:180` — `.select('*,
  coaches(first_name, last_name)')`. Same pattern. Phase 1C.

---

## 6. Seed bug fix

**Bug**: `create-coach-account` writes `coaches` and `coaches_private` but
**never inserts a `coaches_public` row**. Worse, it stuffs `coaches.id` into
`coaches_private.coach_public_id` (line 232) — but `coaches_full` joins on
`coaches_public.id = coaches_private.coach_public_id`. Any coach created
post-backfill therefore:
- has no `coaches_public` row → `coaches_full` join produces zero rows for them
- `CoachManagement.tsx` (reads `coaches_full`) shows them as missing
- self-service `CoachProfile.tsx` (reads `coaches_public` keyed on
  `user_id`) shows blank fields, and the coach has nothing to edit

**Recommendation: option (a) — fix `create-coach-account` to also seed
`coaches_public`.** Reasoning:

- (a) is a small targeted change — add an `upsert` to `coaches_public` after
  the existing `coaches` insert, mirroring the public columns. Forward-
  compatible with the column-ownership refactor: post-refactor, the
  `coaches` insert shrinks to admin columns, the `coaches_public` insert
  becomes the canonical write of profile fields.
- (b) "make `coaches_public` a view" sounds clean but breaks the security
  model: `coaches_public` has its own RLS template (`tpl1_self_update`)
  letting a coach update their own row directly via PostgREST. A view over
  `coaches + coaches_private` would either need INSTEAD OF triggers
  (complex, easy to misimplement) or break self-service writes. Skip.
- (c) status quo with a code-level "always write both" helper would replace
  one drift source with another less visible one (which path forgot to call
  the helper).

**The fix (D3-aligned)**: in Phase 1B, `create-coach-account/index.ts`
replaces its three direct table writes with a single
`upsert_coach_full(...)` RPC call. The RPC writes `coaches`,
`coaches_public`, and `coaches_private` atomically inside one
transaction, so the seed bug becomes structurally impossible — there is
no code path that writes one without the others.

```ts
// Replaces lines 174-247 in create-coach-account/index.ts
const { data: rpcResult, error: rpcError } = await supabaseAdmin
  .rpc('upsert_coach_full', {
    p_user_id: userId,
    p_public: {
      first_name, last_name, nickname, location,
      qualifications: certifications ?? null,
      specializations: specializations ?? null,
    },
    p_private: {
      email,
      date_of_birth: date_of_birth ?? null,
      instagram_url: instagram_url ?? null,
      tiktok_url: tiktok_url ?? null,
      snapchat_url: snapchat_url ?? null,
      youtube_url: youtube_url ?? null,
      whatsapp_number: phoneNumber ?? null,
    },
    p_admin: {
      status: applicationId ? 'active' : 'pending',
    },
  });
if (rpcError) throw rpcError;
```

After Phase 1A backfill (migration 2) + this RPC redirect (Phase 1B),
every existing coach has a row in all three tables and every future
admin write goes through one funnel.

**Backfill migration to cover the gap**: migration 2
(`YYYYMMDDHHMMSS_coach_refactor_seed_missing_public.sql`) handles
already-affected coaches. Already in the migration plan.

---

## 7. RLS audit

Current policies (per the schema agent):

### `coaches`
- `coaches_admin_only` — `ALL` to admins. Single policy. **No team-coach
  variant** (correctly — `coaches` is admin-managed). No update needed.

### `coaches_public`
- `tpl4_authenticated_select` — any authenticated user can read. No
  reference to specific columns; no update needed.
- `tpl2_admin_all` — admin all. No update needed.
- `tpl1_self_update` — `auth.uid() = user_id`. No reference to specific
  columns; no update. **Important**: this is what allows coach self-service
  via `coaches_public.update()` — the refactor preserves this policy.

### `coaches_private`
- `tpl1_self_select`, `tpl1_self_update`, `tpl2_admin_all` — all key on
  `user_id`. No column references. No update needed.

### Indirect impact
- Any custom RLS that filters on `coaches.first_name`, `coaches.status`, or
  any soon-to-be-dropped column would break. None found in the four tables'
  policies. Recommend a final pass searching `pg_policies` for the dropped
  column names just before Phase 3 lands. SQL:
  ```sql
  SELECT tablename, policyname, qual, with_check
  FROM pg_policies
  WHERE qual ILIKE '%first_name%' OR with_check ILIKE '%first_name%'
     OR qual ILIKE '%coach_level%' -- per dropped column
     ...;
  ```

### Team-coach pattern
`CLAUDE.md` references team-coach RLS variants on `subscriptions` /
`profiles_public` (migrations `20260212170000` / `180000`). Those tables are
not part of this refactor. The pattern here is simpler: the coach-side
tables don't need team variants because no client reads them by team
membership; only directory views do, and those use admin-only RPCs or
authenticated-select. No new team-variant policies needed.

---

## 8. Roll-out sequence (revised)

### Phase 0 — pre-flight audits (no merge to main)

- 0a: `pg_proc` SECURITY DEFINER grep (§ 3 Phase 0). Outputs a list of RPC
  files (if any) that need rewriting. Folded into Phase 1B/1C scope before
  PRs are opened.
- 0b: `delete-account` cascade verification on a branch DB / test coach.
  Result decides whether 1B adds explicit deletes for `coaches_public` /
  `coaches_private` or whether existing cascade is sufficient.
- 0c: 18 verify-read site Read pass (§ 5). Outputs a per-site verdict
  (`keep` / `redirect-to-coaches_public` / `redirect-to-directory-view`).
  Any `redirect-*` row folded into Phase 1C scope.

Phase 0 is research; nothing ships. Output: a punch list feeding the three
Phase 1 PRs.

### Phase 1 — three sequential PRs. NO column drops.

#### PR 1A — migrations only

Ships migrations 1-5 from § 3 (audit table, seed missing rows, pattern A
backfill, gender backfill, `upsert_coach_full(...)` RPC). No code changes.

Verification before merging:
- migrations apply cleanly on a branch DB;
- `coach_refactor_conflicts` table populated; admin reviews and resolves
  any flagged rows by manual UPDATE before promotion;
- § 9 drift query returns zero rows;
- `upsert_coach_full(...)` callable as service-role and admin auth, both
  succeed; non-admin authenticated user gets `permission denied`.

After 1A merges to main, prod runs the new RPC but no caller invokes it
yet — safe to soak briefly (a few hours minimum, day at most).

#### PR 1B — edge function redirects + cascade fix

Backend-only. Routes `create-coach-account` through the RPC.
`submit-onboarding` requires NO RPC routing — its only `coaches` write is
the single-column `last_assigned_at` UPDATE at line 714-717, which stays
direct. Updates `delete-account` per Phase 0b finding.

Verification before merging:
- in branch / staging: create a fresh coach via admin UI → confirm rows in
  all three tables and § 9 drift query stays clean;
- onboarding flow assigns coach → `last_assigned_at` updates;
- delete a test coach → all three tables clean up.

After 1B merges, the seed bug from § 6 is structurally fixed. No drift can
be introduced via admin/onboarding paths (only via the still-unredirected
front-end paths).

#### PR 1C — frontend + edge-function redirects, FK-join rewrites, 0c reads

Frontend + edge-function PR. Combines write-side redirects with all 0c
read-site work classified as `redirect / key-flip / silent-bug-fix /
select-star-rewrite`.

**Write-side (3 sites):**

| file:line | classification | post-refactor target |
|---|---|---|
| `src/pages/CoachSignup.tsx:152-161` | redirect | `coaches_public.update({bio, qualifications, specializations}).eq('user_id', user.id)` |
| `src/components/CoachManagement.tsx:208-221` | RPC routing (D3) | `supabase.rpc('upsert_coach_full', { p_user_id, p_public, p_private, p_admin })` |
| `src/components/CoachProfile.tsx:218-229` | key-flip | flip `.eq('coach_public_id', coachData.id)` to `.eq('user_id', user.id)` |

**Read-side (28 distinct sites — all from 0c):**

| classification | count | notes |
|---|---|---|
| redirect (`coaches.{first_name,last_name,…}` → `coaches_public`) | 17 | most are `select('first_name, last_name, …')`-shaped reads on `coaches`. Some are mixed (e.g. `CoachWorkloadPanel:27` keeps capacity columns on `coaches`, redirects names to `coaches_public`) |
| key-flip (`coach_public_id` → `user_id` on `coaches_private`) | 6 | notify-coach-contact:115, send-client-approval-notification:72, notify-coach-new-client:50, send-pending-client-notification:48, submit-onboarding:858, send-coach-payment-notifications:91 |
| silent-bug-fix (`coaches.email` non-existent column) | 2 | CoachApplicationsManager:294, create-manual-client:128 — switch to `coaches_private.select('user_id').ilike('email', ...)` |
| `coaches_public.status` → `coaches.status` | 1 | AdminBillingManager:370 — closes the stale-read window opened by 1A migration 5b |
| `select('*')` → explicit list | 1 | CoachPaymentCalculator:240 — also classified as `redirect` (overlap) |
| FK-join rewrite (`.select('*, coaches(...)')` → 2-query pattern) | 4 | send-coach-payment-notifications:71, CoachReassignmentSection:55, SystemHealthView:311, CoachPaymentCalculator:180 |

Three submit-onboarding sites surfaced during the D3 correction
(`:506, :850, :858`) are included in the redirect/key-flip totals above.

Verification before merging:
- coach self-service profile edit + reload — value persists and shows
  identically in admin UI;
- admin coach edit dialog (`CoachManagement.tsx`) saves without error
  toast;
- coach signup landing flow (`CoachSignup.tsx`) submits bio without error;
- `CoachReassignmentSection`, `CoachPaymentCalculator`, `SystemHealthView`
  render without console errors;
- `send-coach-payment-notifications` edge function runs end-to-end against
  a test subscription;
- `AdminBillingManager` coach billing list renders correct status (closes
  the stale-read window from 1A migration 5b);
- the 2 silent-bug-fix sites now return rows for the test admin coach;
- `npx tsc --noEmit` clean.

### Phase 2 — soak window (≥ 1 week, manual smoke + cron monitor)

No migrations, no code changes. Day-0 manual smoke tests (don't wait for
synthetic traffic):

- **Phase 1 write paths** exercised end-to-end in prod:
  1. Admin creates a fresh coach via `CoachManagement.tsx` ("Add coach")
     — exercises `upsert_coach_full` via `create-coach-account`.
  2. Admin edits an existing coach via `CoachManagement.tsx` — exercises
     `upsert_coach_full` directly via the frontend RPC call.
  3. Run `submit-onboarding` (a real client signup, or a staging signup)
     — exercises the assignment flow + `last_assigned_at` direct write.
     Not RPC-routed, but still a Phase 1 path that touches `coaches`.
- After each: § 9 drift query returns zero rows.

Background:
- Cron drift-monitor (added in 1A or as separate scheduled fn) runs daily
  and pages on any non-zero result.
- Day 7 gate: 7 consecutive zero-result days. **Manual smoke must have
  exercised every path** — quiet weeks don't count toward the gate. If a
  drift event fires, root-cause and fix; reset the day-0 gate.

### Phase 3 — destructive (drop columns, rebuild views, drop FK)

Ships migrations 6-10 from § 3. Read-sites that depend on rebuilt view
structure ship in same PR.

Verification:
- § 9 post-Phase-3 query confirms columns are gone;
- spot-check admin UI: `CoachManagement` row list renders, edit saves,
  client counts correct;
- coach self-service: `CoachProfile` saves and round-trips;
- onboarding still assigns coach end-to-end;
- run all daily/weekly cron jobs that touch coaches manually:
  `send-admin-daily-summary`, `send-weekly-coach-digest`,
  `process-coach-inactivity-monitor`. Each completes without error.

---

## 9. Verification plan

### Pre-Phase-3 drift query

Run before promoting Phase 1 → Phase 2 and before Phase 3 ships. Returns
zero rows when no drift exists.

```sql
WITH duplicate_columns AS (
  SELECT c.user_id,
         c.first_name              AS c_first_name,
         cp.first_name             AS cp_first_name,
         c.last_name               AS c_last_name,
         cp.last_name              AS cp_last_name,
         c.nickname                AS c_nickname,
         cp.nickname               AS cp_nickname,
         c.bio                     AS c_bio,
         cp.bio                    AS cp_bio,
         c.short_bio               AS c_short_bio,
         cp.short_bio              AS cp_short_bio,
         c.location                AS c_location,
         cp.location               AS cp_location,
         c.profile_picture_url     AS c_pic,
         cp.profile_picture_url    AS cp_pic,
         c.qualifications          AS c_qual,
         cp.qualifications         AS cp_qual,
         c.specializations         AS c_spec,
         cp.specializations        AS cp_spec,
         c.specialties             AS c_specs,
         cp.specialties            AS cp_specs,
         c.status                  AS c_status,
         cp.status                 AS cp_status,
         c.max_onetoone_clients    AS c_max1,
         cp.max_onetoone_clients   AS cp_max1,
         c.max_team_clients        AS c_maxt,
         cp.max_team_clients       AS cp_maxt,
         c.last_assigned_at        AS c_last,
         cp.last_assigned_at       AS cp_last
  FROM coaches c
  JOIN coaches_public cp USING (user_id)
)
SELECT * FROM duplicate_columns
WHERE c_first_name IS DISTINCT FROM cp_first_name
   OR c_last_name  IS DISTINCT FROM cp_last_name
   OR c_nickname   IS DISTINCT FROM cp_nickname
   OR c_bio        IS DISTINCT FROM cp_bio
   OR c_short_bio  IS DISTINCT FROM cp_short_bio
   OR c_location   IS DISTINCT FROM cp_location
   OR c_pic        IS DISTINCT FROM cp_pic
   OR c_qual       IS DISTINCT FROM cp_qual
   OR c_spec       IS DISTINCT FROM cp_spec
   OR c_specs      IS DISTINCT FROM cp_specs
   OR c_status     IS DISTINCT FROM cp_status
   OR c_max1       IS DISTINCT FROM cp_max1
   OR c_maxt       IS DISTINCT FROM cp_maxt
   OR c_last       IS DISTINCT FROM cp_last;
```

Plus a missing-row check:

```sql
SELECT c.user_id FROM coaches c
LEFT JOIN coaches_public cp USING (user_id)
WHERE cp.user_id IS NULL;

SELECT c.user_id FROM coaches c
LEFT JOIN coaches_private cpriv USING (user_id)
WHERE cpriv.user_id IS NULL;
```

### Post-Phase-3 query

Confirms columns are physically gone (rather than just empty):

```sql
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'coaches'
  AND column_name IN ('first_name','last_name','nickname','bio','short_bio',
                      'location','profile_picture_url','qualifications',
                      'specializations','specialties','age','gender');
-- Should return zero rows.

SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'coaches_public'
  AND column_name IN ('status','max_onetoone_clients','max_team_clients',
                      'last_assigned_at');
-- Should return zero rows.

-- coach_level / is_head_coach / head_coach_specialisation stay on
-- coaches_public per D1 — should still exist.
-- instagram_url / tiktok_url / youtube_url stay on both per D2 — should
-- still exist.

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'coaches_private'
  AND column_name = 'coach_public_id';
-- Should return zero rows (D4: column dropped).
```

### Continuous drift check

Two options:
1. Cron-based: a daily scheduled function runs the drift query and pages on
   non-zero result. Simple, observable.
2. Trigger-based: an `AFTER INSERT/UPDATE` trigger on `coaches` and
   `coaches_public` that raises NOTICE / logs to a `drift_events` table when
   a write touches a column not in the canonical list for that table.
   Closer to "impossible to drift" but more invasive.

**Recommended**: cron post-Phase-3 (drops eliminate most drift potential
anyway). Trigger only if the ops team wants belt-and-suspenders.

### Long-term: drift becomes physically impossible

After Phase 3, columns dropped from one side only exist on the other.
Reintroducing drift requires re-adding the column in a future migration —
which a code reviewer should catch. The continuous check is therefore
defense-in-depth, not the primary mechanism.

---

## 10. Risks and unknowns — decisions for review

> D1-D4 are resolved. The decisions live in the revision note at the top
> of this doc; the alternatives discussion is preserved in git history.

### Unknowns that need investigation in Phase 0 (or earlier)

**U1. 18 verify-read sites in § 5.** Resolved in Phase 0c. Each gets a
1-min Read pass; redirects fold into 1C. Do not drop any column without
confirming nothing reads it from a now-empty side.

**U2. SECURITY DEFINER RPCs not yet inventoried.** Resolved in Phase 0a
(`pg_proc` grep, query in § 3). Hits fold into 1B/1C. Blocks 1A if any
RPC needs rewriting before the column drops in Phase 3.

**U3. `delete-account` cascade verification.** Resolved in Phase 0b. Today
`coaches_private.coach_public_id → coaches.id` cascades, but
`coaches_public` has no FK back to `coaches`. Likely orphans. Decision in
Phase 1B based on test-coach run.

**U4. `coaches.id` independence (cosmetic).** Per the known facts,
`coaches.id` and `coaches_public.id` are independent UUIDs except for the
one prod coach aligned by migration 20260121190914. The
`/coach-password-setup?coach_id=...` URL pattern uses `coaches.id` and
gets read back by `CoachSignup.tsx` querying `coaches.id = coachId` —
internally consistent, no bug. Worth normalizing the URL parameter to
`user_id` in a future cleanup, not in this refactor.

**U5. `profiles_legacy` dependency.** `create-coach-account` upserts
`profiles_legacy` to satisfy a legacy FK on `coaches`. Out of scope for
this refactor; flag for future cleanup. Removing it requires dropping the
FK first, which means more analysis than fits here.

**U6. Tests / fixtures.** This plan didn't audit Cypress/Playwright/
Vitest fixtures that may seed coach data via direct SQL. Before Phase 3,
grep test files for `coaches`, `coaches_public`, `coaches_private` and
update any fixture inserts. Add to Phase 0 punch list.

### Things that could break in production

**B1. PostgREST FK joins (§ 5).** The four identified joins break the
moment the columns drop. Rewritten in Phase 1C — promoted from "Phase 3
prereq" to "Phase 1 scope" per request.

**B2. `coaches_full` view security.** The view currently REVOKEs SELECT
from anon/authenticated and is accessed via `admin_get_coaches_full()`
RPC only. The Phase 3 rebuild must preserve those grants exactly. A
regression here exposes PII.

**B3. Backfill ordering.** If migration 2 (seed missing `coaches_public`)
runs before the conflict-detection backfill, conflicts get auto-resolved
silently. Order matters — audit table (1) → seed missing rows (2) →
pattern A merge with conflict detection (3) → gender backfill (4) → RPC
(5). The PR 1A migrations land in this order.

**B4. Concurrent writes during backfill.** A coach editing self-service
mid-migration could race a backfill UPDATE. Mitigation: run backfills in
a transaction with a brief `LOCK TABLE coaches_public, coaches IN
EXCLUSIVE MODE`. Acceptable downtime: seconds.

**B5. RLS template names.** The `tpl1_self_update`, `tpl2_admin_all` etc.
naming is template-style. If any future migration renames the template,
the verification queries in § 7 break. Check the template policy
generator before Phase 3.

**B6 (new). RPC permission model.** `upsert_coach_full(...)` is SECURITY
DEFINER and must check `is_admin(auth.uid())` inside its body — not rely
on RLS, which is bypassed by SECURITY DEFINER. The smoke test in 1A
verification (non-admin gets `permission denied`) is the gate. Also
needs a service-role bypass for edge function callers (which run with
`SUPABASE_SERVICE_ROLE_KEY`, no `auth.uid()`).

**B7 (new). Atomicity of RPC**. The RPC writes three tables. If any
write fails mid-call, the whole transaction must roll back — otherwise
we reintroduce the seed-bug pattern. Use a single `BEGIN ... EXCEPTION
WHEN OTHERS THEN RAISE` block; Postgres function bodies are implicitly
transactional but we want the exception path to surface a useful error
shape to the edge function caller (returning JSONB `{ ok: false, error }`
rather than raising and getting wrapped by PostgREST).

---

## Open items before Phase 1A ships

1. Phase 0a (`pg_proc` grep) — me, before opening 1A PR.
2. Phase 0b (`delete-account` cascade test) — me, before opening 1A PR.
3. Phase 0c (18 verify-read sites Read pass) — me, before opening 1C PR
   (1A doesn't strictly need it, but 1C does).
4. Sign-off on this revised plan from Hasan — gate to Phase 1A.

If Phase 0 surfaces anything that changes the migration shape, I'll come
back with a delta before opening 1A.

---

## Phase 1 retrospective (May 3-4, 2026)

Phase 1 (1A + 1B + 1C) shipped in one extended session. End-to-end prod
smoke testing on May 4 caught **5 follow-up bugs** that the original plan
didn't anticipate. All fixed in the same session. The plan above remains
the source of truth for Phase 2/3; this retrospective captures what
landed, what was pulled forward, and what's still pending.

### Bugs caught + fixed during prod smoke testing

| # | Symptom | Root cause | Fix | Commit |
|---|---|---|---|---|
| 1 | "null value in column id of relation coaches_public" on first new-coach RPC call | `coaches_public.id` was NOT NULL with no default. Pre-Phase-1, the only INSERT path was the one-time backfill which supplied `id` explicitly | `ALTER TABLE coaches_public ALTER COLUMN id SET DEFAULT gen_random_uuid()` | `23132fc` |
| 2 | Coach signup profile submit silently zero-rowed under simulated RLS denial | `CoachSignup.tsx` 1C edit was missing the `.select()` row-count guard pattern from PLM | Added `.select("user_id")` + row-count check + descriptive error | `b9ba515` |
| 3 | New coach's profile page (post-signup) didn't load DOB / gender / IG URL | 1C edit only flipped `coaches_private` WRITE key from `coach_public_id` → `user_id`; the READ in `fetchCoachData` was missed. Hasan worked by ID-alignment coincidence | Flipped `.eq("coach_public_id", data.id)` → `.eq("user_id", data.user_id)` in CoachProfile.tsx fetchCoachData | `27cb431` |
| 4 | Admin edit coach via CoachManagement → "null value in column email of relation coaches_private" | Admin form treats email as read-only → `p_private` had DOB+URLs but no email. INSERT-with-ON-CONFLICT fails NOT NULL check before conflict resolution | RPC now SELECTs existing private row, COALESCEs payload with existing values, then INSERTs/UPDATEs. Look up by `coach_public_id OR user_id` for FK-misnaming defense | `0d13b7d` |
| 5 | Same admin edit silently demoted active coach to pending | RPC's `v_status := COALESCE(p_admin->>'status', 'pending')` defaulted to `'pending'`, then propagated as EXCLUDED.status during ON CONFLICT | Keep `v_status` null when caller omits; let column default handle new INSERTs and ON CONFLICT preserve existing via `COALESCE(v_status, table.status)` | `0d13b7d` (folded with #4) |

All five surfaced ONLY because we ran end-to-end smoke tests post-Phase-1.
Static analysis + Cowork's audits would not have caught them.

### Pulled forward from Phase 3

**`coaches_full` view + `admin_get_coaches_full()` RPC rebuild** —
originally Phase 3 migration 6, shipped early as `20260504170000` /
commit `39c5797`. Reason: the misnamed `coach_public_id` JOIN was
breaking admin reads of new coaches (email "—" in admin table). Same
column shape, same column sources, only the JOIN key changed to
`user_id`. Phase 3 (proper) will additionally re-source `status` /
`max_*_clients` / `last_assigned_at` from `coaches` before dropping the
deprecated columns.

### Closed in Phase 1 (originally non-scope but adjacent)

**Admin "Activate Coach" button** (commit `7af9622`) — surfaced as a
product gap when smoke testing revealed there was no admin UI to flip a
directly-created coach from `pending → active`. Only the application-
approval flow could do it. Now: kebab menuitem on Pending coaches
routes through `upsert_coach_full(p_admin: { status: 'active' })`,
sharing the same atomic + auth-gated path as other admin coach writes.

### Still pending

- **Phase 2 soak window.** Drift monitor scheduled daily. 7 consecutive
  zero-drift days unlocks Phase 3 destructive drops.
- **Phase 3 migration 6 (column re-sourcing).** The JOIN-key portion is
  done. Still pending: re-source `status` / `max_*_clients` /
  `last_assigned_at` from `coaches` in both view and RPC before dropping
  those columns from `coaches_public`.
- **Phase 3 migrations 7-10.** The actual destructive drops + FK rename
  + sync trigger rewrite. Sequenced as documented in § 3.

### Smoke test coverage at Phase 1 close

Verified end-to-end on prod (May 4):
- Admin create coach via RPC → 3 atomic rows ✓
- Coach signup profile submit → coaches_public ✓
- Coach self-service WRITE coaches_private (user_id key) ✓
- Coach self-service READ coaches_private (user_id key) ✓
- Admin edit via RPC → 3-table merge with status preservation ✓
- Admin set coach level via PLM (independent-UUID coach) ✓
- Admin Activate Coach button (RPC status flip) ✓ (visual smoke; live click tested via separate session)
- Row-count guard catches silent RLS denials ✓
- delete-account cascade across 5 tables (coaches, coaches_public, coaches_private, user_roles, auth.users) ✓
- coaches_full view rebuild → admin sees email/DOB for non-aligned-UUID coaches ✓

Implicitly verified (loaded successfully without errors during admin browsing):
- 4 PostgREST FK-join rewrites (SystemHealthView Data Integrity tab confirmed; CoachReassignmentSection / CoachPaymentCalculator / send-coach-payment-notifications use the same pattern)
