/**
 * Program system unification P3 / own-your-copy S3 — resolve ONE workout session from the
 * canonical model (client_plan_assignment + plan_*) into the shape WorkoutSessionV2 renders.
 * Behind the `canonical_session_read` feature flag (OFF by default). Legacy client_* remains
 * the authoritative read/log path; this is a parity read only.
 *
 * S3 (own-your-copy): the assignee's plan IS the divergence — under board_v2 the board writes
 * the client's own CLONE directly (S2 save_plan_direct), so client_plan_overrides is never
 * written for these assignments. The retired override fetch + merge has been REMOVED; the
 * resolver reads purely from plan_* on assignment.plan_id (the clone). The override TABLE
 * stays through the soak (S5 drops it); we just stop reading it here.
 *
 * Flow: assignment + date -> active plan_week (start_date + week math, incl. on-demand
 * inserted deloads from client_plan_inserted_deloads) -> plan_sessions for that day_index
 * -> plan_slots -> session shape (exercise, prescription, columns).
 *
 * SCOPE: base prescription parity only. Replacements expansion, auto-fill, cross-instance
 * history/PB, and per-set instruction resolution (back-off/drop/AMRAP/rest-pause) are
 * deferred — see TODOs. No data carries the set-instruction fields until the P4 builder UI.
 */

import { supabase } from "@/integrations/supabase/client";
import { selectWithRetry } from "@/lib/selectWithRetry";
import type { BoardDeloadInsert } from "@/lib/boardDates";
import { buildRunningSequence, type SequenceInsert } from "@/lib/deloadSequence";
import type { ColumnConfig } from "@/types/workout-builder";
import {
  buildStrengthPrescriptionSnapshot,
  buildActivityPrescriptionSnapshot,
  slotFromPrescriptionJson,
  isStrengthSlot,
  type PrescriptionSnapshot,
} from "@/lib/canonicalPrescription";

export interface CanonicalExerciseLibraryInfo {
  name: string;
  default_video_url: string | null;
  primary_muscle: string;
  description: string | null;
  setup_instructions: string | null;
  setup_points: string[] | null;
  equipment: string | null;
  secondary_muscles: string[] | null;
}

export interface CanonicalResolvedExercise {
  /** plan_slots.id — the canonical "instance" id; becomes Exercise.id + the log's plan_slot_id. */
  planSlotId: string;
  exerciseId: string;
  section: "warmup" | "main" | "accessory" | "cooldown";
  sortOrder: number;
  instructions: string | null;
  prescriptionSnapshot: PrescriptionSnapshot;
  library: CanonicalExerciseLibraryInfo | null;
}

export interface CanonicalSetLogRow {
  plan_slot_id: string;
  set_index: number;
  performed_reps: number | null;
  performed_load: number | null;
  performed_rir: number | null;
  performed_rpe: number | null;
  performed_json: Record<string, string | number> | null;
  notes: string | null;
  skipped: boolean;
  created_at: string;
}

export interface CanonicalResolvedSession {
  assignmentId: string;
  planId: string;
  ownerCoachId: string;
  weekIndex: number;
  planSessionId: string;
  title: string;
  activityType: string;
  /** This week is a deload for the client (template pinned flag OR an inserted on-demand deload). */
  isDeload: boolean;
  /** The inserted on-demand deload's preset (display only — content is authored), else null. */
  deloadPresetId: string | null;
  exercises: CanonicalResolvedExercise[];
  existingLogs: CanonicalSetLogRow[];
}

export interface ResolveCanonicalSessionParams {
  assignmentId: string;
  /** Direct entry — resolve this exact plan_session. */
  planSessionId?: string;
  /** Date entry — resolve the active week + that day's first session. ISO yyyy-mm-dd. */
  date?: string;
}

/**
 * Active RUNNING week for a date given the assignment start: week 1 = the start_date week.
 * `weekCount` is the base running-week count (on-demand deload templates already excluded);
 * each on-demand deload spliced into this client's sequence (Deload v2) adds one running week,
 * so the clamp ceiling is weekCount + inserts.length. Clamped to [1, total]; dates before
 * start_date clamp to week 1. With no inserts this is identical to the pre-Deload-v2 behavior.
 */
export function resolveWeekIndexForDate(
  startDateIso: string,
  dateIso: string,
  weekCount: number,
  inserts: BoardDeloadInsert[] = [],
): number {
  const start = new Date(startDateIso + "T00:00:00Z").getTime();
  const day = new Date(dateIso + "T00:00:00Z").getTime();
  const diffDays = Math.floor((day - start) / 86400000);
  const total = weekCount + inserts.length;
  const wk = Math.floor(diffDays / 7) + 1;
  if (wk < 1) return 1;
  if (total > 0 && wk > total) return total;
  return wk;
}

const DEFAULT_SESSION_NAMES: Record<string, string> = {
  strength: "Strength",
  cardio: "Cardio",
  hiit: "HIIT",
  yoga_mobility: "Yoga / Mobility",
  recovery: "Recovery",
  sport_specific: "Sport-Specific",
};

/**
 * Resolve one canonical session. Returns null when it can't be resolved (no assignment,
 * no plan, no session for the day) — the caller falls back / surfaces an error.
 */
export async function resolveCanonicalSession(
  params: ResolveCanonicalSessionParams,
): Promise<CanonicalResolvedSession | null> {
  const { assignmentId, planSessionId, date } = params;
  // Retry each idempotent read with a per-attempt timeout so a transient pooler blip/hang retries
  // instead of failing the canonical load (matches the legacy logger's selectWithRetry pattern).
  const retryRead = <R extends { error: unknown }>(run: () => PromiseLike<R>, label: string) =>
    selectWithRetry(run, 2, 400, { timeoutMs: 6000, label });

  // 1) Assignment.
  const { data: assignment, error: aErr } = await retryRead(
    () =>
      supabase
        .from("client_plan_assignment")
        .select("id, plan_id, start_date, status")
        .eq("id", assignmentId)
        .maybeSingle(),
    "assignment",
  );
  if (aErr) throw aErr;
  if (!assignment) return null;

  // 2) Plan (owner coach drives the column preset + the module owner).
  const { data: plan, error: pErr } = await retryRead(
    () => supabase.from("plan").select("id, owner_coach_id, name").eq("id", assignment.plan_id).maybeSingle(),
    "plan",
  );
  if (pErr) throw pErr;
  if (!plan) return null;

  // 3) Resolve the plan_session: direct by id, else by date -> week -> day's first session.
  let session: { id: string; plan_week_id: string; day_index: number; name: string | null; activity_type: string } | null = null;
  let weekIndex = 1;
  let planWeekIsDeload: boolean | null = null; // the active week's deload flag (template pinned, or inserted)
  let insertedDeload = false; // Deload v2: the active week is an on-demand deload spliced for this client
  let insertedPresetId: string | null = null; // the inserted deload's preset id (display only — content is authored)

  if (planSessionId) {
    const { data: s, error: sErr } = await retryRead(
      () =>
        supabase
          .from("plan_sessions")
          .select("id, plan_week_id, day_index, name, activity_type, plan_id")
          .eq("id", planSessionId)
          .maybeSingle(),
      "plan_session",
    );
    if (sErr) throw sErr;
    if (!s || s.plan_id !== plan.id) return null;
    session = s;
    const { data: wk } = await retryRead(
      () => supabase.from("plan_weeks").select("week_index, is_deload").eq("id", s.plan_week_id).maybeSingle(),
      "plan_week",
    );
    weekIndex = wk?.week_index ?? 1;
    planWeekIsDeload = wk?.is_deload ?? null;
  } else if (date) {
    const { data: weeks, error: wErr } = await retryRead(
      () =>
        supabase
          .from("plan_weeks")
          .select("id, week_index, is_deload, deload_placement")
          .eq("plan_id", plan.id)
          .order("week_index"),
      "plan_weeks",
    );
    if (wErr) throw wErr;
    if (!weeks || weeks.length === 0) return null;

    // Deload v2: splice this client's on-demand deload inserts into the running sequence and
    // resolve the active week against the shifted timeline. With no on-demand weeks authored the
    // sequence == base weeks in order → unchanged.
    const { data: insRows } = await retryRead(
      () =>
        supabase
          .from("client_plan_inserted_deloads")
          .select("id, position_week_index, source_plan_week_id, preset_id")
          .eq("assignment_id", assignmentId)
          .order("position_week_index"),
      "inserted_deloads",
    );
    const inserts: SequenceInsert[] = (insRows ?? []).map((r) => ({
      id: r.id,
      position_week_index: r.position_week_index,
      source_plan_week_id: r.source_plan_week_id,
      preset_id: r.preset_id ?? null,
    }));
    const sequence = buildRunningSequence(weeks, inserts);
    const baseCount = sequence.filter((s) => s.kind === "base").length;
    weekIndex = resolveWeekIndexForDate(
      assignment.start_date,
      date,
      baseCount,
      inserts.map<BoardDeloadInsert>((i) => ({ position: i.position_week_index })),
    );
    const active = sequence[weekIndex - 1] ?? sequence[0];
    planWeekIsDeload = active.isDeload;
    insertedDeload = active.kind === "inserted";
    insertedPresetId = active.presetId;

    const jsDow = new Date(date + "T00:00:00Z").getUTCDay(); // 0=Sun..6=Sat
    const dayIndex = jsDow === 0 ? 7 : jsDow; // plan day_index: 1=Mon..7=Sun
    const { data: sessions, error: sErr } = await retryRead(
      () =>
        supabase
          .from("plan_sessions")
          .select("id, plan_week_id, day_index, name, activity_type")
          .eq("plan_week_id", active.contentPlanWeekId) // inserted deload → the source week's sessions
          .eq("day_index", dayIndex)
          .order("sort_order")
          .limit(1),
      "plan_sessions_for_day",
    );
    if (sErr) throw sErr;
    if (!sessions || sessions.length === 0) return null;
    session = sessions[0];
  } else {
    return null;
  }

  // 4) Slots for the session (separate query — no nested FK joins on plan_*).
  const { data: slots, error: slErr } = await retryRead(
    () =>
      supabase
        .from("plan_slots")
        .select("id, exercise_id, section, sort_order, prescription_json, instructions")
        .eq("plan_session_id", session!.id)
        .order("sort_order"),
    "plan_slots",
  );
  if (slErr) throw slErr;

  // 5) S3 (own-your-copy): resolve purely from plan_* on the clone — the retired
  // client_plan_overrides fetch + slot/session/week merge has been removed. Under the
  // canonical-read flags the clone IS the divergence (S2 writes it directly), so the override
  // set was always empty for these assignments; reading the clone directly is behavior-preserving
  // now and correct after the board_v2 flip. (The override table/RPC stay until S5.)
  //
  // Effective deload for display = an inserted on-demand deload (Deload v2) OR the active
  // template week's own pinned flag. Both carry authored-reduced content, so prescriptions are
  // used as-is — no read-time re-reduction.
  const effectiveIsDeload = insertedDeload || (planWeekIsDeload ?? false);

  // 6) Coach default column preset (same source ConvertToProgram uses for column_config).
  const { data: presetRow } = await retryRead(
    () =>
      supabase
        .from("coach_column_presets")
        .select("column_config")
        .eq("coach_id", plan.owner_coach_id)
        .eq("is_default", true)
        .maybeSingle(),
    "column_preset",
  );
  const presetColumnConfig = (presetRow?.column_config as unknown as ColumnConfig[] | null) ?? null;

  // 7) exercise_library for every exercise we render (the clone's slots).
  const exerciseIds = new Set<string>();
  for (const s of slots ?? []) if (s.exercise_id) exerciseIds.add(s.exercise_id);
  const libraryById = new Map<string, CanonicalExerciseLibraryInfo>();
  if (exerciseIds.size > 0) {
    const { data: libRows } = await retryRead(
      () =>
        supabase
          .from("exercise_library")
          .select(
            "id, name, default_video_url, primary_muscle, description, setup_instructions, setup_points, equipment, secondary_muscles",
          )
          .in("id", [...exerciseIds]),
      "exercise_library",
    );
    for (const r of libRows ?? []) {
      libraryById.set(r.id, {
        name: r.name,
        default_video_url: r.default_video_url ?? null,
        primary_muscle: r.primary_muscle ?? "",
        description: r.description ?? null,
        setup_instructions: r.setup_instructions ?? null,
        setup_points: r.setup_points ?? null,
        equipment: r.equipment ?? null,
        secondary_muscles: r.secondary_muscles ?? null,
      });
    }
  }

  // Build one resolved exercise from a clone slot. Returns null when there's no exercise to
  // log (no auto-fill in canonical). Inserted/pinned deload content is authored-reduced, so the
  // prescription is used as-is (no read-time preset re-application).
  const buildExercise = (
    planSlotId: string,
    base: {
      exercise_id: string | null;
      section: string | null;
      sort_order: number | null;
      instructions: string | null;
      prescription_json: Record<string, unknown>;
    },
  ): CanonicalResolvedExercise | null => {
    const exerciseId = base.exercise_id;
    if (!exerciseId) return null;
    const prescribable = slotFromPrescriptionJson(base.prescription_json ?? {});
    const snapshot = isStrengthSlot(prescribable)
      ? buildStrengthPrescriptionSnapshot(prescribable, presetColumnConfig)
      : buildActivityPrescriptionSnapshot(prescribable);
    return {
      planSlotId,
      exerciseId,
      section: (base.section ?? "main") as CanonicalResolvedExercise["section"],
      sortOrder: base.sort_order ?? 0,
      instructions: base.instructions ?? null,
      prescriptionSnapshot: snapshot,
      library: libraryById.get(exerciseId) ?? null,
    };
  };

  // 8) Build exercises straight from the clone's slots, then order.
  // TODO(P4): expand prescription_json.replacements as separate accessory entries.
  const exercises: CanonicalResolvedExercise[] = [];
  for (const slot of slots ?? []) {
    const built = buildExercise(slot.id, {
      exercise_id: slot.exercise_id,
      section: slot.section,
      sort_order: slot.sort_order,
      instructions: slot.instructions ?? null,
      prescription_json: (slot.prescription_json as Record<string, unknown>) ?? {},
    });
    if (built) exercises.push(built);
  }
  exercises.sort((a, b) => a.sortOrder - b.sortOrder);

  // 9) Existing canonical logs for this session's slots (resume support).
  const slotIds = exercises.map((e) => e.planSlotId);
  let existingLogs: CanonicalSetLogRow[] = [];
  if (slotIds.length > 0) {
    const { data: logs } = await retryRead(
      () =>
        supabase
          .from("exercise_set_logs")
          .select(
            "plan_slot_id, set_index, performed_reps, performed_load, performed_rir, performed_rpe, performed_json, notes, skipped, created_at",
          )
          .eq("assignment_id", assignmentId)
          .in("plan_slot_id", slotIds),
      "existing_logs",
    );
    existingLogs = (logs ?? []).map((l) => ({
      plan_slot_id: l.plan_slot_id as string,
      set_index: l.set_index,
      performed_reps: l.performed_reps,
      performed_load: l.performed_load as number | null,
      performed_rir: l.performed_rir as number | null,
      performed_rpe: l.performed_rpe as number | null,
      performed_json: (l.performed_json as Record<string, string | number> | null) ?? null,
      notes: l.notes ?? null,
      skipped: l.skipped ?? false,
      created_at: l.created_at,
    }));
  }

  // Session name / activity come straight from the clone's plan_session.
  const effectiveName = session.name ?? null;
  const effectiveActivityType = session.activity_type;

  return {
    assignmentId,
    planId: plan.id,
    ownerCoachId: plan.owner_coach_id,
    weekIndex,
    planSessionId: session.id,
    title: effectiveName?.trim() || DEFAULT_SESSION_NAMES[effectiveActivityType] || "Session",
    activityType: effectiveActivityType,
    isDeload: effectiveIsDeload,
    // Display preset: the inserted on-demand deload's preset id (else null).
    deloadPresetId: insertedPresetId,
    exercises,
    existingLogs,
  };
}

/** One cross-instance movement history log (canonical-keyed), newest-first. */
export interface CrossInstanceLogRow {
  plan_slot_id: string;
  set_index: number;
  performed_load: number | null;
  performed_reps: number | null;
  performed_rir: number | null;
  performed_rpe: number | null;
  created_at: string;
}

/**
 * D3 — cross-instance movement history for the canonical player's history / personal-best /
 * PR-ref parity. Returns exercise_id -> the client's logs on that movement (across ALL their
 * plan_slots), newest-first.
 *
 * There is NO FK from exercise_set_logs.plan_slot_id -> plan_slots, so a PostgREST embed can't
 * join them. Instead: ONE batched read of the client's readable plan_slots for these movements +
 * ONE batched read of their logs on those slots — resolve exercise_id in memory. Two `in()`
 * reads, NO per-exercise round-trip (the WK7 §1.5 anti-fan-out rule). RLS scopes plan_slots to
 * the client's assigned plans and logs to their own rows, so ended-plan history a client can no
 * longer read is naturally omitted (acceptable — same limitation as the canonical program list).
 */
export async function loadCrossInstanceHistory(
  userId: string,
  exerciseIds: string[],
): Promise<Map<string, CrossInstanceLogRow[]>> {
  const out = new Map<string, CrossInstanceLogRow[]>();
  const ids = [...new Set(exerciseIds.filter(Boolean))];
  if (ids.length === 0) return out;

  const { data: slots, error: slotErr } = await selectWithRetry(() =>
    supabase.from("plan_slots").select("id, exercise_id").in("exercise_id", ids),
  );
  if (slotErr || !slots || slots.length === 0) return out;
  const exerciseBySlot = new Map<string, string>();
  for (const s of slots) if (s.id && s.exercise_id) exerciseBySlot.set(s.id as string, s.exercise_id as string);
  const slotIds = [...exerciseBySlot.keys()];
  if (slotIds.length === 0) return out;

  const { data: logs, error: logErr } = await selectWithRetry(() =>
    supabase
      .from("exercise_set_logs")
      .select("plan_slot_id, set_index, performed_load, performed_reps, performed_rir, performed_rpe, created_at")
      .eq("created_by_user_id", userId)
      .in("plan_slot_id", slotIds)
      .order("created_at", { ascending: false }),
  );
  if (logErr || !logs) return out;

  for (const l of logs) {
    const exId = exerciseBySlot.get(l.plan_slot_id as string);
    if (!exId) continue;
    const row: CrossInstanceLogRow = {
      plan_slot_id: l.plan_slot_id as string,
      set_index: l.set_index as number,
      performed_load: (l.performed_load as number | null) ?? null,
      performed_reps: (l.performed_reps as number | null) ?? null,
      performed_rir: (l.performed_rir as number | null) ?? null,
      performed_rpe: (l.performed_rpe as number | null) ?? null,
      created_at: l.created_at as string,
    };
    const arr = out.get(exId);
    if (arr) arr.push(row);
    else out.set(exId, [row]);
  }
  return out;
}
