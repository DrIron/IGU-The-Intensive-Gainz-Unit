# Coach & Admin system — review + simplification proposal

**Status:** Review/proposal (2026-07-04, Cowork). Not a build spec — decisions first, then specs. Grounded in `src/auth/roles.ts` + a prod data check (3 coaches, 2 head).

## The layered model today
A coach carries **four independent layers + a flag + capacity + a profile**, plus a compensation engine:
1. **Core role** — admin / coach / client (route access).
2. **Subrole** (admin-approved credential) — coach, dietitian, physiotherapist, sports_psychologist, mobility_coach — with a request→approve workflow (`user_subroles`, `SubroleRequestForm`, `SubroleApprovalQueue`).
3. **Level** — junior / senior / lead (admin-assigned; drives payout **and** now client price).
4. **Tags** — `specialization_tags` (admin-managed reference list the coach picks from → `specializations`).
5. **Head Coach** flag (+ `head_coach_specialisation`) — team-plan leadership, flat payout.
6. **Capacity** — `max_onetoone_clients`, `max_team_clients`.
7. **Profile fields** — `bio`, `short_bio`, `qualifications[]`, `specializations[]`, `specialties[]`, socials, picture, location, `display_name`, `nickname`.
8. **Compensation** — flat per-client model: `coach_payout_rates`, `service_level_pricing`, `igu_operations_costs`, `calculate_subscription_payout`, admin `LevelPricingManager`. (Plus dead hourly-era tables.)

## Prod reality (2026-07-04) — what's actually used
| Layer / field | Prod state | Verdict |
|---|---|---|
| Subroles | `coach` ×3, `dietitian` ×1; physio / sports_psych / mobility = **0 ever** | 3 subroles are pure scaffolding |
| Capacity `max_*_clients` | **0 coaches set**, no admin UI, no enforcement in assignment | dead |
| `specialties` (enum col) | **0 coaches** | dead on coaches (only a care-team dietitian descriptor elsewhere) |
| `head_coach_specialisation` | filled for both head coaches, **not shown to clients** | stored-but-invisible |
| `coach_level` | 1 junior / 2 senior / 0 lead | **used** (pricing + payout) |
| `specializations`, `qualifications`, `bio/short_bio` | filled ×2, shown on Meet Our Team / coach card | **used** |
| Flat payout tables + `LevelPricingManager` | live in `calculate_subscription_payout` | **used** |
| Hourly tables `professional_levels`, `service_hour_estimates` | seeded Feb-2026, **never read** (flat model superseded) | stale |
| `COACH_RATES` / `DIETITIAN_RATES` consts (`roles.ts:352/359`) | `@deprecated`, not imported | stale |

## Clear wins — trims with no product downside (recommend just doing)
1. **Delete the hourly-era leftovers**: drop tables `professional_levels` + `service_hour_estimates` (unread); remove `COACH_RATES` / `DIETITIAN_RATES` deprecated constants from `roles.ts`. Pure dead-code/schema cleanup.
2. **Drop `coaches_public.specialties`** (enum array, 0 usage on coaches) — `specializations[]` (tag-based) is the real one. (Keep the care-team specialty descriptor if it lives on `care_team_assignments`; this is only the coaches column.)
3. **Fix the stale docs**: `CLAUDE.md §5b` still says tiers are "hourly" and "levels affect payout, NOT client pricing" — both false now (flat per-client payout; `CLIENT_PRICE_PER_LEVEL`/`service_level_pricing` price **by level**). Update CLAUDE.md + the `roles.ts:291` comment.

## Decision forks — need your call (product, not cleanup)

### A. Capacity (`max_onetoone_clients` / `max_team_clients`)
Currently a phantom: columns exist, nothing sets or enforces them. Two honest options — **(1) drop it** (simplest; coaches have no cap), or **(2) actually build it** (admin sets a per-coach cap + the assignment/roster flow blocks/ warns at capacity). Half-built is the worst state. Given you flagged "capacity" as bugging you and it's 100% unused, **recommend drop** unless you want real load-balancing soon.

### B. The 3 aspirational subroles (physio / sports_psych / mobility_coach)
Full request→approve UI exists but there's **no** assign-to-client or payout path, and **zero** have ever been used. **Recommend retire now** — remove them from `subrole_definitions` seeds + the request form, leaving **coach + dietitian** (the two real ones). Keeps the subrole system but stops presenting empty credential types. (Re-add later if you build multidisciplinary care — it's in the same machinery.)

### C. `head_coach_specialisation`
Filled for both head coaches but shown nowhere client-facing. Either **surface it** (a line on the coach card / Meet Our Team, e.g. "Head Coach — Hypertrophy") or **drop it**. Recommend **surface** (it's real content the head coaches already wrote) — cheap win for the profile.

### D. How much should admin actively manage?
You said "admin should approve coaches." Admin today also sets level, head-coach, tags, and all pricing/payout. After A+B, the admin coach surface shrinks to: **approve/create coach → set level → toggle head coach → (pricing via LevelPricingManager)**. That's a clean, minimal admin job. Question: keep pricing/payout admin-editable (`LevelPricingManager`), or freeze it to code defaults and remove the admin UI? Recommend **keep** (you'll want to tune prices without a deploy).

## Proposed simplified coach model (after trims)
- **Admin sets:** approval (create coach), `coach_level`, `is_head_coach`, `specialization_tags` (the reference list), pricing/payout (`LevelPricingManager`). Approves `dietitian` subrole.
- **Coach self-edits** (`CoachProfile`): `display_name`/`nickname`, `bio`, `short_bio`, `qualifications[]`, `specializations[]` (picked from admin tags), socials, picture, location.
- **Client sees** (via `coaches_directory` / `get_coach_for_client`): name, picture, bio/short_bio, qualifications, specializations, location, **level badge**, **Head Coach badge** (+ specialisation if C=surface). Never: email/phone/DOB/capacity/internal.

This keeps the two layers that carry real weight (level → money; specializations/qualifications → the client-facing profile + matching) and removes the three that don't (unused subroles, phantom capacity, dead hourly/`specialties` fields).

## Related / not in this review
- The `coaches` / `coaches_public` / `coaches_private` **3-table split** is a separate in-flight refactor (CLAUDE.md "Coach data — column-ownership refactor", Phase 3 pending) — real complexity but tracked elsewhere; the trims above (drop capacity/specialties columns) should be sequenced with that refactor's DROP phase.
- Future **independent/paid external coaches + "Find a Coach"** idea is parked in `docs/FOR_LATER.md` — it will re-expand the coach model (team vs independent), so keep the simplified model extensible.

## DECISIONS (Hasan, 2026-07-04) + revised plan
The review's framing was "trim"; Hasan's calls turn it into **"complete the model."**

**A. Capacity → BUILD IT (extend `coach_service_limits`), + coach self-service.** Correction to the review above: capacity is NOT phantom — `coach_service_limits(coach_id, service_id, max_clients)` is real and wired (admin `CoachServiceLimits` dialog sets it; onboarding `CoachPreferenceSection` uses `available_spots`; coach `EnhancedCapacityCard` shows it). Only the DUPLICATE `coaches_public.max_onetoone_clients/max_team_clients` columns are dead → drop those. The build:
  - Extend `coach_service_limits` per (coach, service): `admin_max_clients` (ceiling, admin-set), `coach_max_clients` (coach-set, enforced `<= admin_max_clients`), `is_open` (coach toggle — accepting new clients for this service or not).
  - **Coach self-service in their profile-management page** (this is the "we need to also update that" Hasan flagged): a capacity + availability section where the coach lowers their cap below the admin ceiling and opens/closes each service they provide.
  - **"Chosen provided services":** a service with `is_open=true` (and a cap > 0) = offered. Closed/absent = not offered.
  - **Enforcement:** onboarding matching + assignment respect `is_open` AND `current_clients < min(coach_max, admin_max)`. Coach shows as unavailable for closed/full services.
  - Verify `EnhancedCapacityCard` is display-only today; extend to editable (or add a new profile section).

**B. Subroles → KEEP all 5, and BUILD OUT the non-coach specialists to coach-parity.** Reversal of the review's "retire 3": keep physio/sports_psych/mobility as planned-for. The real gap Hasan named: **coaches got a lot of redesign love; dietitians/specialists got almost none.** Today a dietitian has `DietitianMyClientsPage` + care-team assignment + subrole approval, but **no self-service profile page, no proper apply/onboarding, and a thin role-grant path** (added ad-hoc via `AddSpecialistDialog` / `SubroleRequestForm`). This is its own workstream — **"specialist parity"**:
  - Rework **how a specialist is added / applies** and **how they receive their role** (a real application → admin approval → activation flow, not the current ad-hoc path).
  - Give specialists a **profile-management page** (parity with `CoachProfile`).
  - Give them the right **dashboard + client-facing presence** where applicable.
  - Sequence: **dietitian first** (the one real non-coach role), then generalize to the others. Scope of "parity" to confirm with Hasan.

**C. `head_coach_specialisation` → SURFACE it** on the coach card / Meet Our Team (e.g. "Head Coach -- Hypertrophy").

**D. Pricing/payout → KEEP admin-editable** (`LevelPricingManager` + DB rate tables stay source of truth).

**Still-valid clear wins (do alongside):** drop dead hourly tables (`professional_levels`, `service_hour_estimates`) + `@deprecated` `COACH_RATES`/`DIETITIAN_RATES`; drop the dead duplicate `coaches_public.max_*_clients` columns (real capacity is `coach_service_limits`); drop unused `coaches_public.specialties`; fix stale CLAUDE.md/roles.ts (flat payout not hourly; level DOES drive client price).

## Resulting build tracks (to spec after scoping)
1. **Capacity v2** — extend `coach_service_limits` (admin ceiling + coach self-cap + per-service open/close) + coach profile-page controls + matching/assignment enforcement + drop dead duplicate columns.
2. **Specialist parity** (dietitian first) — application/apply → role-grant flow, specialist profile page, dashboard, client presence.
3. **Surface HC specialisation** (small).
4. **Cleanup + doc-fix** (clear wins).

## Next step
Scope the **specialist-parity** workstream (biggest + broadest) — what "parity" includes and dietitian-first — then I spec Capacity v2 + the cleanup, and stage specialist parity.
