# Program System Unification — Build Plan (execution)

Companion to **`PROGRAM_SYSTEM_UNIFICATION.md`** (the architecture / Direction A). That doc decides *what* the model is; this doc is the *build-ready* execution plan: concrete phases, migrations, RPC signatures, file touch-lists, verification queries, soak gates, and paste-ready kickoff prompts for a terminal Claude Code session.

> **Where each phase runs.** All P-phase *builds* belong in a terminal Claude Code session (migration/RPC/multi-file/iterative work with a tight `tsc` + dev-server loop). Cowork is for: this plan, seeding test plans/assignments, and prod verification + walkthroughs after each phase. Each phase is independently shippable behind dual-write / flags; **B4 (the editor) only needs P0.5 → P3 done**.

---

## Current standing (verified against prod 2026-06-27)

- **Architecture decided** — Direction A. One canonical hierarchy + a client override layer. See the architecture doc.
- **P0 (schema) LIVE in prod, empty.** The seven `plan*` tables come from registered migration `20260626140000_program_unification_p0_canonical_schema.sql` (in source control — *not* actually out-of-band; the earlier "out-of-band" assumption was wrong). `progression_suggestions` is **unrelated** — a legacy linear-progression suggestion table from `20260210200000_linear_progression.sql`, FK'd to `client_module_exercises`/`exercise_library`; it is suggestion *output*, not a competing plan source. **(Open Q#3 resolved.)**
- **P0.5 DONE (2026-06-27).** Live DDL matches the migration (no reproduction migration needed). RLS was already enabled on all 8 tables (coach/team-coach/admin/client), but the **client + team-coach read-via-assignment path was missing** — clients could only read `visibility='global'` plans, not a privately-assigned one (needed for P3/P4). Closed with additive SELECT policies `{plan,plan_weeks,plan_sessions,plan_slots}_read_via_assignment` in `20260627101105_plan_read_via_assignment_rls.sql` (applied to prod). Types regenerated + committed. No RPCs touch `plan*` yet, so no REVOKE/GRANT to audit.
- **Nothing is wired.** Legacy remains authoritative everywhere: `muscle_program_templates.slot_config` (board), `program_templates → program_template_days → day_modules → module_exercises → exercise_prescriptions` (meso), `client_programs → client_program_days → client_day_modules → client_module_exercises` (instances), `exercise_set_logs` (logging).
- **Confirmed gaps** (from the current-state code map):
  - Client instances are **immutable deep-copy snapshots** — no UPDATE path post-assignment (`assign_program_to_client` deep-copies into `client_*`; coach template edits don't cascade).
  - **Deload intent is recorded but never applied**: `deload_requests.approved_week_offset` / `applied_preset_id` are stored on approval but have no side effect on the client's program (`DeloadRequestPanel` literally tells the coach to apply it manually).
  - **Progression is two disjoint systems**: board weekly-deltas (`MuscleSlotData.deltaRules`, resolved by `recomputeDownstreamWeeks()`) are planning-only and **lost on conversion**; `exercise_prescriptions` progression has no auto-execution in `WorkoutSessionV2`.

**Net:** the build effectively starts at **P0.5 (reconcile the out-of-band schema)** then **P1**. Do not re-create the tables.

---

## Schema as built (reference — use these exact names)

`plan`: `id, owner_coach_id, name, description, kind, level, visibility, tags[], is_active, source_muscle_template_id, created_at, updated_at`
`plan_weeks`: `id, plan_id, week_index, label, is_deload, deload_preset_id (TEXT), created_at, updated_at`
`plan_sessions`: `id, plan_id (denormalized), plan_week_id, day_index, name, activity_type, sort_order, created_at, updated_at`
`plan_slots`: `id, plan_id, plan_session_id, exercise_id, activity_id, activity_name, section, sort_order, prescription_json, progression_rule_id, manual_override, instructions, created_at, updated_at`
`progression_rules`: `id, owner_coach_id, name, scope, rule_json, created_at, updated_at`
`client_plan_assignment`: `id, client_id, subscription_id, plan_id, macrocycle_id, primary_coach_id, team_id, start_date, status (enum), timezone, created_at, updated_at`
`client_plan_overrides`: `id, assignment_id, target_type, target_id, override_json, removed, created_at, updated_at`

**Divergences from the architecture doc (confirmed in P0.5, all benign except one to action):** `plan_sessions` carries both `plan_id` (denormalized) and `plan_week_id`; `plan_slots` adds `section` / `activity_id` / `activity_name` / `instructions`; `plan` adds `is_active` + `source_muscle_template_id`; `plan_weeks.deload_preset_id` is **TEXT** (matches the board's `APPLY_DELOAD` preset ids, not an FK); `client_plan_assignment.status` **reuses the existing `client_program_status` enum** (`active` | `paused` | `ended`, default `active`) — so legacy `client_programs.status` maps 1:1 in P2. **(Open Q#4 resolved.)**

> **⚠️ ACTION before P2/P5 — `plan.kind` has no `'meso'` value.** The CHECK is **`('template','client_frozen')`**, but the architecture doc models mesocycles as `kind='meso'` and `client_frozen` is the P5 promoted-snapshot concept. Reconcile: a **mesocycle = a `kind='template'` plan that is a member of a macrocycle** (via `macrocycle_mesocycles`); `client_frozen` = the per-client promoted snapshot from P5. Consequence: `macrocycle_mesocycles.program_template_id` must repoint to `plan_id` during P5 backfill, and P2's `plan_id` resolution treats all coach plans as `kind='template'`. Update the architecture doc's "kind ('template'|'meso')" lines to match.

---

## Cross-cutting rules (apply to every phase — per CLAUDE.md)

- Additive migrations only, `supabase/migrations/YYYYMMDDHHMMSS_*.sql`; never edit an applied migration. One `CREATE FUNCTION` per file, no trailing statements (CLI dollar-quote splitter bug).
- Every SECURITY DEFINER RPC ships the full `REVOKE ALL … FROM PUBLIC; REVOKE ALL … FROM anon; GRANT EXECUTE … TO authenticated|service_role;` trio, matched on the exact `pg_get_function_identity_arguments` signature. Params `p_`, locals `v_`, `SET search_path = public`, `RETURNS JSONB`.
- RLS on every new table with **both** coach and team-coach policies (pattern in migrations `20260212170000` / `20260212180000`).
- Run `supabase gen types` after any schema/RPC change and commit the regenerated `src/integrations/supabase/types.ts` — otherwise the frontend is untyped against `plan*`.
- No nested PostgREST FK joins on `client_*` / `plan_*` from client code — separate queries. Destructure `{ error }` and throw on every mutation. `.maybeSingle()` for optional rows.
- Dual-write + **zero-drift soak** before any cutover (mirror the coaches-tables refactor discipline). Verify against **prod** (single project `ghotrbotrywonaejlppg`), not a branch — some out-of-band DDL won't appear in `list_migrations`.

---

## Phase tickets

### P0.5 — Reconcile the out-of-band schema *(do FIRST · ~0.5 day · terminal)*
**Goal:** get `plan*` into source control + secured before building on them.
- Dump the live DDL of all eight tables; write **idempotent guarded** `CREATE TABLE IF NOT EXISTS … ` migrations so a fresh local DB reproduces prod. If they're already in migrations, just confirm parity.
- Verify/add **RLS**: coach owns rows where `owner_coach_id = auth.uid()` (plan, progression_rules); client reads a `plan` via an active `client_plan_assignment`; team-coach parity. Same for `client_plan_assignment` / `client_plan_overrides`.
- Confirm any existing RPCs on these tables carry the REVOKE/GRANT trio. Capture the `client_plan_assignment.status` enum values.
- `supabase gen types`; confirm `plan*` typed; `tsc -p tsconfig.app.json` green.
**DoD:** local migrations reproduce prod; RLS present and anon-denied; types regenerate; tsc green.
**Verify:** `list_migrations` vs live `\d`; `BEGIN; SET LOCAL ROLE anon; SELECT …; ROLLBACK;` denied.

### P1 — Planning Board dual-writes canonical *(the core · ~2–3 days · terminal)*
**Goal:** every board save **mirrors** into `plan*`; `slot_config` stays authoritative through the soak.
- Build RPC **`save_plan_from_builder(p_template_id uuid, p_payload jsonb) RETURNS jsonb`** — SECURITY DEFINER, transactional, delete-and-recreate children under the `plan` keyed by `plan.source_muscle_template_id = p_template_id` (upsert name/description). Mapping (architecture §P1): `WeekData → plan_weeks` (week_index/label/is_deload/deload_preset_id); `SessionData → plan_sessions` (day_index/name/activity_type/sort_order); `MuscleSlotData → plan_slots` (exercise_id/section/activity_*; `prescription_json` from sets/repMin/repMax/tempo/rir/rpe/setsDetail/columns; manual_override); W1 `deltaRules → progression_rules` referenced by `plan_slots.progression_rule_id`. Full REVOKE/GRANT to `authenticated`.
- Wire `src/hooks/useMuscleBuilderState.ts` (`save()` + autosave debounce, ~L1325–1402) to **also** call `save_plan_from_builder` after the existing `slot_config` write — fire-and-forget with error log (a mirror failure is a stale mirror, not data loss).
**Verify:** save a known template; `execute_sql` asserts `plan_weeks/sessions/slots` counts and spot-checks `prescription_json` vs `slot_config`. Author a drift query (slot_config-derived vs `plan*`).
**Soak gate:** N real saves, zero materialization drift.
**Risk:** the most complex plpgsql in the app, untestable in the Cowork sandbox — build with fresh focus and verify materialization *before* wiring autosave.

### P2 — Assignment writes the override model *(dual-write · ~1–2 days · terminal)*
**Goal:** assigning a plan creates `client_plan_assignment` (+0 overrides) alongside the legacy `client_programs` deep-copy.
- Extend the assign path (`assign_program_to_client`, or add `assign_plan_to_client`) to also insert `client_plan_assignment(client_id, subscription_id, plan_id, primary_coach_id, team_id, start_date, status, timezone)`. Resolve `plan_id` from the template via `plan.source_muscle_template_id` (and the muscle↔converted-program dedupe). Keep legacy deep-copy in parallel.
- Touch `src/lib/assignProgram.ts` + `AssignFromLibraryDialog`.
**Verify:** assign to a test client → exactly one `client_plan_assignment` + the legacy rows both created; `plan_id` resolves correctly.

### P3 — Workout logging reads canonical *(behind a flag · ~2–3 days · terminal)*
**Goal:** `WorkoutSessionV2` loads from `assignment + plan_* + overrides` instead of `client_*`; prove identical behavior; then stop legacy dual-write.
- Build a resolver: `assignment + date → active plan_week` (start_date + week math) → `plan_sessions` for the day → `plan_slots` **merged with `client_plan_overrides`** → the session shape `WorkoutSessionV2` expects (exercise, sets_json, input columns).
- Key `exercise_set_logs` on `assignment_id + resolved slot id` (add columns + backfill; keep `client_module_exercise_id` during transition so the PR/flag engine — which reads `created_by_user_id` — is unaffected; confirm the `prescribed` snapshot is still captured).
- Feature-flag the read path; compare canonical vs legacy render across the 4 seeded test clients.
**Soak gate:** identical render + logging for a week, then drop legacy dual-write.

### P4 — Coach-client Programs editor = **B4** *(the payoff · ~2–3 days · terminal)*
**Goal:** an in-place editor in **Workouts → Programs**. Mount the Planning Board scoped to an `assignment`; edits write `client_plan_overrides`.
- Reuse the muscle-builder reducer/UI behind a **new persistence adapter** that diffs against the resolved plan and writes `client_plan_overrides` (`target_type` week|session|slot, `override_json` = changed fields only, `removed` bool). Field-level for slots, element-level for added/removed sessions.
- **Per-client deload** = an override on `plan_week.is_deload` (+preset) — and wire `deload_requests.approved_*` to auto-apply via this same path, closing the deload gap.
- **Progression copy-paste** = reference or clone `progression_rules` onto a slot / all slots in a session.
- Surface in `src/components/client-overview/tabs/WorkoutsTab.tsx` Programs subtab (the read-only `ClientProgramDrilldown` becomes editable; `ClientProgramList` stays the entry).
**Verify:** edit one client's slot → an override row appears; that client's `WorkoutSessionV2` reflects it; **other clients on the same plan are untouched** (no drift).

### P5 — Backfill + retire *(~2–3 days + soak · terminal)*
- Backfill `muscle_program_templates` + `program_templates` → `plan`, deduping via `muscle_program_templates.converted_program_id` (a muscle template and its converted program_template merge into **one** `plan`).
- Backfill `client_programs` snapshots → `client_plan_assignment`, **promoting** each snapshot's current state to a frozen per-client `plan` (snapshots may have drifted from their template — promote, don't diff).
- Zero-drift verification, then a final destructive migration drops the legacy tables/RPCs/columns. **7-day zero-drift soak** before the drop (coaches-tables discipline).

---

## Open questions to lock in P0.5/P1

1. **Override granularity** — field-level `override_json` for slots, element-level for added/removed sessions (recommended).
2. **Drifted-snapshot mapping (P5)** — promote-to-frozen-plan (recommended) vs compute-diffs-as-overrides.
3. **progression_rules vs the two legacy engines** — full replacement vs wrap-during-transition. *(`progression_suggestions` reconciled in P0.5: it's benign legacy suggestion output, not a competing plan source.)*
4. ~~`client_plan_assignment.status` enum~~ — **resolved in P0.5**: reuses `client_program_status` (`active`/`paused`/`ended`), maps 1:1 from `client_programs.status`.
5. **`plan.kind` modeling** *(new, from P0.5)* — schema allows only `('template','client_frozen')`. Confirm mesocycles = `kind='template'` + macrocycle membership, and that `macrocycle_mesocycles.program_template_id → plan_id` is part of the P5 backfill (see the ⚠️ callout above).

---

## Per-phase Claude Code kickoff prompts (paste-ready)

Each assumes the terminal session is in the repo with `CLAUDE.md`, this doc, and `PROGRAM_SYSTEM_UNIFICATION.md` available.

- **P0.5:** "Read docs/PROGRAM_SYSTEM_UNIFICATION_BUILD_PLAN.md §P0.5 and CLAUDE.md. The plan* canonical tables already exist in prod but may not be in supabase/migrations and may lack RLS. Dump their live DDL, write idempotent guarded migrations to reproduce them, add coach + team-coach RLS, verify the status enum, run supabase gen types, and get tsc -p tsconfig.app.json green. Don't recreate or alter existing columns."
- **P1:** "Implement §P1: the save_plan_from_builder(p_template_id, p_payload jsonb) SECURITY DEFINER RPC (REVOKE/GRANT trio) that materializes a board save into plan_weeks/plan_sessions/plan_slots/progression_rules, then wire useMuscleBuilderState save/autosave to mirror into it after the existing slot_config write. slot_config stays authoritative. Verify materialization against a known template via a drift query before wiring autosave."
- **P2:** "Implement §P2: dual-write client_plan_assignment on assignment alongside legacy client_programs; resolve plan_id from the template."
- **P3:** "Implement §P3: a resolver loading WorkoutSessionV2 from assignment + plan_* + client_plan_overrides behind a feature flag; key exercise_set_logs on assignment_id + slot id; prove parity vs legacy on the 4 test clients."
- **P4 (B4):** "Implement §P4: the in-place Programs editor — muscle-builder UI scoped to an assignment, writing client_plan_overrides; per-client deload via plan_week override (wire deload_requests.approved_* to auto-apply); progression copy-paste via progression_rules."
- **P5:** "Implement §P5: backfill legacy → plan*, promote drifted client snapshots to frozen plans, 7-day zero-drift soak, then the destructive drop migration."

---

## Verification & seeding owned by Cowork (here)

After each phase deploys, Cowork can: seed test plans/assignments on the four `dr.ironofficial+<tier>@gmail.com` clients, run the drift queries via `execute_sql`, and drive a prod walkthrough (same loop used for the redesign). The `+online` client (`4331fa4f…`) already has two nutrition phases + workout logs to exercise the resolver.

---

## Planning Board v2 + prescription model (design track, mocked 2026-06-27)

The board becomes the **one program surface** opened from My Programs, a 1:1 client, or a team. Three context skins, one component (mocked + agreed):

- **Template** (library) — edits write the `plan` directly.
- **1:1 client** — edits write `client_plan_overrides` (amber badges). Expose a **Sync** toggle ("following template" vs "detached/frozen", TrueCoach-style).
- **Team** — edits write to the team's shared plan and hit all members; **zero per-member overrides** (TrainHeroic-style). Team members live under My Teams, not My Clients.

Board UX deltas vs today: a **context banner**; a **Calendar ⇄ Program-weeks** mode toggle (instances open in dated Calendar by default off `client_plan_assignment.start_date`; templates open in Program-weeks); **inline session expansion** (read a session's exercises without the edit drawer); drill-down Calendar → day → session → exercise → per-set prescription. **No per-set "Target" summary line** (dropped earlier; keep it gone).

### Already built — DO NOT rebuild (verified in the live board 2026-06-27)
- **Client inputs**: `Plan defaults | Custom` + 12 fields (Weight Used, Reps Performed, Actual RIR, Actual RPE, Time Taken, Distance Covered, Pace, Heart Rate, Side L/R, Rounds Completed, Calories, Notes). **No work needed** — at most relabel chips → a button later.
- **Per-set columns** (Rep Range, Target Weight, Tempo, RIR, RPE, %1RM, Rest, Time, Distance, Pace, Target HR, Side, Rounds, Band/Resistance, **Coach Notes**), **Customize-each-set** per-set editing, **Change-per-week** progression engine, **Replacements/swap**, free-text **Coach Instructions**. All exist.

### Net-new (the only real additions)
1. **Supersets / circuits** — slot-level grouping. `plan_slots`: `group_id uuid`, `group_type text CHECK ('superset','circuit')`, `rounds int`. Brackets exercises inside a session with shared rounds. (No grouping concept exists today.)
2. **Per-set instruction family** — a typed **＋ Coach instruction** menu wrapping the existing note plus four new auto-regulation types, all stored in `prescription_json` per set:
   - **Weight back-off** — a *separate* set whose weight = % or −kg of a marked reference set. `{ weight_mode:'backoff', ref_set_index, basis:'percent'|'drop', value, rounding }`. Default `weight_mode:'absolute'`.
   - **Drop set** — ordered *branches* off a set, same weight engine + optional new tempo. `branches:[{ type:'drop', basis:'percent'|'drop', value, tempo? }, …]`.
   - **Rest & Repeat** (rest-pause) — a branch: rest a prescribed time, repeat the same set to failure. `branches:[{ type:'rest_repeat', rest_seconds, to_failure:true, max_rounds? }]`.
   - **AMRAP** — a per-set flag that removes the rep range; client logs reps. `{ amrap:true }`.
   - **Per-set note** — `{ note }` (already possible via the Coach Notes column; formalize here).

### Resolver behaviour (P3 / `WorkoutSessionV2`)
Back-off + drop weights compute from the parent/reference set's weight — its prescribed weight if fixed, else the client's **logged** weight on that set — rounded (default 2.5kg). AMRAP suppresses the rep-range target and captures client reps. Rest & Repeat drives the rest timer + to-failure repeat rounds.

### Where this lands in the phases
`plan_slots` grouping columns + the `prescription_json` per-set shape (back-off / drop / rest_repeat / amrap / note) are a **P1 schema addendum** — bake them in while P1 is shaping the materializer so we never re-migrate. The typed menu UI + Calendar/Weeks mode + context skins are **P4** (the editor). The resolver math is **P3** (base parity) with the set-instruction resolution (back-off/drop/AMRAP/rest-pause) pairing with **P4** since no data carries those until the builder UI emits them. Client-inputs work = none.

---

## Teams track (design agreed + mocked 2026-06-27; runs parallel to the backbone)

Three top-level objects: **Programs (templates) · Clients (1:1) · Teams**. A team is its *own* object, not a kind of client. Independent of P2/P3, but the team **program** view depends on the P4 board.

### IA split
- **My Clients = 1:1 only.** Today team-plan members show up here (e.g. "Team Plan" rows) — that's the bug to fix.
- **My Teams** = list of teams → open one → a **team detail shell** mirroring the client shell's nav, but aggregated. Team members live *only* under My Teams → team → roster.

### Team detail — sections (default Pulse metric set, mocked)
- **Pulse**: on-track count (N/total), team workout-completion %, avg weight trend, a **nutrition deficit/maintenance/surplus split** bar, and a **needs-attention** list of lagging members.
- **Nutrition**: self-service, **view-only** aggregate (who's drifting). Coach does not edit team-member nutrition.
- **Program**: **Open program** launches the shared team plan in the P4 board (team skin — edits hit all members, **zero per-member overrides**).
- **Roster**: member list, each row like a 1:1 client card but **view-only** — coach can open a member to *view* program/nutrition (e.g. they asked on Instagram), never edit.
- Optional later: "Message team" → a WhatsApp/group hook.

### Team data model (no override layer)
A team plan = a `plan` bound to the team (coach edits it directly, like a template). Each member gets a `client_plan_assignment` with `team_id` set, `plan_id` = the team plan; **no `client_plan_overrides` ever**. Editing the team program edits the team `plan` → all members inherit (TrainHeroic single-calendar model). Dropping a member in/out = one assignment row. (`coach_teams.current_program_template_id` already exists as the binding hook.)

### Team assignment (a Teams-track ticket, NOT 1:1 P2)
From the library, **Assign → Team** seeds/links a team plan and **fans out one `client_plan_assignment` per member** (`team_id` set, zero overrides). No Sync toggle (the shared plan *is* the source). Distinct from the 1:1 assign path P2 built.

### Library + assign flow (mocked)
Each template card gets **Assign** (primary) + **Edit** (opens board) and shows reach (*N clients · M teams*). The assign dialog targets **Client / Team / Several**, with **start date**, **start-on-day** (TrueCoach), and a **Sync** toggle for 1:1 only.

### Sequencing
Teams track = (a) IA split + My Teams shell + aggregate Pulse/Nutrition dashboards (independent — can start anytime), (b) team assignment fan-out (needs P2's assignment plumbing as a pattern), (c) team program view (needs the P4 board). Build (a) in parallel; (b)/(c) after their deps.
