# P0 — onboarding submit is broken (sync_form_submissions_safe unqualified refs)

**Status:** P0 launch-blocker (found 2026-07-07, Cowork). **Owner:** terminal CC (migration). Cowork verifies.

## Impact
**No client can complete onboarding.** Any `INSERT`/`UPDATE`/`DELETE` on `public.form_submissions` fails with:
```
ERROR: 42P01: relation "form_submissions_safe" does not exist
CONTEXT: PL/pgSQL function public.sync_form_submissions_safe() line 4
```
`submit-onboarding` inserts into `form_submissions` → this AFTER trigger fires → error → the submit fails server-side. It affects **new and reactivating** clients alike.

**Why it's latent / undetected:** waitlist mode has blocked public signups — the entire `form_submissions` table has **1 row, from 2026-02-09**. The bug was introduced later (the ~June search-path hardening sweep, cf. `feedback_supabase_default_grants_to_anon` / PR #132 era), so nothing has exercised the insert path since. **The day the waitlist lifts, the first onboarding submit fails.** (Also blocks Cowork's Part C reactivation test, which is how it surfaced.)

## Root cause
`public.sync_form_submissions_safe()` is `SECURITY DEFINER` with `SET search_path TO ''` (empty — good security practice), **but its body references `form_submissions_safe` UNqualified** in all three branches:
```
INSERT INTO form_submissions_safe (...)     -- line 4
UPDATE form_submissions_safe SET ...        -- UPDATE branch
DELETE FROM form_submissions_safe ...        -- DELETE branch
```
With `search_path=''`, an unqualified relation can't resolve → "does not exist". `public.form_submissions_safe` **does exist** (verified — it's a real table); it just isn't reachable without the schema qualifier. Classic "set search_path='' then forgot to schema-qualify the body" gotcha.

## Fix (migration — CREATE OR REPLACE)
Re-create `public.sync_form_submissions_safe()` **identical except** schema-qualify all three references to **`public.form_submissions_safe`** (INSERT, UPDATE, DELETE branches). Keep `SET search_path TO ''` (don't relax it — qualify the refs instead). No other body changes. New migration file `supabase/migrations/YYYYMMDDHHMMSS_fix_sync_form_submissions_safe_qualify.sql`.

## Broader audit (do alongside)
The same sweep set `search_path=''` on many functions. **Any SECURITY DEFINER function with `search_path=''` that references a relation/type unqualified in its body has the same latent bug.** Quick scan:
```sql
SELECT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
  AND 'search_path=' = ANY(p.proconfig)  -- or proconfig @> array['search_path=""']
  AND pg_get_functiondef(p.oid) ~* '(INSERT INTO|UPDATE|DELETE FROM|FROM)\s+[a-z_]+\b'  -- crude: flags bodies with unqualified DML
ORDER BY 1;
```
Prioritize trigger functions on hot write paths (onboarding, subscriptions, payments, coach/nutrition). Cowork can help triage the list.

## Verify (Cowork, prod, after the migration)
- A raw `INSERT INTO public.form_submissions (...)` (with the PHI email + NOT NULL cols) **succeeds** and a matching row appears in `public.form_submissions_safe`. (Cowork will run this — it also unblocks the Part C reactivation test.)
- UPDATE + DELETE on a `form_submissions` row also succeed (trigger's other branches).
- Then the deferred Part C reactivation walk proceeds.
