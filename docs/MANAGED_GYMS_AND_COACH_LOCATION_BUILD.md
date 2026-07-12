# Managed gyms + coach location matching

**Status:** Build handoff (2026-07-07, Cowork). **Owner:** terminal CC. Cowork verifies on prod.
**Why:** the onboarding "Preferred gym" list is **hardcoded** in `ServiceSpecificStep.tsx:362-365` (Oxygen Jabriya / Oxygen Subah AlSalem / Spark Shuwaikh / Other). Adding a gym is a code change + deploy; no admin screen; coaches don't contribute. This makes gyms a **managed vocabulary** (mirroring `specialization_tags`) and lets coaches tag which gyms they train at, so In-Person/Hybrid clients get **location-based coach matching** — the same shape as the coach-expertise-tag fix, for place.

Pattern to mirror throughout: `specialization_tags` + `SpecializationTagManager` (admin) + `SpecializationTagPicker` (coach) + `useSpecializationTags` (read) + `list_active_coaches_for_service` (client-safe matching RPC).

## 1. DB — new tables (migration)
```sql
gyms (
  id uuid pk default gen_random_uuid(),
  name text not null,
  area text,                       -- e.g. "Jabriya", "Shuwaikh"
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz default now(), updated_at timestamptz default now()
)
coach_gyms (                       -- which gyms a coach trains at (many-to-many)
  coach_user_id uuid not null,     -- = coaches.user_id (join on user_id, per the coach-table rules)
  gym_id uuid not null references gyms(id) on delete cascade,
  primary key (coach_user_id, gym_id)
)
```
- Seed `gyms` with the 3 existing gyms (+ areas). Do NOT seed "Other" — that stays a UI free-text escape hatch, not a row.
- **RLS:** `gyms` — `anon, authenticated` SELECT (onboarding reads it, same as `specialization_tags`), admin write. `coach_gyms` — coach manages their own rows (`coach_user_id = auth.uid()`), admin all; client-safe read only via the matching RPC (§4), not direct.
- Follow the SECURITY DEFINER REVOKE pattern for any new RPC (REVOKE anon/PUBLIC, GRANT the intended role).

## 2. Admin — gym manager
New `src/components/admin/GymManager.tsx`, mirroring `SpecializationTagManager.tsx`: list gyms, add (name + area), toggle `is_active`, reorder. Wire it into the admin surface next to the specialization-tag manager. Writes `gyms` directly (admin RLS).

## 3. Coach profile — "gyms I train at" picker
In `CoachProfile.tsx` (and `SpecialistProfile.tsx` if relevant), add a gym multi-select **only meaningful for coaches who do in-person/hybrid** — a `GymPicker` component modeled on `SpecializationTagPicker` (fetch active `gyms`, toggle pills, store selected `gym_id`s). Save to `coach_gyms` (delete-then-insert the set, or upsert/diff). Keep it optional (online-only coaches select none).

## 4. Onboarding — read gyms from the table + matching
- `ServiceSpecificStep.tsx`: replace the 4 hardcoded `<SelectItem>`s with active `gyms` fetched via a small `useGyms()` hook (mirror `useSpecializationTags`), rendered as the redesign's segmented cards. **Keep the "Other" option** + the existing `other_gym_location` free-text branch. Store the selected `gym_id` (not the name string) going forward; keep accepting the legacy name string on read for old submissions.
- **Location match (In-Person / Hybrid only):** extend `list_active_coaches_for_service(p_service_id)` → add optional `p_gym_id uuid default null`. When provided, the RPC joins `coach_gyms` and returns a `gym_match boolean` (or ranks gym-matched coaches first). The coach step then shows a "Trains at your gym" badge (same treatment as "★ Top match") and sorts gym-matched coaches to the top. For Online/Team, pass null → unchanged behavior.
- `CoachPreferenceSection` sort key becomes: gym match (in-person/hybrid) → focus-area score → available spots.

## 5. Backfill
Data-only migration: map existing `subscriptions`/`form_submissions` `preferred_gym_location` **name strings** to the seeded `gyms.id` where they match ("Oxygen Jabriya" → its row); leave "other"/free-text as-is (they keep the `other_gym_location` text). Log unmapped values. Idempotent.

## 6. Out of scope / notes
- Don't over-model gym address/hours now — name + area is enough for matching + display.
- Coach capacity is still per-service (`max_*_clients`), independent of gym; gym only affects match ordering, not capacity.
- Ties into the `CHANGE_PLAN_BILLING_ANALYSIS` coach-continuity rule: on an Online→In-Person change, gym match becomes relevant to whether the current coach can carry over.

## Verify (Cowork, prod)
- Admin can add a gym → it appears in onboarding's Preferred-gym list without a deploy.
- A coach can select gyms on their profile → persists to `coach_gyms`.
- An In-Person/Hybrid onboarding: picking a gym surfaces "Trains at your gym" coaches first with a badge; Online/Team unaffected.
- "Other" still captures free-text.
- Backfill: existing clients' gym strings resolve to gym rows (or remain as free-text). tsc/lint/build clean; new RPC anon-denied per the REVOKE check.
