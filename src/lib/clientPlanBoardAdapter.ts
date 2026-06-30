/**
 * Program system unification P4 / own-your-copy S2-S3 — board data adapter. Bridges the
 * muscle-builder board (MusclePlanState) to a client_plan_assignment's canonical plan.
 *   - loadPlanForAssignment: read plan_* -> MusclePlanState (board slot.id = plan_slots.id,
 *     session.id = plan_sessions.id) + a base snapshot.
 *     · board_v2 ON (own-your-copy): assignment.plan_id IS the client's CLONE — read it
 *       directly, NO client_plan_overrides (S3). Edits save via save_plan_direct (S2).
 *     · board_v2 OFF (legacy P4 editor): still merges client_plan_overrides on load and
 *       persists edits as overrides (persistAssignmentOverrides). Unchanged.
 *   - persistAssignmentOverrides / computeOverriddenIds: board_v2-OFF override path only.
 *
 * The client_plan_overrides table + save_client_plan_override RPC stay through the soak (S5
 * drops them); S3 only stops READING overrides under board_v2.
 */

import { supabase } from "@/integrations/supabase/client";
import { isBoardV2Enabled } from "@/lib/featureFlags";
import type { MusclePlanState, MuscleSlotData, SessionData, WeekData, ActivityType } from "@/types/muscle-builder";
import type { SetPrescription } from "@/types/workout-builder";

const DEFAULT_GLOBAL_CLIENT_INPUTS = ["performed_weight", "performed_reps", "performed_rpe"];
const DEFAULT_GLOBAL_PRESCRIPTION_COLUMNS = ["rep_range", "tempo", "rir", "rpe", "rest"];

// ---------------------------------------------------------------------------
// Base snapshot — the template (pre-override) values we diff edits against.
// ---------------------------------------------------------------------------
export interface BoardSlotBase {
  pj: Record<string, unknown>;          // plan_slots.prescription_json (raw template)
  exercise_id: string | null;
  sort_order: number;
  instructions: string | null;
  plan_session_id: string;
}
export interface BoardSessionBase {
  name: string | null;
  activity_type: string;
  day_index: number;
  sort_order: number;
  plan_week_id: string;
}
export interface BoardPlanBase {
  slots: Map<string, BoardSlotBase>;
  sessions: Map<string, BoardSessionBase>;
  globalClientInputs: string[];
  globalPrescriptionColumns: string[];
}
export interface BoardPlanLoad {
  planId: string;
  assignmentId: string;
  name: string;
  description: string;
  weeks: WeekData[];
  base: BoardPlanBase;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const num = (v: unknown): number | undefined =>
  typeof v === "number" ? v : v == null || v === "" ? undefined : Number(v);

/** Stable stringify (sorted keys) for deep-equal comparison of prescription_json blobs. */
function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stable((v as Record<string, unknown>)[k])).join(",") + "}";
}

/**
 * MuscleSlotData -> canonical prescription_json, mirroring save_plan_from_builder's
 * jsonb_build_object + strip_nulls so an unedited board slot serializes identically to the
 * template's stored prescription_json (clean diffs, no false-positive overrides).
 */
export function muscleSlotToCanonicalPj(
  slot: MuscleSlotData,
  globalPrescriptionColumns: string[],
  globalClientInputs: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    muscleId: slot.muscleId,
    sets: slot.sets,
    repMin: slot.repMin,
    repMax: slot.repMax,
    tempo: slot.tempo,
    rir: slot.rir,
    rpe: slot.rpe,
    setsDetail: slot.setsDetail,
    columns: slot.prescriptionColumns ?? globalPrescriptionColumns,
    clientInputs: slot.clientInputColumns ?? globalClientInputs,
    exerciseName: slot.exercise?.name,
    replacements: slot.replacements,
    manualOverrides: slot.manualOverrides,
    activityType: slot.activityType,
    duration: slot.duration,
    distance: slot.distance,
    targetHrZone: slot.targetHrZone,
    pace: slot.pace,
    rounds: slot.rounds,
    workSeconds: slot.workSeconds,
    restSeconds: slot.restSeconds,
    difficulty: slot.difficulty,
    activityNotes: slot.activityNotes,
  };
  // strip null/undefined (matches jsonb_strip_nulls); also drop empty arrays the materializer omits.
  for (const k of Object.keys(out)) {
    const val = out[k];
    if (val === null || val === undefined) delete out[k];
  }
  return out;
}

/** Reconstruct a board MuscleSlotData from a plan_slots row + its effective prescription_json. */
function slotRowToMuscleSlot(
  row: { id: string; exercise_id: string | null; sort_order: number; instructions: string | null; plan_session_id: string },
  pj: Record<string, unknown>,
  dayIndex: number,
): MuscleSlotData {
  const setsDetail = Array.isArray(pj.setsDetail) ? (pj.setsDetail as SetPrescription[]) : undefined;
  return {
    id: row.id,
    dayIndex,
    muscleId: typeof pj.muscleId === "string" ? pj.muscleId : "",
    sets: num(pj.sets) ?? (setsDetail?.length ?? 3),
    repMin: num(pj.repMin) ?? 8,
    repMax: num(pj.repMax) ?? 12,
    tempo: typeof pj.tempo === "string" ? pj.tempo : undefined,
    rir: num(pj.rir),
    rpe: num(pj.rpe),
    sortOrder: row.sort_order,
    sessionId: row.plan_session_id,
    exercise: row.exercise_id
      ? {
          exerciseId: row.exercise_id,
          name: typeof pj.exerciseName === "string" ? pj.exerciseName : "",
          instructions: row.instructions ?? undefined,
        }
      : undefined,
    replacements: Array.isArray(pj.replacements) ? (pj.replacements as MuscleSlotData["replacements"]) : undefined,
    setsDetail,
    prescriptionColumns: Array.isArray(pj.columns) ? (pj.columns as string[]) : undefined,
    clientInputColumns: Array.isArray(pj.clientInputs) ? (pj.clientInputs as string[]) : undefined,
    activityType: (pj.activityType as ActivityType) ?? undefined,
    duration: num(pj.duration),
    distance: num(pj.distance),
    targetHrZone: num(pj.targetHrZone),
    pace: typeof pj.pace === "string" ? pj.pace : undefined,
    rounds: num(pj.rounds),
    workSeconds: num(pj.workSeconds),
    restSeconds: num(pj.restSeconds),
    difficulty: (pj.difficulty as MuscleSlotData["difficulty"]) ?? undefined,
    activityNotes: typeof pj.activityNotes === "string" ? pj.activityNotes : undefined,
  };
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------
export async function loadPlanForAssignment(assignmentId: string): Promise<BoardPlanLoad | null> {
  const { data: assignment, error: aErr } = await supabase
    .from("client_plan_assignment")
    .select("id, plan_id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (aErr) throw aErr;
  if (!assignment) return null;

  const { data: plan, error: pErr } = await supabase
    .from("plan")
    .select("id, name, description")
    .eq("id", assignment.plan_id)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!plan) return null;

  const [{ data: weekRows, error: wErr }, { data: sessionRows, error: sErr }, { data: slotRows, error: slErr }] =
    await Promise.all([
      supabase.from("plan_weeks").select("id, week_index, label, is_deload, deload_preset_id, deload_placement").eq("plan_id", plan.id).order("week_index"),
      supabase.from("plan_sessions").select("id, plan_week_id, day_index, name, activity_type, sort_order").eq("plan_id", plan.id),
      supabase.from("plan_slots").select("id, plan_session_id, exercise_id, sort_order, prescription_json, instructions").eq("plan_id", plan.id),
    ]);
  if (wErr) throw wErr;
  if (sErr) throw sErr;
  if (slErr) throw slErr;

  // S3 (own-your-copy): under board_v2 the assignment plan IS the client's clone — read it
  // directly, no override layer. Only the legacy board_v2-OFF P4 editor still merges
  // client_plan_overrides on load. (The maps below stay empty under board_v2 → no-op merge.)
  let overrides: { target_type: string; target_id: string; override_json: unknown; removed: boolean | null }[] | null = null;
  if (!isBoardV2Enabled()) {
    const { data } = await supabase
      .from("client_plan_overrides")
      .select("target_type, target_id, override_json, removed")
      .eq("assignment_id", assignmentId);
    overrides = data;
  }

  // Override maps.
  const slotOv = new Map<string, { json: Record<string, unknown>; removed: boolean }>();
  const sessionOv = new Map<string, { json: Record<string, unknown>; removed: boolean }>();
  for (const o of overrides ?? []) {
    const j = (o.override_json as Record<string, unknown>) ?? {};
    if (o.target_type === "slot") slotOv.set(o.target_id, { json: j, removed: !!o.removed });
    else if (o.target_type === "session") sessionOv.set(o.target_id, { json: j, removed: !!o.removed });
  }

  // Base snapshot (raw template values).
  const base: BoardPlanBase = {
    slots: new Map(),
    sessions: new Map(),
    globalClientInputs: DEFAULT_GLOBAL_CLIENT_INPUTS,
    globalPrescriptionColumns: DEFAULT_GLOBAL_PRESCRIPTION_COLUMNS,
  };
  for (const s of sessionRows ?? []) {
    base.sessions.set(s.id, {
      name: s.name ?? null,
      activity_type: s.activity_type,
      day_index: s.day_index,
      sort_order: s.sort_order ?? 0,
      plan_week_id: s.plan_week_id,
    });
  }
  for (const sl of slotRows ?? []) {
    base.slots.set(sl.id, {
      pj: (sl.prescription_json as Record<string, unknown>) ?? {},
      exercise_id: sl.exercise_id ?? null,
      sort_order: sl.sort_order ?? 0,
      instructions: sl.instructions ?? null,
      plan_session_id: sl.plan_session_id,
    });
  }
  // Seed globals from the first slot's effective columns (per-slot still authoritative).
  const firstPj = (slotRows ?? [])[0]?.prescription_json as Record<string, unknown> | undefined;
  if (firstPj) {
    if (Array.isArray(firstPj.columns)) base.globalPrescriptionColumns = firstPj.columns as string[];
    if (Array.isArray(firstPj.clientInputs)) base.globalClientInputs = firstPj.clientInputs as string[];
  }

  // Build display weeks (base merged with overrides). day_index lookup per session.
  const sessionDay = new Map<string, number>();
  for (const s of sessionRows ?? []) sessionDay.set(s.id, s.day_index);

  const weeks: WeekData[] = (weekRows ?? []).map((w) => {
    const wSessions = (sessionRows ?? []).filter((s) => s.plan_week_id === w.id);
    const sessions: SessionData[] = [];
    for (const s of wSessions) {
      const ov = sessionOv.get(s.id);
      if (ov?.removed) continue;
      sessions.push({
        id: s.id,
        dayIndex: s.day_index,
        name: (ov?.json.name as string | undefined) ?? s.name ?? undefined,
        type: ((ov?.json.activity_type as string | undefined) ?? s.activity_type) as ActivityType,
        sortOrder: s.sort_order ?? 0,
      });
    }
    const keptSessionIds = new Set(sessions.map((s) => s.id));
    const slots: MuscleSlotData[] = [];
    for (const sl of (slotRows ?? []).filter((x) => keptSessionIds.has(x.plan_session_id))) {
      const ov = slotOv.get(sl.id);
      if (ov?.removed) continue;
      const basePj = (sl.prescription_json as Record<string, unknown>) ?? {};
      const effPj = { ...basePj, ...((ov?.json.prescription as Record<string, unknown> | undefined) ?? {}) };
      const merged = slotRowToMuscleSlot(
        {
          id: sl.id,
          exercise_id: (ov?.json.exercise_id as string | undefined) ?? sl.exercise_id ?? null,
          sort_order: (ov?.json.sort_order as number | undefined) ?? sl.sort_order ?? 0,
          instructions: (ov?.json.instructions as string | undefined) ?? sl.instructions ?? null,
          plan_session_id: sl.plan_session_id,
        },
        effPj,
        sessionDay.get(sl.plan_session_id) ?? 1,
      );
      slots.push(merged);
    }
    return {
      slots,
      sessions,
      label: w.label ?? undefined,
      isDeload: w.is_deload ?? false,
      deloadPresetId: w.deload_preset_id ?? undefined,
      deloadPlacement: (w.deload_placement as "pinned" | "on_demand" | null) ?? undefined,
    };
  });

  return {
    planId: plan.id,
    assignmentId,
    name: plan.name,
    description: plan.description ?? "",
    weeks: weeks.length > 0 ? weeks : [{ slots: [], sessions: [] }],
    base,
  };
}

// ---------------------------------------------------------------------------
// Diff helpers (current board state vs base) — drive badges + persistence.
// ---------------------------------------------------------------------------
function allSlots(state: MusclePlanState): MuscleSlotData[] {
  return state.weeks.flatMap((w) => w.slots);
}
function allSessions(state: MusclePlanState): SessionData[] {
  return state.weeks.flatMap((w) => w.sessions ?? []);
}

/** A slot diverges from template if its serialized pj or structural fields differ from base. */
function slotDiffers(slot: MuscleSlotData, b: BoardSlotBase, gpc: string[], gci: string[]): boolean {
  const curPj = muscleSlotToCanonicalPj(slot, gpc, gci);
  if (stable(curPj) !== stable(b.pj)) return true;
  if ((slot.exercise?.exerciseId ?? null) !== b.exercise_id) return true;
  if ((slot.sortOrder ?? 0) !== b.sort_order) return true;
  if ((slot.exercise?.instructions ?? null) !== b.instructions) return true;
  return false;
}
function sessionDiffers(s: SessionData, b: BoardSessionBase): boolean {
  if ((s.name ?? null) !== b.name) return true;
  if (s.type !== b.activity_type) return true;
  return false;
}

/**
 * Field-level prescription diff: only the prescription_json keys that differ from the template
 * (per the build plan, override_json = changed fields only). The resolver shallow-merges this
 * over the base, so unchanged keys keep flowing from the template — a customized slot stays
 * attached to the template for every field the coach didn't touch. A field the coach CLEARED
 * (present in base, absent now) is stored as an explicit null tombstone so the merge unsets it.
 */
export function prescriptionDiff(cur: Record<string, unknown>, base: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(cur), ...Object.keys(base)]);
  for (const k of keys) {
    if (stable(cur[k]) === stable(base[k])) continue;
    out[k] = cur[k] === undefined ? null : cur[k]; // tombstone keys removed by the coach
  }
  return out;
}

export interface OverriddenIds {
  slots: Set<string>;
  sessions: Set<string>;
}

/** Which elements currently diverge from the template (for the amber "Customized" badges). */
export function computeOverriddenIds(state: MusclePlanState, base: BoardPlanBase): OverriddenIds {
  const gpc = base.globalPrescriptionColumns;
  const gci = base.globalClientInputs;
  const slots = new Set<string>();
  const sessions = new Set<string>();
  const curSlotIds = new Set<string>();
  for (const slot of allSlots(state)) {
    curSlotIds.add(slot.id);
    const b = base.slots.get(slot.id);
    if (!b || slotDiffers(slot, b, gpc, gci)) slots.add(slot.id); // new or changed
  }
  for (const [id] of base.slots) if (!curSlotIds.has(id)) slots.add(id); // removed
  const curSessionIds = new Set<string>();
  for (const s of allSessions(state)) {
    curSessionIds.add(s.id);
    const b = base.sessions.get(s.id);
    if (!b || sessionDiffers(s, b)) sessions.add(s.id);
  }
  for (const [id] of base.sessions) if (!curSessionIds.has(id)) sessions.add(id);
  return { slots, sessions };
}

// ---------------------------------------------------------------------------
// Persist (diff -> save_client_plan_override). Throws on first RPC error.
// ---------------------------------------------------------------------------
async function writeOverride(
  assignmentId: string,
  targetType: "slot" | "session" | "week",
  targetId: string,
  overrideJson: Record<string, unknown>,
  removed: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("save_client_plan_override", {
    p_assignment_id: assignmentId,
    p_target_type: targetType,
    p_target_id: targetId,
    p_override_json: overrideJson as never,
    p_removed: removed,
  });
  if (error) throw error;
}

export async function persistAssignmentOverrides(
  assignmentId: string,
  state: MusclePlanState,
  base: BoardPlanBase,
): Promise<void> {
  const gpc = base.globalPrescriptionColumns;
  const gci = base.globalClientInputs;

  // Only touch elements that diverge now (write) or that had an override but no longer
  // diverge (clear) — never an RPC per untouched slot.
  const { data: existing } = await supabase
    .from("client_plan_overrides")
    .select("target_type, target_id")
    .eq("assignment_id", assignmentId);
  const existingKeys = new Set((existing ?? []).map((o) => `${o.target_type}:${o.target_id}`));
  const desired = new Set<string>();
  const ops: Array<Promise<void>> = [];

  // Sessions: patch / remove. (Added whole sessions deferred — TODO.)
  const curSessions = new Map(allSessions(state).map((s) => [s.id, s]));
  for (const [id, s] of curSessions) {
    const b = base.sessions.get(id);
    if (!b) continue; // added session — deferred
    if (sessionDiffers(s, b)) {
      const patch: Record<string, unknown> = {};
      if ((s.name ?? null) !== b.name) patch.name = s.name ?? null;
      if (s.type !== b.activity_type) patch.activity_type = s.type;
      desired.add(`session:${id}`);
      ops.push(writeOverride(assignmentId, "session", id, patch, false));
    }
  }
  for (const [id] of base.sessions) {
    if (!curSessions.has(id)) {
      desired.add(`session:${id}`);
      ops.push(writeOverride(assignmentId, "session", id, {}, true)); // removed
    }
  }

  // Slots: patch / add / remove.
  const curSlots = new Map(allSlots(state).map((sl) => [sl.id, sl]));
  for (const [id, slot] of curSlots) {
    const b = base.slots.get(id);
    const curPj = muscleSlotToCanonicalPj(slot, gpc, gci);
    if (!b) {
      desired.add(`slot:${id}`);
      ops.push(
        writeOverride(assignmentId, "slot", id, {
          added: true,
          plan_session_id: slot.sessionId ?? null,
          exercise_id: slot.exercise?.exerciseId ?? null,
          sort_order: slot.sortOrder ?? 0,
          instructions: slot.exercise?.instructions ?? null,
          prescription: curPj,
        }, false),
      );
      continue;
    }
    if (slotDiffers(slot, b, gpc, gci)) {
      const patch: Record<string, unknown> = {};
      const presDiff = prescriptionDiff(curPj, b.pj);
      if (Object.keys(presDiff).length > 0) patch.prescription = presDiff; // field-level, not whole block
      if ((slot.exercise?.exerciseId ?? null) !== b.exercise_id) patch.exercise_id = slot.exercise?.exerciseId ?? null;
      if ((slot.sortOrder ?? 0) !== b.sort_order) patch.sort_order = slot.sortOrder ?? 0;
      if ((slot.exercise?.instructions ?? null) !== b.instructions) patch.instructions = slot.exercise?.instructions ?? null;
      // Defensive: slotDiffers was true, so patch should be non-empty; if not, leave it to the
      // clear loop (revert to template) rather than writing a meaningless override.
      if (Object.keys(patch).length > 0) {
        desired.add(`slot:${id}`);
        ops.push(writeOverride(assignmentId, "slot", id, patch, false));
      }
    }
  }
  for (const [id] of base.slots) {
    if (!curSlots.has(id)) {
      desired.add(`slot:${id}`);
      ops.push(writeOverride(assignmentId, "slot", id, {}, true)); // removed
    }
  }

  // Clear overrides that exist but are no longer needed (reverted to template).
  for (const key of existingKeys) {
    if (desired.has(key)) continue;
    const idx = key.indexOf(":");
    const tt = key.slice(0, idx) as "slot" | "session" | "week";
    const tid = key.slice(idx + 1);
    ops.push(writeOverride(assignmentId, tt, tid, {}, false)); // empty + not-removed = delete row
  }

  await Promise.all(ops);
}

/** Clear a single element's override (per-element "Reset to template"). */
export async function resetElementToTemplate(
  assignmentId: string,
  targetType: "slot" | "session",
  targetId: string,
): Promise<void> {
  await writeOverride(assignmentId, targetType, targetId, {}, false);
}

// ---------------------------------------------------------------------------
// S2 (own-your-copy) — clone-direct save + team-clone load.
// See docs/PROGRAM_ASSIGNMENT_SYNC.md §S2.
// ---------------------------------------------------------------------------

/**
 * Save the board straight into an assignee-owned clone via save_plan_direct —
 * NO client_plan_overrides. Used (board_v2) by both the client board (the
 * client's own clone) and the team board (the team's shared clone). The payload
 * is buildPlanPayload(state): board SessionData.id / MuscleSlotData.id carry the
 * canonical plan_*.id, so the RPC upserts on the PK and preserves identity
 * (exercise_set_logs stay linked).
 */
export async function savePlanDirect(planId: string, payload: unknown): Promise<void> {
  const { error } = await supabase.rpc("save_plan_direct", {
    p_plan_id: planId,
    p_payload: payload as never,
  });
  if (error) throw error;
}

export interface TeamPlanLoad {
  planId: string;
  teamId: string;
  name: string;
  description: string;
  weeks: WeekData[];
}

/**
 * Load a team's shared canonical plan (coach_teams.current_program_plan_id) into
 * board state. Mirrors loadPlanForAssignment MINUS the override merge — team
 * clones carry no per-member overrides by construction (the clone IS the
 * divergence). Returns null when the team has no canonical plan yet.
 */
export async function loadPlanForTeam(teamId: string): Promise<TeamPlanLoad | null> {
  const { data: team, error: tErr } = await supabase
    .from("coach_teams")
    .select("id, current_program_plan_id")
    .eq("id", teamId)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!team?.current_program_plan_id) return null;

  const { data: plan, error: pErr } = await supabase
    .from("plan")
    .select("id, name, description")
    .eq("id", team.current_program_plan_id)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!plan) return null;

  const [{ data: weekRows, error: wErr }, { data: sessionRows, error: sErr }, { data: slotRows, error: slErr }] =
    await Promise.all([
      supabase.from("plan_weeks").select("id, week_index, label, is_deload, deload_preset_id, deload_placement").eq("plan_id", plan.id).order("week_index"),
      supabase.from("plan_sessions").select("id, plan_week_id, day_index, name, activity_type, sort_order").eq("plan_id", plan.id),
      supabase.from("plan_slots").select("id, plan_session_id, exercise_id, sort_order, prescription_json, instructions").eq("plan_id", plan.id),
    ]);
  if (wErr) throw wErr;
  if (sErr) throw sErr;
  if (slErr) throw slErr;

  const sessionDay = new Map<string, number>();
  for (const s of sessionRows ?? []) sessionDay.set(s.id, s.day_index);

  const weeks: WeekData[] = (weekRows ?? []).map((w) => {
    const sessions: SessionData[] = (sessionRows ?? [])
      .filter((s) => s.plan_week_id === w.id)
      .map((s) => ({
        id: s.id,
        dayIndex: s.day_index,
        name: s.name ?? undefined,
        type: s.activity_type as ActivityType,
        sortOrder: s.sort_order ?? 0,
      }));
    const keptSessionIds = new Set(sessions.map((s) => s.id));
    const slots: MuscleSlotData[] = (slotRows ?? [])
      .filter((sl) => keptSessionIds.has(sl.plan_session_id))
      .map((sl) =>
        slotRowToMuscleSlot(
          {
            id: sl.id,
            exercise_id: sl.exercise_id ?? null,
            sort_order: sl.sort_order ?? 0,
            instructions: sl.instructions ?? null,
            plan_session_id: sl.plan_session_id,
          },
          (sl.prescription_json as Record<string, unknown>) ?? {},
          sessionDay.get(sl.plan_session_id) ?? 1,
        ),
      );
    return {
      slots,
      sessions,
      label: w.label ?? undefined,
      isDeload: w.is_deload ?? false,
      deloadPresetId: w.deload_preset_id ?? undefined,
      deloadPlacement: (w.deload_placement as "pinned" | "on_demand" | null) ?? undefined,
    };
  });

  return {
    planId: plan.id,
    teamId,
    name: plan.name,
    description: plan.description ?? "",
    weeks: weeks.length > 0 ? weeks : [{ slots: [], sessions: [] }],
  };
}
