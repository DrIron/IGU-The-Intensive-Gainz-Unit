/**
 * Program system unification P3 — resolve ONE workout session from the canonical model
 * (client_plan_assignment + plan_* + client_plan_overrides) into the shape WorkoutSessionV2
 * renders. Behind the `canonical_session_read` feature flag (OFF by default). Legacy
 * client_* remains the authoritative read/log path; this is a parity read only.
 *
 * Flow (build plan §P3): assignment + date -> active plan_week (start_date + week math)
 * -> plan_sessions for that day_index -> plan_slots LEFT JOIN client_plan_overrides
 * (overrides empty until P4 -> no-ops) -> session shape (exercise, prescription, columns).
 *
 * SCOPE: base prescription parity only. Replacements expansion, auto-fill, cross-instance
 * history/PB, and per-set instruction resolution (back-off/drop/AMRAP/rest-pause) are
 * deferred — see TODOs. No data carries the set-instruction fields until the P4 builder UI.
 */

import { supabase } from "@/integrations/supabase/client";
import { selectWithRetry } from "@/lib/selectWithRetry";
import { applyDeloadPreset } from "@/components/coach/programs/muscle-builder/deloadPresets";
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
  /** This week is a deload for the client (template flag OR a per-client week override). */
  isDeload: boolean;
  /** Preset applied when the deload came from a per-client override (else null). */
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
 * Active week for a date given the assignment start: week 1 = the start_date week.
 * Clamped to [1, weekCount]; dates before start_date clamp to week 1.
 */
export function resolveWeekIndexForDate(
  startDateIso: string,
  dateIso: string,
  weekCount: number,
): number {
  const start = new Date(startDateIso + "T00:00:00Z").getTime();
  const day = new Date(dateIso + "T00:00:00Z").getTime();
  const diffDays = Math.floor((day - start) / 86400000);
  const wk = Math.floor(diffDays / 7) + 1;
  if (wk < 1) return 1;
  if (weekCount > 0 && wk > weekCount) return weekCount;
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
  let planWeekIsDeload: boolean | null = null; // the template week's own deload flag (display)

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
      () => supabase.from("plan_weeks").select("id, week_index, is_deload").eq("plan_id", plan.id).order("week_index"),
      "plan_weeks",
    );
    if (wErr) throw wErr;
    if (!weeks || weeks.length === 0) return null;
    weekIndex = resolveWeekIndexForDate(assignment.start_date, date, weeks.length);
    const week = weeks.find((w) => w.week_index === weekIndex) ?? weeks[0];
    planWeekIsDeload = week.is_deload ?? null;
    const jsDow = new Date(date + "T00:00:00Z").getUTCDay(); // 0=Sun..6=Sat
    const dayIndex = jsDow === 0 ? 7 : jsDow; // plan day_index: 1=Mon..7=Sun
    const { data: sessions, error: sErr } = await retryRead(
      () =>
        supabase
          .from("plan_sessions")
          .select("id, plan_week_id, day_index, name, activity_type")
          .eq("plan_week_id", week.id)
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

  // 5) Overrides for this assignment, merged over the resolved plan_* (the P4 override layer:
  // a 1:1 client diverges from the followed plan without touching the template / other clients).
  // override_json contract (mirrors save_client_plan_override):
  //   slot    { exercise_id?, section?, sort_order?, instructions?, prescription?: <partial pj>,
  //             added?: true, plan_session_id? }   — field-level patch; added = a new slot
  //   session { name?, activity_type? }             — removed=true drops the whole session
  //   week    { is_deload?, deload_preset_id? }     — accepted; per-client deload apply deferred
  const { data: overrides } = await retryRead(
    () =>
      supabase
        .from("client_plan_overrides")
        .select("target_type, target_id, override_json, removed")
        .eq("assignment_id", assignmentId),
    "overrides",
  );

  const slotPatch = new Map<string, { json: Record<string, unknown>; removed: boolean }>();
  const addedSlots: { targetId: string; json: Record<string, unknown> }[] = [];
  let sessionPatch: Record<string, unknown> | null = null;
  let sessionRemoved = false;
  let weekOverride: Record<string, unknown> | null = null; // for this session's plan_week
  const existingSlotIds = new Set((slots ?? []).map((s) => s.id));
  for (const o of overrides ?? []) {
    const oj = (o.override_json as Record<string, unknown>) ?? {};
    if (o.target_type === "week" && o.target_id === session.plan_week_id) {
      if (!o.removed) weekOverride = oj;
    } else if (o.target_type === "session" && o.target_id === session.id) {
      if (o.removed) sessionRemoved = true;
      else sessionPatch = oj;
    } else if (o.target_type === "slot") {
      if (existingSlotIds.has(o.target_id)) {
        slotPatch.set(o.target_id, { json: oj, removed: !!o.removed });
      } else if (!o.removed && (oj.plan_session_id == null || oj.plan_session_id === session.id)) {
        addedSlots.push({ targetId: o.target_id, json: oj }); // a new slot for this session
      }
    }
  }
  // A session removed for this client drops the whole session.
  if (sessionRemoved) return null;

  // Per-client deload (week-level override). When an APPROVED deload set is_deload + a preset on
  // this week, apply the preset's reduction to each resolved slot's prescription at read time
  // (template slots carry NORMAL prescriptions; the reduction is the client's diff). A template's
  // own is_deload is already baked into plan_slots, so we only RE-apply for override-driven deload.
  const overrideDeload = weekOverride?.is_deload === true;
  const deloadPresetId = overrideDeload
    ? ((weekOverride?.deload_preset_id as string | undefined) ?? null)
    : null;
  // Effective deload for display = override is_deload (if set) else the template week's flag.
  const effectiveIsDeload = overrideDeload || (planWeekIsDeload ?? false);

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

  // 7) exercise_library for every exercise we may render — base slots + patched/added overrides.
  const exerciseIds = new Set<string>();
  for (const s of slots ?? []) if (s.exercise_id) exerciseIds.add(s.exercise_id);
  for (const [, p] of slotPatch) if (typeof p.json.exercise_id === "string") exerciseIds.add(p.json.exercise_id);
  for (const a of addedSlots) if (typeof a.json.exercise_id === "string") exerciseIds.add(a.json.exercise_id as string);
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

  // Build one resolved exercise from base slot fields + an optional override patch.
  // Returns null when there's no exercise to log (no auto-fill in canonical).
  const buildExercise = (
    planSlotId: string,
    base: {
      exercise_id: string | null;
      section: string | null;
      sort_order: number | null;
      instructions: string | null;
      prescription_json: Record<string, unknown>;
    },
    patch: Record<string, unknown> | undefined,
  ): CanonicalResolvedExercise | null => {
    const exerciseId = (patch?.exercise_id as string | undefined) ?? base.exercise_id;
    if (!exerciseId) return null;
    const pj = {
      ...(base.prescription_json ?? {}),
      ...((patch?.prescription as Record<string, unknown> | undefined) ?? {}),
    };
    // Per-client deload (week override): reduce the prescription via the shared preset math
    // (same helper the board uses) before building the snapshot. Strength slots only.
    const prescribableRaw = slotFromPrescriptionJson(pj);
    const prescribable =
      deloadPresetId && isStrengthSlot(prescribableRaw)
        ? applyDeloadPreset(prescribableRaw, deloadPresetId)
        : prescribableRaw;
    const snapshot = isStrengthSlot(prescribable)
      ? buildStrengthPrescriptionSnapshot(prescribable, presetColumnConfig)
      : buildActivityPrescriptionSnapshot(prescribable);
    return {
      planSlotId,
      exerciseId,
      section: ((patch?.section as string | undefined) ?? base.section ?? "main") as CanonicalResolvedExercise["section"],
      sortOrder: (patch?.sort_order as number | undefined) ?? base.sort_order ?? 0,
      instructions: (patch?.instructions as string | undefined) ?? base.instructions ?? null,
      prescriptionSnapshot: snapshot,
      library: libraryById.get(exerciseId) ?? null,
    };
  };

  // 8) Build exercises: base slots (patched, removed dropped) + override-added slots, then order.
  // TODO(P4): expand prescription_json.replacements as separate accessory entries.
  const exercises: CanonicalResolvedExercise[] = [];
  for (const slot of slots ?? []) {
    const ov = slotPatch.get(slot.id);
    if (ov?.removed) continue;
    const built = buildExercise(
      slot.id,
      {
        exercise_id: slot.exercise_id,
        section: slot.section,
        sort_order: slot.sort_order,
        instructions: slot.instructions ?? null,
        prescription_json: (slot.prescription_json as Record<string, unknown>) ?? {},
      },
      ov?.json,
    );
    if (built) exercises.push(built);
  }
  for (const added of addedSlots) {
    const built = buildExercise(
      added.targetId,
      { exercise_id: null, section: null, sort_order: null, instructions: null, prescription_json: {} },
      added.json,
    );
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

  // Session-level override patches name / activity_type for this client.
  const effectiveName =
    (sessionPatch?.name as string | undefined) ?? session.name ?? null;
  const effectiveActivityType =
    (sessionPatch?.activity_type as string | undefined) ?? session.activity_type;

  return {
    assignmentId,
    planId: plan.id,
    ownerCoachId: plan.owner_coach_id,
    weekIndex,
    planSessionId: session.id,
    title: effectiveName?.trim() || DEFAULT_SESSION_NAMES[effectiveActivityType] || "Session",
    activityType: effectiveActivityType,
    isDeload: effectiveIsDeload,
    deloadPresetId,
    exercises,
    existingLogs,
  };
}
