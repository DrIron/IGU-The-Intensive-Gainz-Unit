# Specialist parity — bring non-coach professionals to coach quality (dietitian first)

**Status:** Build handoff (2026-07-04, Cowork). **Owner:** terminal. Cowork verifies on prod.
From `docs/COACH_SYSTEM_REVIEW.md` decision B (Hasan): keep all 5 subroles; **coaches got a lot of redesign, the non-coach specialists got almost none.** Bring specialists to parity across **4 pillars** (all chosen): apply flow, role-grant/approval, self-service profile page, client-facing presence. **Sequence: dietitian end-to-end first (the one real non-coach role), then generalize** the framework to physio / sports_psych / mobility by parameterizing on subrole.

## Current state (dietitian)
- **Added ad-hoc:** a coach adds a specialist to a client's care team via `AddSpecialistDialog`; a user requests the dietitian subrole via `SubroleRequestForm` → admin approves in `SubroleApprovalQueue`. There is **no "apply as a dietitian" application flow** and **no account-provisioning parity** with coaches (`create-coach-account` is coach-only).
- **Data:** `dietitians` table (dietitian-specific), `user_subroles` (dietitian approved), `staff_professional_info` (level). No coach-style public profile.
- **Surfaces:** `DietitianMyClientsPage` (their clients). Client-facing: appears on care-team surfaces (`CareTeamCard`, care-team messages) for assigned clients. **No self-service profile page** (`CoachProfile` is coach-only).

## Decision to make BEFORE Pillar 3 (flag for Hasan): professional profile data model
Professionals are split today — coaches (`coaches_public`/`coaches_private`), dietitians (`dietitians`), levels (`staff_professional_info`). Two ways to give specialists a profile:
- **(A, recommended for now) Extend the existing per-role store** (`dietitians` + `staff_professional_info`) with the coach-parity profile fields (bio, qualifications, specializations, picture, socials). Fastest; dietitian-first; no collision with the in-flight coach 3-table refactor. Generalize per role.
- **(B) Unify into one `professional_profiles` model** for all roles (coach + specialists). Cleaner long-term, but a large refactor that **collides with the coach column-ownership refactor** (CLAUDE.md) — do NOT start mid-soak.
Recommend **A now, B as a later consolidation** (note in `FOR_LATER`). The pillars below assume A. **DECIDED (Hasan, 2026-07-04): model A** — extend the per-role tables; do NOT start the unified `professional_profiles` refactor (B → FOR_LATER).

---

## Pillar 1 — Apply / application flow
Mirror the coach application path (`coach_applications` + `CoachApplicationsManager`) for specialists.
- **Table** `specialist_applications` (or generalize `coach_applications` with a `subrole_slug` column — recommend generalize to avoid a parallel table): name, email, `subrole_slug`, qualifications/credentials, credential doc URL, status (pending/approved/rejected), notes.
- **Public/invited apply form** ("Apply as a dietitian" — later parameterized by subrole) → inserts a pending application. Turnstile + rate-limit (parity with coach apply; see the access-hardening spec's P2 note).
- **Admin review queue** (parity with `CoachApplicationsManager`): list pending specialist applications, approve/reject with notes.

## Pillar 2 — Role-grant / approval upgrade
On admin approval, **provision the specialist properly** (parity with `create-coach-account`):
- Edge fn `create-specialist-account` (or generalize `create-coach-account` with a `subrole_slug` param): create/attach auth user + profile, insert the profile store row (per model A), insert `user_subroles` row **approved/active**, set `staff_professional_info` level (default junior), send the setup/invite email (reuse the coach invite template + `@mail.theigu.com`, `--` not `—`).
- Clean status flow: application `pending → approved`; subrole `pending → approved → active`. Notify the applicant.
- Retire/round-trip the ad-hoc `SubroleRequestForm` path into this (or keep it for an existing-coach adding a second subrole, but the *new-specialist* path goes through the application flow).

## Pillar 3 — Self-service profile page
A specialist profile-management page at parity with `CoachProfile` (reuse its components/patterns; don't fork wholesale):
- Fields the specialist edits: display name/nickname, bio, short_bio, qualifications[], specializations[] (from the same `specialization_tags` admin list), picture, socials, location. Level shown read-only (admin-set).
- Route e.g. `/specialist/profile` (or role-aware `/coach/profile` that adapts by subrole). Gate to users with an approved specialist subrole.
- Storage: per model A, write to the extended `dietitians`/store row.

## Pillar 4 — Client-facing presence
Where a client sees their specialist (dietitians are care-team, not the Meet-Our-Team shopfront unless Hasan wants):
- Render the specialist's profile (name, picture, bio, credentials, specializations) on the **care-team surfaces for their assigned clients** — extend `CareTeamCard` / the client's care-team view to show a proper specialist profile card (today it's thin).
- Optional (confirm with Hasan): whether dietitians also appear on a public directory / Meet Our Team. Default: **no** — specialists are care-team-scoped, coaches are the public shopfront.

---

## Build slices (dietitian first)
1. **S1 — data model (A):** extend `dietitians` + `staff_professional_info` with coach-parity profile fields + RLS (specialist self-edit own row; admin all; assigned clients read the client-safe subset). 
2. **S2 — apply flow:** generalize `coach_applications` (+`subrole_slug`) + apply form + admin queue.
3. **S3 — role-grant:** `create-specialist-account` provisioning + status/notify.
4. **S4 — profile page:** specialist `CoachProfile`-parity page.
5. **S5 — client presence:** care-team profile card.
6. **Generalize:** parameterize S2–S4 on `subrole_slug` so physio/sports_psych/mobility reuse the same framework (their approval + profile + client presence come "for free"; per-role client-surface wiring as needed).

## Verify (Cowork, per slice)
- Apply → an applicant submits a dietitian application → lands in the admin queue; approve → account provisioned, subrole active, invite email sent.
- The new dietitian signs in → has a profile-management page at coach parity; edits persist; RLS blocks editing others.
- An assigned client sees the dietitian's proper profile on their care-team view; a non-assigned client does not; clients can't read specialist PII.
- Generalization: repeating the apply→approve→profile flow for a physio works with no per-role code beyond surface wiring.
- tsc/build clean; Sentry quiet.

## Coordination / flags
- **Model decision (A vs B) is owed before S1** — recommend A. B (unified professional profiles) → `FOR_LATER`.
- Don't collide with the coach 3-table column-ownership refactor (CLAUDE.md) — model A avoids it.
- Reuse: `specialization_tags`, `CoachProfile` components, the coach invite email, `CoachApplicationsManager` patterns — parameterize, don't fork.
- The dietitian subrole already drives care-team + payout; keep that intact.
