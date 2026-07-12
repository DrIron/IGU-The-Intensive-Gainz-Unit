# IGU — Session Handover (updated 2026-07-10; base 2026-07-05, outgoing Cowork/Opus session)

You are the **Cowork** half of a two-agent workflow. **Read this end-to-end, then `CLAUDE.md` (non-negotiable rules).** Your persistent memory (MEMORY.md + memory/ files) is current — trust it; this doc is the narrative overlay. Both this Cowork chat and the terminal Claude Code were just compacted, so this is a clean re-entry point.

## How we work (do not deviate)

- Terminal **Claude Code** BUILDS (owns git + `supabase db push` + edge-fn deploys on Hasan's Mac). **You (Cowork)** VERIFY on prod (`execute_sql`, project `ghotrbotrywonaejlppg` — the ONLY project, "test" pushes ARE prod), drive browser smokes (Claude-in-Chrome; **Hasan signs in, you drive**), write build specs. **Hasan relays paste blocks between you and CC** — write them paste-ready, no preamble.
- You **cannot** push git or run migrations. Out-of-band `execute_sql` DDL creates migration drift (known landmine) — never fix schema that way; hand CC a migration spec instead.
- **Deploy gotchas:** a merge can silently miss the Vercel prod webhook — always compare the live bundle hash (`[...document.querySelectorAll('script[src]')].map(s=>s.src).filter(u=>u.includes('index-'))[0]`) against expectations before judging a deploy. The CDN briefly serves intermediate bundles during a redeploy (saw a transient dark/light inconsistency this session that resolved on stabilize — wait + re-check, don't cry bug). Hard-reload before trusting a visual verify.
- **DB test patterns:** jwt-claims impersonation `SELECT set_config('request.jwt.claims','{"sub":"<uid>","role":"authenticated"}',true); SET LOCAL ROLE authenticated;` wrapped in `BEGIN;…ROLLBACK;` for RLS-as-a-user tests. **Admin role uid = `6a8272b5-9fc8-4341-b591-2b6d4a6d0dbd` (admin@theigu.com).** dr.ironofficial = coach-only. (Note: a duplicate `profiles_public` row `8cb0207e` shares the admin email but does NOT hold the admin role — ignore it; use `6a8272b5`.) Multi-statement SQL returns only the LAST result set — split queries.
- **Test accounts:** `dr.ironofficial+<tier>@gmail.com` (payment-exempt). `+online` (`4331fa4f`) = primary fixture (2 active programs, 2 nutrition phases, weight/bodyfat/circumference logs). Other tiers: `+team` `6bcb1bba`, `+hybrid` `9c547fb9`, `+inperson` `1612e12d`. **`hasandashti.hd` (`ce14d4f5`) is Hasan's REAL training account — never delete its logs.** Test Dietitian = `+dietitian` (`ef97717a`).

---

## MOST RECENT SESSION (2026-07-08 → 07-10, all Cowork-verified on prod)

**Onboarding + billing arc — fully shipped & verified.** Nothing mid-flight from the build side; wait for the next ticket.

- **Onboarding redesign** Parts A/B/C/E (step split · team step · reactivation "welcome back" mode · auth/email-verify seam) + visual pass — shipped/verified. Managed-gyms + coach location matching shipped. `docs/ONBOARDING_STRUCTURAL_REDESIGN_BUILD.md`, `docs/MANAGED_GYMS_AND_COACH_LOCATION_BUILD.md`.
- **P0 onboarding-submit fix (was launch-blocking):** two bugs — `sync_form_submissions_safe` search_path='' unqualified ref, AND a blind `...validatedData` spread leaking 4 non-column keys into the `form_submissions` insert. Both fixed + live-verified (real reactivation + team submits hit "You're in!"). `docs/ONBOARDING_SUBMIT_500_EDGE_FN_BUG.md`; memory `project_igu_p0_onboarding_submit_broken`.
- **Team-card selection fix** (schema-register `selected_team_id` + `useWatch`) + team-submit guard — shipped/verified.
- **Part D** — post-submit waiting states (medical-review / coach-approval / pending-payment / exempt-neutral) + payment-step redesign; dedup'd the standalone `/onboarding/*` status pages. `docs/ONBOARDING_PART_D_BUILD.md`.
- **Change-plan CP1–CP6b — COMPLETE.** Client self-serve any plan change; **scheduled model** (request now → applies at next due date); applies **on payment at the new price** (CP6a closed a free-cycle revenue leak — old code override-applied for free); Team↔1:1 both directions + Team↔Team; margin-blocked changes → admin queue (Admin→Billing "Plan changes to review", Approve→scheduled/Reject→cancelled); care-team migration on tier change; renewal-reminder new-price copy, lapse-cancels-pending-change, no-discount-carry. Specs `docs/CHANGE_PLAN_BUILD.md` + `docs/CHANGE_PLAN_CP6_PAY_TO_APPLY.md`; memory `project_igu_change_plan_build`. Key objects: `subscription_change_requests`, `migrate_subscription_links(old,new)`, `apply_subscription_change(uuid,text,boolean p_require_paid)`, `get_due_change_for_subscription(sub)`, `change-service`/`process-plan-changes` edge fns.
- **NEXT candidate:** coach-profile redesign — mockup approved (`docs/COACH_PROFILE_REDESIGN_MOCKUPS.html`), NOT yet specced into a build. Goals-step focus prefill = assessed, **no work needed** (code correct; the "0/15" was a test-account artifact).
- **Verify-note:** anything requiring a completed Tap charge (verify-payment apply-on-capture, create-tap-payment amount at the redirect) can't be fully live-exercised — stop at the checkout redirect; the underlying `apply_subscription_change` gating is SQL-proven.

---

## PRIOR SESSION (2026-07-04 → 07-05, all Cowork-verified on prod)

**Specialist parity — dietitian, S1–S5 COMPLETE + verified end-to-end.** Spec `docs/SPECIALIST_PARITY_BUILD.md` (model A — extend per-role tables). Apply → provision (`create-specialist-account`) → self-service profile → **client-facing presence** all working. Containment design: a pure specialist = `app_role=coach` + approved subrole + per-role table row, but **NO `coaches`/`coaches_public` row** (reaches /coach surfaces, stays off Meet Our Team). Client presence proven live: +online's **My Care Team** (MyCareTeamCard in `NewClientOverview`, /dashboard) renders "Test Dietitian" + role badge + spec tags, gated by `dietitians_client_safe` (RLS: assigned client sees it, non-assigned doesn't).
  - **Care-team assignment chain — 3 DB blockers, all same root cause (FKs at coach/legacy tables that exclude edge-fn-provisioned specialists), all fixed by CC + verified:** (1) legacy FKs on `care_team_assignments` dropped → each of staff/client/added_by now one FK → `profiles_public` (merge `45f0807`); (2) `auto_create_addon_modules` + (3) `manage_care_team_relationships` both gated `NEW.specialty NOT IN ('nutrition','dietitian')` — "scoped-B", Hasan's call — so nutrition roles create no workout-module / coach-relationship rows (merge `da32a17`). Full writeup + rationale: `docs/CARE_TEAM_FK_LEGACY_FIX_BUILD.md` + memory `project_igu_care_team_fk_legacy_blocker`.
  - **Live test fixture:** care_team_assignment `0362d94c` (client `4331fa4f`, staff `ef97717a`, dietitian, active). **Delete it if the fixture is no longer wanted** — otherwise leave for ongoing testing.
  - **S6 (generalize to physio/sports_psych/mobility) — ON HOLD** (Hasan deferred; recommended NOT to build speculatively pre-launch). When picked up: needs a per-role-tables + `staff_professional_info.role` migration, AND repoint BOTH `client_day_modules.module_owner_coach_id` and `coach_client_relationships.coach_id` → `profiles_public` (unlike dietitians, those roles legitimately produce session-modules + relationship records, so they take the coach path and will trip both FKs).

**Other specs written this session (CC handoffs — check which shipped):** `CAPACITY_V2_AND_COACH_CLEANUP_BUILD.md` (Part 1 capacity feature + safe cleanups now; destructive DROPs DEFERRED to the coach 3-table refactor DROP phase — don't race it), `TEAMS_MANAGEMENT_BUILD.md` (verified), `TESTIMONIALS_CLIENTS_ONLY_BUILD.md` + `TESTIMONIALS_VIEW_SUBMIT_SPLIT_BUILD.md`, `ACCESS_BOUNDARY_HARDENING_BUILD.md` (P0 subscriptions self-write hole), `COACH_EDUCATIONAL_CONTENT_PARITY_BUILD.md`, `COACH_SYSTEM_REVIEW.md` (the "it's a bit much" review that spawned capacity-v2 + specialist-parity), `THEME_TOGGLE_BUILD.md`.

**Shipped + verified:** D3 legacy-loader slice (`docs/D3_WORKOUTSESSIONV2_LEGACY_LOADER_BUILD.md`) · PUB8 public-pages flatten + BTN1 gradient-button retirement (board row PUB8 = shipped) · **Theme toggle** (dark/light, merge `07fbe90`; `ThemeProvider` + `index.html` no-flash inline script + `localStorage['igu_theme']`, default dark; flips both ways, persists across reload, IguLogo `currentColor` fix confirmed).

---

## ⛔ FOR-LATER BOUNDARY — do not touch (owned by a separate Cowork session)

A **different Cowork session** owns the for-later roadmap and has now written **full build plans** for the dietitian-dashboards + food-logging system. **Do NOT read-to-edit or modify these files** (they're another agent's working set): `docs/FOR_LATER.md`, `docs/FOOD_LOGGING_PLAN.md`, `docs/FOOD_LOGGING_MOCKUPS.html`, `docs/DIETITIAN_DASHBOARDS_PLAN.md`, `docs/DIETITIAN_DASHBOARDS_MOCKUPS.html`, `docs/COACH_PROFILE_TESTIMONIALS_PLAN.md`. Reading them for context is fine; editing is not.

**The dietitian-dashboards / food-logging BUILD is not greenlit yet.** It's high-leverage (it makes the now-proven dietitian role actually useful) but starting it is **Hasan's explicit call** — do not begin it unprompted. If Hasan greenlights it, coordinate the handoff of ownership; until then stay in your lane below.

---

## TRACK 1 — P5 canonical unification (priority burn-down)

State is in memory `project_igu_program_unification_build_plan` (trust it over any stale doc). Short version: **Drop Stage A is LIVE + sweep-verified** (app runs with no legacy program read path; canonical-only reads; D2 all-statuses history; D4 templates materialized). **D3 shipped + verified this session.** Remaining before the irreversible **Stage B** DROP (`docs/P5_LEGACY_DROP_BUILD.md`): the 58/113 legacy-keyed `exercise_set_logs` re-key decision (Hasan's call) + a clean Stage A soak. NEVER drop tables in the same PR that removed their readers. Backfill applied+verified on prod (branch `feat/p5-backfill`, NOT merged). Execution of the flip/cutover/drop is gated on Hasan's deliberate call.

## TRACK 2 — Design backlog

`docs/IGU-Design-Changes-Master.xlsx` 'Design Changes' sheet (status col J) — ~40 never-started + a few spec-ready. **Board hygiene:** scan col A for the next free ID per prefix before appending; `cell.value=None` doesn't clear — assign `.value` explicitly.
- **Spec-ready, not built:** SE1 (sessions-booking, `docs/SE-Sessions-Tab-Booking-Spec.md`), WK10 (coach-calendar, `docs/WK-Coach-Workouts-Calendar-Spec.md`), CARE1 (`docs/CT-CareTeam-Tab-Redesign-Spec.md`), PF1 (`docs/PF-Profile-Tab-Redesign-Spec.md`).
- **HX1 re-slice (small):** the shipped Estimated-1RM trend card contradicts Hasan's **NO-e1RM** decision — replace with actual logged rep-maxes (best load per rep count).
- **PUB8 shipped this session.** Remaining public/card-language items per the board.

## Small open items (non-blocking)

WK2 rest-timer wall-clock anchor (real P1 bug, spec `WK2-WK3-Workout-Logging-Spec.md`) · localStorage set-log draft + vaul `onRelease` (the one open Sentry issue, JAVASCRIPT-REACT-3) · B6 client-side session/adjustment threads (no host surface yet) + unread badges · Overview "4 days ago" vs "3d ago" rounding (cosmetic) · capacity-v2 Part-2 destructive DROPs (ride the coach-refactor DROP phase).

## Key references

`CLAUDE.md` (rules — read first) · memory `MEMORY.md` + `memory/*` (source of truth) · `docs/P5_LEGACY_DROP_BUILD.md` · `docs/PROGRAM_SYSTEM_UNIFICATION.md` · `docs/SPECIALIST_PARITY_BUILD.md` · `docs/CARE_TEAM_FK_LEGACY_FIX_BUILD.md`.

---

## Kickoff brief for the NEW terminal Claude Code (paste to it)

> You're the terminal Claude Code half of the IGU two-agent workflow (project at `/Users/HasDash/Desktop/…` or `~/Projects/intensive-gainz-unit-main` — the canonical path is `~/Projects/`). **Read `CLAUDE.md` end-to-end first** (non-negotiable rules; it overrides general best-practice). You BUILD: own git + `supabase db push` + edge-fn deploys. A Cowork agent VERIFIES on prod (Supabase `execute_sql`, project `ghotrbotrywonaejlppg` = prod) and drives browser smokes; Hasan relays paste blocks between us — keep yours paste-ready, terse, file paths as `path:line`.
> Just landed (all on `main`, verified): the full **onboarding redesign** (Parts A/B/C/E + visual pass + managed gyms), the **P0 onboarding-submit fix** (sync-trigger + blind-spread bugs), **Part D** waiting-states/payment redesign, and the **entire change-plan feature CP1–CP6b** (self-serve scheduled plan changes, apply-on-payment at new price, Team↔1:1/Team↔Team, admin queue for margin-blocked, care-team migration). Earlier: specialist-parity dietitian S1–S5 + care-team FK/trigger fix chain (`45f0807`, `da32a17`) + theme toggle (`07fbe90`) + D3 legacy-loader + PUB8/BTN1. **Nothing is mid-flight from the build side right now** — wait for the next ticket (likely the coach-profile redesign build spec from Cowork).
> Migration conventions: `supabase/migrations/YYYYMMDDHHMMSS_desc.sql`, never edit applied migrations; SECURITY DEFINER RPCs need the REVOKE-from-PUBLIC/anon + GRANT-authenticated pattern; RLS needs both coach AND team-coach policies. Don't touch `docs/FOR_LATER.md` / `FOOD_LOGGING_PLAN.md` / `DIETITIAN_DASHBOARDS_PLAN.md` / `COACH_PROFILE_TESTIMONIALS_PLAN.md` — a separate track owns those and the food-logging build isn't greenlit. On hold: S6 (generalize specialist parity) — needs a per-role-tables migration + repointing `client_day_modules.module_owner_coach_id` and `coach_client_relationships.coach_id` → `profiles_public`. Ask Hasan for the first ticket.
