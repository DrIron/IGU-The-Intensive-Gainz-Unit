# Program Unification — dual-write soak health-check

**Status:** active soak starting at the `program-unification-p1` → `main` merge (baseline captured **2026-06-28**, pre-merge).
**Scope:** the three additive, best-effort canonical writes that run on legacy code paths **with all feature flags OFF** (prod default). They populate the canonical `plan_*` model in the background so it can be promoted later. None is read by any flag-off path, so a failure is *stale canonical data*, never a user-visible regression — which is exactly why it needs an out-of-band watch: the app stays green while the mirror silently drifts.

Related: `docs/PROGRAM_SYSTEM_UNIFICATION.md` (epic), `docs/DELOAD_V2.md` (deload paths), CLAUDE.md § "Canonical program model".

---

## The three dual-write paths

| # | Path | Trigger (legacy action) | Canonical write | Source (TS) |
|---|------|-------------------------|-----------------|-------------|
| 1 | **Template mirror** | Coach saves a Planning Board template (`muscle_program_templates.slot_config` write) | `save_plan_from_builder` → `plan` + `plan_weeks/sessions/slots` where `plan.source_muscle_template_id = template.id` | `useMuscleBuilderState.ts:1470` (`mirrorPlanToCanonical`, fire-and-forget after the authoritative slot_config write) |
| 2 | **Assignment mirror** | 1:1 program assigned to a client (`client_programs` deep-copy; `team_id IS NULL` only) | `assign_plan_to_client` → `client_plan_assignment` | `assignProgram.ts:56` (try/catch, after the legacy assign RPC) |
| 3 | **Deload-approval override** | Coach approves a deload request **while `board_v2` is OFF** | `save_client_plan_override` → `client_plan_overrides` (week, `is_deload:true`) | `deloadAutoApply.ts:83` via `useCoachDeloadRequests.ts:128` |

All three swallow their own errors into Sentry **warnings** and never fail or alter the legacy operation. Sentry only surfaces the writes that *threw*; a mirror that completed but produced wrong/partial data is caught **only** by the drift queries below.

---

## Sentry signatures to watch (first few days)

Filter on these `source` tags (severity `warning`):

- `save_plan_from_builder_mirror` — template mirror RPC threw. Template still saved; canonical plan stale.
- `assign_plan_to_client_mirror` — assignment mirror RPC threw. Client still assigned; no canonical assignment row.
  - Benign sub-case: the RPC **returns** `{skipped:true, reason:'no_mirror_plan'}` (no exception, no Sentry event) when the assigned template was never saved in the board post-P1. Expected during soak — not an error.
- (Deload override has no dedicated `source` tag; `applyApprovedDeload` returns a `reason` string the caller `console.warn`s — see `useCoachDeloadRequestForClient` logs, not Sentry.)

A cluster of any of the first two on real client data = investigate with the matching drift query.

---

## Drift queries

Run read-only against prod (`ghotrbotrywonaejlppg`). Each is a one-row health snapshot.

### Q1 — Template mirror coverage + staleness
```sql
SELECT
  (SELECT count(*) FROM muscle_program_templates)                              AS legacy_templates,
  (SELECT count(*) FROM plan WHERE kind='template')                            AS canonical_template_plans,
  (SELECT count(*) FROM muscle_program_templates m
     WHERE NOT EXISTS (SELECT 1 FROM plan p WHERE p.source_muscle_template_id = m.id)) AS templates_without_mirror,
  (SELECT count(*) FROM muscle_program_templates m
     CROSS JOIN LATERAL (
        SELECT p.updated_at FROM plan p
        WHERE p.source_muscle_template_id = m.id
        ORDER BY p.created_at DESC LIMIT 1
     ) latest
     WHERE latest.updated_at < m.updated_at - interval '1 minute')             AS stale_mirrors;
```
- **`stale_mirrors`** is the real health signal: a template whose latest mirror plan is older than the template itself → the last save's mirror failed. **Target: 0.**
- **`templates_without_mirror`** is *coverage*, not drift: a template never opened/saved in the board since P1 has no mirror yet. Shrinks as coaches re-save, or to 0 via the P5 backfill. A steady or shrinking number is fine; a *growing* one (new templates not mirroring on save) is a regression.

### Q2 — Assignment mirror (1:1 only)
```sql
WITH active_1to1 AS (
  SELECT cp.id, cp.user_id, cp.source_template_id, cp.status, cp.created_at
  FROM client_programs cp
  WHERE cp.team_id IS NULL AND cp.status = 'active'
),
resolvable AS (  -- has a mirror plan reachable via the template dedupe chain
  SELECT a.*, p.id AS plan_id
  FROM active_1to1 a
  JOIN muscle_program_templates m ON m.converted_program_id = a.source_template_id
  JOIN plan p ON p.source_muscle_template_id = m.id
)
SELECT
  (SELECT count(*) FROM active_1to1)                                           AS active_1to1_legacy,
  (SELECT count(*) FROM resolvable)                                            AS resolvable_to_mirror_plan,
  (SELECT count(*) FROM resolvable r
     WHERE NOT EXISTS (
       SELECT 1 FROM client_plan_assignment cpa
       WHERE cpa.client_id = r.user_id AND cpa.plan_id = r.plan_id))           AS resolvable_missing_assignment,
  (SELECT count(*) FROM client_plan_assignment)                               AS canonical_assignments_total;
```
**Important — the mirror is fire-forward, not a backfill.** It only writes on a *new* assignment. Pre-existing 1:1 clients (and any whose canonical rows were dropped) show up as `resolvable_missing_assignment` forever until re-assigned or P5-backfilled — that's a **historical floor, not drift.**

The true soak signal is the **post-merge delta** — assignments created after the merge that failed to mirror:
```sql
-- Replace the timestamp with the merge time. Should stay 0.
SELECT count(*)
FROM client_programs cp
JOIN muscle_program_templates m ON m.converted_program_id = cp.source_template_id
JOIN plan p ON p.source_muscle_template_id = m.id
WHERE cp.team_id IS NULL AND cp.status='active'
  AND cp.created_at > TIMESTAMPTZ '2026-06-28 00:00:00+00'
  AND NOT EXISTS (
    SELECT 1 FROM client_plan_assignment cpa
    WHERE cpa.client_id = cp.user_id AND cpa.plan_id = p.id);
```

### Q3 — Deload-approval override
```sql
SELECT
  (SELECT count(*) FROM deload_requests WHERE status='approved')              AS deload_requests_approved,
  (SELECT count(*) FROM client_plan_overrides
     WHERE target_type='week' AND (override_json->>'is_deload')::boolean IS TRUE) AS overrides_week_deload,
  (SELECT count(*) FROM client_plan_inserted_deloads)                         AS inserted_deloads_total;
```
Lowest priority — only matters once a canonical read flag turns on. With `board_v2` OFF an approval *should* leave one `overrides_week_deload` row per approval that had an active canonical assignment; approvals for clients with no canonical assignment skip (logged `no_active_assignment`), so the counts need not match 1:1.

---

## Pre-merge baseline — 2026-06-28

Captured read-only before merge. Establishes the "historical floor"; test assignments were already dropped, so canonical client rows start near zero by design.

| Query | Metric | Baseline | Reading |
|-------|--------|---------:|---------|
| Q1 | `legacy_templates` | 3 | — |
| Q1 | `canonical_template_plans` | 1 | one template has been mirrored |
| Q1 | `templates_without_mirror` | 2 | coverage gap — not yet re-saved since P1 (expected) |
| Q1 | **`stale_mirrors`** | **0** | ✅ no failed mirror |
| Q2 | `active_1to1_legacy` | 5 | — |
| Q2 | `resolvable_to_mirror_plan` | 4 | 4 of 5 reach a mirror plan |
| Q2 | `resolvable_missing_assignment` | 4 | historical floor (pre-mirror assignments; not drift) |
| Q2 | `canonical_assignments_total` | 0 | test assignments dropped — expected |
| Q3 | `deload_requests_approved` | 0 | nothing to watch yet |
| Q3 | `overrides_week_deload` | 0 | — |
| Q3 | `inserted_deloads_total` | 0 | — |

---

## Triage

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| Sentry `save_plan_from_builder_mirror` warnings | mirror RPC threw (payload edge case, RLS, constraint) on save | Open the event, grab `templateId`; re-run Q1 → confirm `stale_mirrors` ≥ 1. Reproduce by re-saving that template; read the RPC error. Template data is safe (slot_config authoritative). |
| `stale_mirrors` > 0 and rising | a template's last mirror consistently fails | Inspect that template's `slot_config` shape vs `save_plan_from_builder`'s parser. Likely a new field/grouping the writer doesn't handle. Fix the RPC; re-save backfills. |
| `templates_without_mirror` **growing** (new templates never mirror) | `mirrorPlanToCanonical` not firing, or throwing silently on every save | Verify the call still runs after the slot_config write (`useMuscleBuilderState.ts:1470`); check Sentry for a 100%-failure signature. |
| Sentry `assign_plan_to_client_mirror` warnings | mirror RPC threw on a real 1:1 assignment | Grab `clientProgramId`; run the **post-merge delta** query. Client assignment is safe (legacy authoritative). |
| post-merge delta query > 0 | new assignment didn't mirror, RPC didn't throw | The template likely has no mirror plan (`no_mirror_plan` skip). Confirm via Q1 for that template; have the coach open+save the template once, then re-assign or P5-backfill. |
| `resolvable_missing_assignment` high but **flat** | historical floor (expected) | No action — these predate the fire-forward mirror. Clears via P5 backfill. |
| Deload approval logs `no_active_assignment` | client has no canonical assignment yet | Expected pre-backfill; the legacy `deload_requests` row is unaffected. |

---

## Exit criteria

Promote a read path (turn a flag on for staff, then wider) only when, over a representative window of real saves/assignments:

1. **Q1 `stale_mirrors` holds at 0** — every template save mirrors cleanly.
2. **Q2 post-merge delta holds at 0** — every new 1:1 assignment mirrors (or skips with a known `no_mirror_plan` that the P5 backfill will close).
3. **No recurring** `*_mirror` Sentry signature on real client data.
4. The historical floor (`templates_without_mirror`, `resolvable_missing_assignment`) is closed by the **P5 backfill** — tracked separately in `docs/PROGRAM_SYSTEM_UNIFICATION.md`.
