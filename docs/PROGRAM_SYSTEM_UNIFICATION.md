# Program system unification (Direction A)

Decision 2026-06-26: collapse the three incompatible representations of a training plan into **one canonical relational model**, with client programs as a thin assignment + override layer (no deep-copy drift). Foundational, migration-heavy — executed in phases with backfills and a soak, mirroring the coaches-tables refactor discipline.

## The problem (from the surface map)

A plan exists in three shapes joined by lossy one-way conversions:

1. **Planning Board** — JSONB `muscle_program_templates.slot_config`. Richest model: Week › Session › Slot, weekly delta rules, `isDeload` flags. W2–WN resolved on the fly from W1 + rules.
2. **Program template (mesocycle)** — relational `program_templates › program_template_days › day_modules › module_exercises › exercise_prescriptions`. Flattened by `convert_muscle_plan_to_program_v2` (lossy).
3. **Client instance** — deep-copy snapshot `client_programs › client_program_days › client_day_modules › client_module_exercises`. No prescription link, **no edit path**, frozen.

Data lost at each hop: **deload intent** (gone after conversion), **progression** (two disjoint systems: board weekly-deltas vs `exercise_prescriptions.linear_progression`), **editability** (instances immutable; deload-approval can't mutate them). Session/slot exists in three incompatible forms.

## Canonical model (single source of truth)

One hierarchy, used by templates AND client plans:

```
plan                 -- replaces muscle_program_templates + program_templates
  id, owner_coach_id, name, description, kind ('template'|'meso'), level, visibility, tags
plan_weeks
  id, plan_id, week_index, label, is_deload, deload_preset_id?    -- DELOAD FIRST-CLASS
plan_sessions                                                      -- SESSION FIRST-CLASS (fixes bifurcation)
  id, plan_week_id, day_index (1-7), name, activity_type, sort_order
plan_slots                                                         -- exercise OR activity
  id, plan_session_id, exercise_id?, activity_* , sort_order,
  prescription_json (sets/reps/tempo/rir/rpe/sets_json/columns),
  progression_rule_id?                                             -- references a reusable rule
progression_rules                                                  -- reusable, COPY-PASTE-able
  id, owner_coach_id, scope ('slot'|'session'|'plan'), rule_json
  -- unifies board "weekly deltas" + session "linear progression" into ONE rule type
```

Weeks are **materialized** (W1..WN as real rows), so a coach edits W3 directly. Progression rules drive an optional "generate/refresh downstream weeks" action; manual edits persist (per-slot `manual_override` flag). Copy-paste a rule = reference the same `progression_rules.id` (or clone) onto another slot / all slots in a session.

## Client plan = assignment + override layer (no deep copy)

```
client_plan_assignment        -- replaces client_programs
  id, client_id, subscription_id, plan_id, macrocycle_id?, start_date, status, timezone
client_plan_overrides         -- per-client diffs against the plan; NO full snapshot
  id, assignment_id, target_type ('week'|'session'|'slot'), target_id (plan_* id),
  override_json (changed fields only), or removed (bool)
```

- A client **follows `plan_id`**; reads merge `plan_*` + the client's overrides.
- Coach edits a client's program → writes overrides keyed to the plan element. Template stays canonical; one client's tweak never touches others, never deep-copies, never drifts.
- **Deload toggle for a client** = an override on a `plan_week` setting `is_deload` (+ preset). Works at assignment OR mid-program; deload *requests* apply via the same override path.
- Logged sets (`exercise_set_logs`) key on `assignment_id` + resolved slot id.

## Macrocycles

`macrocycles` + `macrocycle_mesocycles` keep ordering `plan`s (kind='meso'). Assigning a macrocycle creates one `client_plan_assignment` per block, date-staggered. A client "sees" the active block by date; editing a client's macrocycle = overrides on that block's plan.

## Migration strategy (additive, dual-write, soak)

Mirror the coaches-tables refactor: build canonical tables alongside the old, dual-write, verify zero-drift, then cut over and retire.

- **P0 — schema.** Create `plan*`, `progression_rules`, `client_plan_assignment`, `client_plan_overrides` alongside existing tables. No rip-out.
- **P1 — Planning Board on canonical.** The board reads/writes `plan*` directly (drop the JSONB `slot_config` as source; keep as backfill input). This becomes the ONE editor.
  - **Current persistence:** `useMuscleBuilderState.ts` — `save()`/auto-save write `buildSlotConfig(state)` (shape `{ weeks:[{slots:MuscleSlotData[], sessions:SessionData[], label, isDeload}], globalClientInputs, globalPrescriptionColumns }`) into `muscle_program_templates.slot_config`; the load effect (~line 1259) parses it back into `WeekData[]`.
  - **P1 adapter (low-risk, dual-write):** keep the in-memory `MusclePlanState` + reducer untouched. Add a materializer that, on save, mirrors the serialized state into the canonical rows; keep writing `slot_config` too during the soak (slot_config stays authoritative until P3). Mapping per save (delete-and-recreate children under one `plan`):
    - `muscle_program_templates` row → one `plan` (keyed `plan.source_muscle_template_id = template.id`; upsert name/description).
    - each `WeekData` → `plan_weeks` (`week_index`, `label`, `is_deload`).
    - each `SessionData` → `plan_sessions` (`day_index`, `name`, `activity_type`, `sort_order`; denormalize `plan_id`).
    - each `MuscleSlotData` → `plan_slots` (match session via `sessionId`; `exercise_id`, `section`, activity fields, `prescription_json` from sets/repMin/repMax/tempo/rir/rpe/setsDetail/columns, `manual_override`).
    - W1 slot `deltaRules` → `progression_rules` rows, referenced by `plan_slots.progression_rule_id`.
  - **Atomicity choice:** prefer ONE SECURITY DEFINER RPC `save_plan_from_builder(p_template_id, p_payload jsonb)` (transactional). A TS multi-insert adapter is acceptable as a fallback since canonical is a mirror during the soak (failure = stale mirror, not data loss — slot_config is authoritative). RPC needs the REVOKE/GRANT pattern.
  - **Reads:** P1 keeps reading `slot_config`; canonical reads switch in P3. Regenerate `supabase gen types` once tables/RPCs land so the frontend is typed.
  - **Risk:** intricate, untestable-in-sandbox plpgsql touching the most complex surface + prod. Build with fresh focus, verify materialization against a known plan via `execute_sql` before wiring auto-save.
- **P2 — assignment writes the override model.** New assignments create `client_plan_assignment` (+ zero overrides). Keep writing legacy `client_*` in parallel (dual-write) until P3 proven.
- **P3 — workout logging reads canonical.** `WorkoutSessionV2` loads from assignment + overrides instead of `client_*`. Verify identical behaviour, then stop dual-writing legacy.
- **P4 — coach-client editor (B4).** The Planning Board, scoped to an `assignment` → writes overrides. Drag sessions, day-sync, progression copy-paste, per-client deload — all "for free" because it's the same engine.
- **P5 — backfill + retire.** Backfill all `muscle_program_templates` + `program_templates` → `plan*`; existing `client_programs` snapshots → `client_plan_assignment` with their current state promoted to a frozen per-client `plan` (snapshots may have drifted from their template, so promote rather than diff). Drop legacy tables after a clean soak.

Backfill order resolves the dedupe via `muscle_program_templates.converted_program_id` (the muscle template and its converted `program_template` are the same plan — merge into one `plan`).

## Open questions to resolve in P0/P1

- Override granularity: field-level `override_json` vs copy-on-write whole elements. Lean field-level for slots, element-level for added/removed sessions.
- How existing drifted client snapshots map (P5): promote-to-frozen-plan (recommended) vs compute-diffs-as-overrides.
- Whether `progression_rules` fully replaces both the board delta engine and `exercise_prescriptions.linear_progression`, or wraps them during transition.

## Relationship to the coach-client redesign

This track **precedes B4** of `COACH_CLIENT_REDESIGN.md`. B1–B3 (vitals rail, nutrition decision-first, workouts pulse) are independent and can ship in parallel. B4 (Programs editor) = P4 here. B5 (calendar) reads the canonical assignment.
