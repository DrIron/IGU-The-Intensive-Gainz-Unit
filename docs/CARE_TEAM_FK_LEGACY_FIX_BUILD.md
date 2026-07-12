# Care-team assignment blocked by leftover `profiles_legacy` FKs

**Status:** Build handoff (2026-07-05, Cowork verify). **Owner:** terminal (migration). Cowork re-verifies on prod.
**Severity:** Real prod blocker for specialist parity Pillar 4 / care-team assignment. Found while seeding the Phase-3 client-presence verify (dietitian → +online).

## Symptom
Inserting a `care_team_assignments` row for a properly-provisioned specialist fails:
```
ERROR: 23503 insert or update on table "care_team_assignments" violates foreign key
constraint "care_team_assignments_staff_user_id_fkey"
DETAIL: Key (staff_user_id)=(ef97717a-…) is not present in table "profiles_legacy".
```

## Root cause — duplicate, conflicting FKs
`care_team_assignments` carries **two** FKs each on `staff_user_id` and `client_id` (verified on prod):

| Column | FK name | References |
|---|---|---|
| `staff_user_id` | `care_team_assignments_staff_user_id_fkey` | **`profiles_legacy(id)`** ON DELETE CASCADE ← wrong |
| `staff_user_id` | `care_team_assignments_staff_profiles_public_fk` | `profiles_public(id)` ← correct |
| `client_id` | `care_team_assignments_client_id_fkey` | **`profiles_legacy(id)`** ON DELETE CASCADE ← wrong |
| `client_id` | `care_team_assignments_client_profiles_public_fk` | `profiles_public(id)` ← correct |
| `added_by` | `care_team_assignments_added_by_fkey` | **`profiles_legacy(id)`** ← wrong |

An insert must satisfy **both** FKs on a column. The `profiles_public` FKs were added to repoint the table, but the old `profiles_legacy` FKs were never dropped.

`profiles_legacy` is populated by the **client-onboarding** path only. Staff/admin provisioned through the admin edge-fn path (coaches via `create-coach-account`, dietitians via `create-specialist-account`, admins) land in `profiles_public` but **not** `profiles_legacy`. So the leftover legacy FK on `staff_user_id` blocks every properly-provisioned specialist from being added to a care team. (`client_id` is latently affected too — only survives because all real clients happen to be in `profiles_legacy`.)

**Corroboration:** `care_team_assignments` has **0 rows** on prod — this path has never successfully written for a profiles_public-only staff member.

## Fix — migration `..._care_team_drop_legacy_fks.sql`
Drop the three redundant legacy FKs; keep the `profiles_public` ones. Repoint `added_by` to `profiles_public` (or `auth.users`) for parity with `ended_by` (which already → `auth.users`).

```sql
ALTER TABLE public.care_team_assignments
  DROP CONSTRAINT IF EXISTS care_team_assignments_staff_user_id_fkey,
  DROP CONSTRAINT IF EXISTS care_team_assignments_client_id_fkey,
  DROP CONSTRAINT IF EXISTS care_team_assignments_added_by_fkey;

-- added_by had no profiles_public replacement; add one (nullable, SET NULL on delete)
ALTER TABLE public.care_team_assignments
  ADD CONSTRAINT care_team_assignments_added_by_public_fk
  FOREIGN KEY (added_by) REFERENCES public.profiles_public(id) ON DELETE SET NULL;
```

Notes:
- Keep `ON DELETE CASCADE` semantics via the surviving `profiles_public` FKs? They currently have **no** ON DELETE action. If cascade-on-client-delete is desired (it was on the legacy FK), add it to `care_team_assignments_client_profiles_public_fk` — but confirm intent; `delete-account` cascade behavior is CLAUDE.md-sensitive. Recommend: match prior behavior (client delete cascades the care-team rows) by recreating the client FK with `ON DELETE CASCADE`, and leave staff as RESTRICT (don't silently drop assignments if a staff row is deleted — surface it).
- This does **not** touch `subscriptions_user_id_fkey → profiles_legacy` (separate, documented quirk); scope only `care_team_assignments`.

## Verify (Cowork, prod, after migration)
1. Re-run the seed: insert a `dietitian` `care_team_assignments` row (client `4331fa4f` +online, staff `ef97717a`, subscription `edcf7faa`) → succeeds.
2. Client +online signs in → **My Care Team** shows the dietitian's real profile card (via `dietitians_client_safe`, gated on the assignment).
3. A non-assigned client does not see the dietitian.
4. `AddSpecialistDialog` (coach UI) can add a specialist end-to-end without FK error.
5. tsc/build clean; no drift (migration is the only DDL).

## Coordination
- Cowork can't push migrations/git — terminal owns this. Out-of-band `execute_sql` DDL would create migration drift (known landmine), so **don't** fix it that way.
- After this lands, Cowork seeds the assignment and completes specialist-parity **Phase 3** client-presence verify (the reason this was found).

---

## Follow-up blocker (2026-07-05) — `auto_create_addon_modules` trips the `coaches` FK

The FK fix above shipped (migration `20260705200000`, merge `45f0807`) and is Cowork-verified: each of `staff_user_id`/`client_id`/`added_by` now has exactly one FK → `profiles_public`. But the seed then trips a second, distinct blocker:

`AFTER INSERT` trigger `trg_auto_create_addon_modules` → `auto_create_addon_modules()` creates a `client_day_modules` row per future program day with `module_owner_coach_id = NEW.staff_user_id`, `module_type = specialty`, title `"<Specialty> Session"`. That column FKs `coaches(user_id)` RESTRICT. A **pure dietitian** (specialist-parity containment: `app_role=coach` + subrole, no `coaches` row) isn't in `coaches` → `23503 client_day_modules_module_owner_coach_id_fkey`. The +online client (`4331fa4f`) has 2 active programs, so the seed fires it.

**Decision (Hasan, 2026-07-05): scoped-B — skip nutrition specialties.**
Gate the module-creation loop in `auto_create_addon_modules()` to fire only when `NEW.specialty NOT IN ('nutrition','dietitian')`.

Why not the alternatives:
- **Gate on `is_billable`/`addon_id`: impossible.** `link_addon_to_care_team()` (trigger on `subscription_addons`) sets those on a *later* insert, so they're `false`/`NULL` when `auto_create_addon_modules` fires on the care-team insert. Gating on them would break legit add-on module creation.
- **Repoint `client_day_modules.module_owner_coach_id → profiles_public`:** unblocks, but creates "Dietitian Session" entries on the workout calendar and risks blank owner in any UI that joins the owner to `coaches`. Nutrition work belongs in the Nutrition section, not the workout board — so the module shouldn't exist at all.
- **Skip `'dietitian'` only:** leaves `'nutrition'` (coach nutrition focus) still creating a workout module — inconsistent.

Specialty enum (for the fix): `nutrition, lifestyle, bodybuilding, powerlifting, running, calisthenics, mobility, physiotherapy, dietitian`. Only `nutrition` + `dietitian` are nutrition roles; the rest are training specialties that legitimately produce session-modules.

**Flag for S6 (physio/sports_psych/mobility generalization, not built):** when those are provisioned as *pure* specialists they legitimately run sessions (should produce day-modules) but also won't be in `coaches` → they'll trip the same FK. At that point repoint `client_day_modules.module_owner_coach_id → profiles_public`. Not needed now (dietitian-only scope).

### Verify (Cowork, after the trigger fix)
1. Seed the `dietitian` assignment (client `4331fa4f`, staff `ef97717a`, sub `edcf7faa`) → succeeds, **no** `client_day_modules` rows created for it.
2. A training-specialty assignment (e.g. `physiotherapy`) with a coach-backed staff still creates its day-modules (regression check).
3. +online signs in → **My Care Team** shows the dietitian's real profile card.
