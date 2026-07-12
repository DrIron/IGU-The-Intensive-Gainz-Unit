# Capacity v2 + coach-system cleanup

**Status:** Build handoff (2026-07-04, Cowork). **Owner:** terminal. Cowork verifies on prod.
From `docs/COACH_SYSTEM_REVIEW.md` decisions (Hasan). Two parts: (1) **Capacity v2** — the real feature; (2) **clear-win cleanup** — dead code/schema + doc fixes. Specialist parity is a separate spec.

---

## Part 1 — Capacity v2

### Today (grounded)
Real capacity lives in **`coach_service_limits(id, coach_id, service_id, max_clients)`** — admin-only, set via `CoachServiceLimits.tsx` (a dialog off `CoachManagement`; "0 = unlimited"), delete-all-then-insert on save. Consumed by onboarding matching (`CoachPreferenceSection` `available_spots`) + `coachMatching.ts`; shown to the coach via `EnhancedCapacityCard` (verify: display-only today). The `coaches_public.max_onetoone_clients/max_team_clients` columns are a **dead duplicate** (0 rows set) — dropped in Part 2.

### Target
Per `(coach, service)`: an **admin ceiling**, a **coach self-set cap at or below it**, and a **coach open/close toggle**. "Provided services" = services the coach has opened.

### Schema — migration `..._capacity_v2.sql`
Extend `coach_service_limits`:
- Keep `max_clients` as the **admin ceiling** (rename to `admin_max_clients` for clarity, or keep name + comment). `0` still = unlimited ceiling.
- Add `coach_max_clients int NULL` — coach's own cap; effective cap = `LEAST(NULLIF(admin ceiling,0)…, coach_max_clients)` treating 0/NULL as "no limit on that side".
- Add `is_accepting boolean NOT NULL DEFAULT true` — coach open/close for this service.
- Add `UNIQUE(coach_id, service_id)` (there's none today — the admin save does delete+insert; v2 needs stable rows so coach + admin fields don't clobber each other). **Change the admin save (`CoachServiceLimits.handleSave`) from delete-all+insert to upsert on `(coach_id, service_id)`, writing only `admin_max_clients`.**

### RLS + coach write path
RLS can't do column-level, so give the coach a SECURITY DEFINER RPC (not direct UPDATE):
```
set_coach_service_availability(p_service_id uuid, p_coach_max_clients int, p_is_accepting boolean)
```
- Auth: `auth.uid()` is a coach; upserts the `(auth.uid(), p_service_id)` row's `coach_max_clients` + `is_accepting` ONLY.
- **Enforce `p_coach_max_clients <= admin ceiling`** (when ceiling > 0); reject otherwise (can't raise above admin).
- Never lets the coach touch `admin_max_clients`. REVOKE PUBLIC/anon; GRANT authenticated.
- Admin keeps writing `admin_max_clients` via `CoachServiceLimits` (admin RLS/existing path).

### Coach UI — profile-management page
Add a **"Services & availability"** section to the coach's profile page (extend `EnhancedCapacityCard` to editable, or a new section in `CoachProfile`): list each service, show the admin ceiling, let the coach set their own cap (`<=` ceiling, client-validated + server-enforced) and toggle **Open / Closed** per service. Calls `set_coach_service_availability`. Show current load ("6 / 10 clients").

### Enforcement (matching + assignment)
- `available_spots` / `coachMatching.ts`: a coach is offered for a service **iff `is_accepting = true` AND current_clients < effective_cap** (effective_cap = min of admin + coach caps, 0/NULL = unlimited on that side). Closed or full → not offered / shown unavailable in `CoachPreferenceSection`.
- The assignment path (admin assign / onboarding) should respect the same (don't assign to a closed/full service). Reuse the existing capacity check point; extend it with `is_accepting` + coach cap.

### Verify (Cowork)
- Admin sets a ceiling of e.g. 10 for a service; coach (in profile) sets their cap to 6 and closes another service.
- Onboarding coach-selection: the closed service's coach isn't offered; a coach at their effective cap shows full.
- RLS/RPC: coach setting `coach_max_clients` above the admin ceiling → rejected; coach can't change `admin_max_clients`.
- Admin save no longer wipes coach-set fields (upsert, not delete+insert).

---

> **SPLIT DECISION (Hasan, 2026-07-04):** ship **Part 1 (the capacity feature)** + the **safe/additive cleanups** now; **defer the destructive DROPs** to the coach 3-table column-ownership refactor's DROP phase so they don't race it.
> - **NOW (safe):** #3 remove `@deprecated COACH_RATES`/`DIETITIAN_RATES` constants, #5 surface `head_coach_specialisation`, #6 fix stale docs.
> - **DEFERRED (destructive DROPs — ride the coach refactor):** #1 drop `coaches_public.max_*_clients`, #2 drop `professional_levels` + `service_hour_estimates` (with the `ProfessionalLevelManager` repoint first), #4 drop `coaches_public.specialties`.

## Part 2 — Clear-win cleanup (no product downside)

1. **Drop the dead duplicate capacity columns**: `coaches_public.max_onetoone_clients`, `max_team_clients` (0 usage; real capacity is `coach_service_limits`). Sequence with the coach 3-table refactor DROP phase (CLAUDE.md "Coach data — column-ownership refactor") to avoid churn — flag if the refactor is mid-soak.
2. **Drop dead hourly-era tables**: `professional_levels`, `service_hour_estimates` (seeded Feb-2026; flat payout model superseded them). **DEPENDENCY (verified 2026-07-04):** `professional_levels` DOES have a live reader — `ProfessionalLevelManager.tsx` (mounted in `CoachManagement.tsx:938` + `admin/PricingPayoutsPage.tsx:148`) reads it for an hourly-rate reference display. Before the DROP, **repoint that component off `professional_levels`** (show the flat `coach_payout_rates` instead, or remove the stale hourly-reference section). `service_hour_estimates` has no reader. Don't drop until the component no longer reads the table.
3. **Remove `@deprecated` constants** `COACH_RATES` / `DIETITIAN_RATES` from `src/auth/roles.ts` (not imported anywhere).
4. **Drop unused `coaches_public.specialties`** (enum array, 0 coaches). `specializations[]` (tag-based) is the real field. (Leave any `care_team_assignments` specialty descriptor — different column.)
5. **Surface `head_coach_specialisation`**: render it on the coach card / Meet Our Team + `CoachDetailDialog` when `is_head_coach` (e.g. "Head Coach -- Hypertrophy"). It's already in `coaches_directory`; just display it. (Use `--`, not `—`.)
6. **Fix stale docs**: `CLAUDE.md §5b` (tiers are flat per-client, NOT "hourly"; level DOES drive client price via `service_level_pricing`/`CLIENT_PRICE_PER_LEVEL`) + the `roles.ts:291` comment ("levels affect payout, NOT client pricing" is false now).

### Verify (Part 2)
- Post-drop, app unaffected (grep confirms no readers of dropped tables/columns/constants); tsc/build clean.
- Head-coach specialisation shows on the team page for head coaches.
- CLAUDE.md/roles.ts no longer contradict the live pricing/payout model.

## Sequencing note
Part 1 (Capacity v2) is additive + shippable now. Part 2 drops are destructive — stage them and confirm the coach 3-table refactor isn't mid-DROP; the `max_*_clients` column drop especially should ride that refactor's DROP migration, not race it.
