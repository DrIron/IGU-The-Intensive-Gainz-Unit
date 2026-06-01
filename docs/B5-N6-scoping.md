# B5-N6 scoping — `care_team_assignments.status` vs `lifecycle_status` drift

**Status: SCOPING ONLY — do not ship from this doc.** Pick Option A or B, then a follow-up PR implements + live-probes.
**Author date:** 2026-06-01. **Prod state:** `care_team_assignments` is **0 rows** today (`care_team_status` enum = `{active, scheduled_end, terminated_for_cause, ended}`; legacy `status` is `text NOT NULL DEFAULT 'active'`).

## TL;DR — this is a security bug, not cosmetic drift

The two columns are **not kept in sync by the admin lifecycle actions**:

| Writer | sets `lifecycle_status` | sets `status` |
|--------|------------------------|---------------|
| `discharge_care_team_member` (mig `20260126095746`) | `'scheduled_end'` | **untouched → stays `'active'`** |
| `terminate_care_team_member` (mig `20260126095746`) | `'terminated_for_cause'` | **untouched → stays `'active'`** |
| expiry job (`...095746` ~L274) | `'ended'` | `'removed'` |
| INSERT default | `'active'` | `'active'` |

The **authoritative RLS gatekeeper** `is_care_team_member_for_client(p_staff_uid, p_client_uid)` and the **email-fanout** edge fn both read `status = 'active'` — the column the discharge/terminate paths **leave stale**. Consequence at launch:

> A coach **terminated for cause** keeps `status = 'active'`, so `is_care_team_member_for_client` still returns `true` → they retain care-team RLS access (client PHI, nutrition, messages) **and** keep receiving `send-coach-client-message-email` notifications. Discharged (`scheduled_end`) members are *correctly* still active, so that case is benign — but `terminated_for_cause` is a real access-control hole.

0 rows today → **latent**. The first real discharge/termination after launch opens it. This raises the priority above "drift cleanup."

---

## Where each column is read (grep-derived; verify each at implementation time)

### Reads `status` (the stale one) — must move or be made authoritative
**DB (SECURITY DEFINER helpers — `supabase/migrations/20260207100001_dietitian_tables_functions.sql`):**
- `is_care_team_member_for_client` — L77 `cta.status = 'active'` — **RLS gatekeeper, referenced by many policies + edge fns. Highest blast radius.**
- `is_dietitian_for_client` — L100 `cta.status = 'active'`
- `client_has_dietitian` — L117 `cta.status = 'active'`
- `can_edit_nutrition` — L190 (via the above / direct `status`)

**DB (trigger):** `manage_care_team_relationships()` (`20260126070027` L103/116/127) — keys coach_client_relationships counter maintenance on `NEW.status`/`OLD.status`. A write-side dependency, not just a read.

**DB (policies, `status = 'active'`):** `20260116205156` "Staff can view their own assignments" (L94); plus the original care-team policy set in `20260116212134` / `20260116205156`.

**DB (verify — alias `cp.status`, may be a different table):** `get_active_care_team_for_date` (`20260126110245` L28) — confirm whether `cp` is `care_team_assignments` before counting it.

**Edge fn:** `supabase/functions/send-coach-client-message-email/index.ts:220` — `.eq("status", "active")` (client→care-team fanout).

**FE:** `src/pages/coach/DietitianMyClientsPage.tsx` — L91/98 build `assignmentByClient` from `a.status`, L209 `assignmentStatus: assignment.status`. (Comment at L77 explicitly notes it reads `status`, not `lifecycle_status`.)

### Reads `lifecycle_status` (the maintained one) — already migrated (Block 8 surface)
`src/components/coach/MyAssignmentsPanel.tsx`, `coach/CareTeamCard.tsx`, `client-overview/tabs/CareTeamTab.tsx`, `nutrition/CareTeamMessagesPanel.tsx` (this PR), `client/MyCareTeamCard.tsx`, `client/CareTeamOverviewCard.tsx`, `hooks/useNutritionPermissions.ts` (`.eq('lifecycle_status','active')` / `.in([...,'scheduled_end'])`).

### Writes `lifecycle_status`
`discharge_care_team_member`, `terminate_care_team_member`, expiry job, AddSpecialistDialog/insert paths (default).

---

## Mapping table (`status` text ↔ `lifecycle_status` enum)

| `lifecycle_status` | "is active?" (access predicate) | correct `status` | currently written `status` |
|--------------------|-------------------------------|------------------|----------------------------|
| `active`           | yes | `active`  | `active` ✅ |
| `scheduled_end`    | yes (until `active_until`) | `active` | `active` ✅ |
| `terminated_for_cause` | **no** | `removed` (or `terminated`) | **`active` ❌ BUG** |
| `ended`            | no | `removed` | `removed` ✅ (expiry job) |

- **`lifecycle_status → status` is a clean function** (`active`/`scheduled_end` → `active`; `terminated_for_cause`/`ended` → `removed`). Safe to derive.
- **`status → lifecycle_status` is NON-bijective**: `status='active'` ↦ {`active`, `scheduled_end`} and `status='removed'` ↦ {`terminated_for_cause`, `ended`}. A status-only write cannot deterministically pick a lifecycle value. **This is the flagged non-bijective case for Option B.**
- Access predicate everywhere is effectively **`lifecycle_status IN ('active','scheduled_end')`** ⟺ "member active." That is the canonical replacement for `status='active'`.

---

## Option A — Retire `status`, make `lifecycle_status` authoritative

**Migration body (sketch — implement + REVOKE-verify in the follow-up PR):**
1. `CREATE OR REPLACE` the four helpers (`is_care_team_member_for_client`, `is_dietitian_for_client`, `client_has_dietitian`, `can_edit_nutrition`) swapping `cta.status = 'active'` → `cta.lifecycle_status IN ('active','scheduled_end')`. Signatures unchanged → dependent policies need **no** edit. Keep `SECURITY DEFINER SET search_path=public`; re-assert grants per `feedback_supabase_default_grants_to_anon` (these are RLS-predicate helpers → keep `anon, authenticated` EXECUTE, do **not** revoke anon).
2. `CREATE OR REPLACE` `manage_care_team_relationships()` to key on `lifecycle_status` transitions instead of `status`. **Apply `feedback_trigger_auth_uid_null_branch`** only if it gates on `auth.uid()` (it appears to be a pure counter trigger — verify; if it does gate identity, prepend `IF auth.uid() IS NULL THEN RETURN NEW;`).
3. Recreate the `status='active'` **policies** (`20260116205156` staff-self-view etc.) on `lifecycle_status`.
4. `DROP INDEX care_team_status_idx` (on `status`); the `idx_care_team_lifecycle_status` already exists.
5. `ALTER TABLE care_team_assignments DROP COLUMN status;` — **0 rows ⇒ no backfill, no data-loss risk. The non-bijective backfill problem does not exist today** (it would if we wait until the table fills).
6. Drop the dead `status='removed'` write in the expiry job + any `status` write in insert paths.

**Edge fn:** redeploy `send-coach-client-message-email` with `.eq("lifecycle_status","active")` → `.in("lifecycle_status", ['active','scheduled_end'])`.
**FE:** `DietitianMyClientsPage.tsx` swap `a.status` → `a.lifecycle_status` (treat `IN (active,scheduled_end)` as active). One file.

**Sentinel / spec questions for Hasan:**
- `DietitianMyClientsPage` currently surfaces `assignmentStatus` to the UI as a raw string — should a `scheduled_end` dietitian show as "active" or "winding down"? (maps cleanly, but it's a display choice.)
- Confirm `get_active_care_team_for_date`'s `cp.status` is/ isn't `care_team_assignments` before touching it.

**Blast radius (redeploy/retest):** the gatekeeper function body change ripples through every policy/edge-fn that calls `is_care_team_member_for_client` (broad, but signature-stable so no policy edits). Must redeploy `send-coach-client-message-email`. Live-probe each role (anon/service-role/client/coach/dietitian/admin) against the recreated gatekeeper. No FE optimistic-UI holds a stale `status` value (the FE reads are nearly all already on `lifecycle_status`; only `DietitianMyClientsPage` reads `status`, non-optimistic).

## Option B — Keep both columns, add a BEFORE INSERT/UPDATE sync trigger

**Trigger body (sketch):**
```sql
CREATE OR REPLACE FUNCTION public.sync_care_team_status_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
BEGIN
  -- MANDATORY first branch (feedback_trigger_auth_uid_null_branch): never block
  -- service_role / migrations / cron (auth.uid() IS NULL) — they own the canonical writes.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  -- lifecycle_status is the source of truth -> derive status (clean function).
  IF TG_OP = 'INSERT' OR NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status THEN
    NEW.status := CASE
      WHEN NEW.lifecycle_status IN ('active','scheduled_end') THEN 'active'
      ELSE 'removed'
    END;
  -- status-only change: only the active case is unambiguous; anything else is non-bijective.
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'active' THEN
      NEW.lifecycle_status := 'active';
    ELSIF NEW.status = 'removed' THEN
      RAISE EXCEPTION 'Ambiguous status=removed write: set lifecycle_status (terminated_for_cause|ended) instead';
    END IF;
  END IF;

  -- Inconsistent both-set write -> reject rather than silently pick.
  IF (NEW.lifecycle_status IN ('active','scheduled_end')) <> (NEW.status = 'active') THEN
    RAISE EXCEPTION 'status/lifecycle_status inconsistent: % vs %', NEW.status, NEW.lifecycle_status;
  END IF;
  RETURN NEW;
END $fn$;
```
**Mapping:** as the table above — `lifecycle→status` bijective; `status→lifecycle` non-bijective (the `removed` case raises).

**Blast radius:** zero migrations on shipped read surfaces (both columns stay valid), no edge-fn redeploy strictly required. But: **both columns must be maintained forever**; every future writer must go through the trigger; the gatekeeper still reads the *derived* `status` (one more indirection that can rot); and the `terminated_for_cause`-still-active bug is only closed for **future** writes (existing discharge/terminate functions still don't set `status`, so they'd rely on the trigger deriving it from their `lifecycle_status` change — which this trigger does, so OK — but it enshrines the dual-column debt).

---

## Recommendation — **Option A**

1. **It closes a security hole structurally**, not just visually: the gatekeeper + email fanout move onto the column the lifecycle actions actually maintain. Option B closes the same hole but permanently keeps two columns and a trigger that must handle the non-bijective mapping forever.
2. **`feedback_complete_over_deadline`** — Hasan prefers complete structural fixes over deadline workarounds; launch can slip. Option A is the structural fix; Option B is "keep the debt, paper over it."
3. **Timing: now is the cheapest possible moment.** 0 rows ⇒ `DROP COLUMN` needs no backfill and the non-bijective `status→lifecycle` ambiguity never has to be resolved. Waiting until launch fills the table converts Option A from "drop a column" into "reconcile ambiguous historical rows" — strictly harder.
4. **Block-8 surface already leans lifecycle_status** — Option A *finishes* a migration that's ~80% done (only `DietitianMyClientsPage` + the DB helpers + one edge fn still read `status`), rather than freezing the half-migrated dual-column state.

**Cost of A:** touches the high-fan-out gatekeeper (function-body swap, signature-stable) + one edge-fn redeploy + one FE file + live-probe matrix across roles. That verification cost is the price of closing the hole correctly, and it's lower now (0 rows) than ever again.

> Decision needed from Hasan: **A or B**, plus the two sentinel/spec answers under Option A. Follow-up PR implements + live-probes; no migration is written until the choice is made.
