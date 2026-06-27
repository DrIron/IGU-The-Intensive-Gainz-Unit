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

  // 1) Assignment.
  const { data: assignment, error: aErr } = await supabase
    .from("client_plan_assignment")
    .select("id, plan_id, start_date, status")
    .eq("id", assignmentId)
    .maybeSingle();
  if (aErr) throw aErr;
  if (!assignment) return null;

  // 2) Plan (owner coach drives the column preset + the module owner).
  const { data: plan, error: pErr } = await supabase
    .from("plan")
    .select("id, owner_coach_id, name")
    .eq("id", assignment.plan_id)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!plan) return null;

  // 3) Resolve the plan_session: direct by id, else by date -> week -> day's first session.
  let session: { id: string; plan_week_id: string; day_index: number; name: string | null; activity_type: string } | null = null;
  let weekIndex = 1;

  if (planSessionId) {
    const { data: s, error: sErr } = await supabase
      .from("plan_sessions")
      .select("id, plan_week_id, day_index, name, activity_type, plan_id")
      .eq("id", planSessionId)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!s || s.plan_id !== plan.id) return null;
    session = s;
    const { data: wk } = await supabase
      .from("plan_weeks").select("week_index").eq("id", s.plan_week_id).maybeSingle();
    weekIndex = wk?.week_index ?? 1;
  } else if (date) {
    const { data: weeks, error: wErr } = await supabase
      .from("plan_weeks")
      .select("id, week_index")
      .eq("plan_id", plan.id)
      .order("week_index");
    if (wErr) throw wErr;
    if (!weeks || weeks.length === 0) return null;
    weekIndex = resolveWeekIndexForDate(assignment.start_date, date, weeks.length);
    const week = weeks.find((w) => w.week_index === weekIndex) ?? weeks[0];
    const jsDow = new Date(date + "T00:00:00Z").getUTCDay(); // 0=Sun..6=Sat
    const dayIndex = jsDow === 0 ? 7 : jsDow; // plan day_index: 1=Mon..7=Sun
    const { data: sessions, error: sErr } = await supabase
      .from("plan_sessions")
      .select("id, plan_week_id, day_index, name, activity_type")
      .eq("plan_week_id", week.id)
      .eq("day_index", dayIndex)
      .order("sort_order")
      .limit(1);
    if (sErr) throw sErr;
    if (!sessions || sessions.length === 0) return null;
    session = sessions[0];
  } else {
    return null;
  }

  // 4) Slots for the session (separate query — no nested FK joins on plan_*).
  const { data: slots, error: slErr } = await supabase
    .from("plan_slots")
    .select("id, exercise_id, section, sort_order, prescription_json, instructions")
    .eq("plan_session_id", session.id)
    .order("sort_order");
  if (slErr) throw slErr;

  // 5) Overrides for this assignment (LEFT JOIN in-memory; empty until P4 -> no-op).
  // TODO(P4): full week/session-level override semantics + element add/remove.
  const { data: overrides } = await supabase
    .from("client_plan_overrides")
    .select("target_type, target_id, override_json, removed")
    .eq("assignment_id", assignmentId);
  const slotOverride = new Map<string, { override_json: Record<string, unknown>; removed: boolean }>();
  for (const o of overrides ?? []) {
    if (o.target_type === "slot") {
      slotOverride.set(o.target_id, {
        override_json: (o.override_json as Record<string, unknown>) ?? {},
        removed: !!o.removed,
      });
    }
  }

  // 6) Coach default column preset (same source ConvertToProgram uses for column_config).
  const { data: presetRow } = await supabase
    .from("coach_column_presets")
    .select("column_config")
    .eq("coach_id", plan.owner_coach_id)
    .eq("is_default", true)
    .maybeSingle();
  const presetColumnConfig = (presetRow?.column_config as unknown as ColumnConfig[] | null) ?? null;

  // 7) exercise_library for the slots' exercises (separate query).
  const exerciseIds = [
    ...new Set((slots ?? []).map((s) => s.exercise_id).filter((id): id is string => !!id)),
  ];
  const libraryById = new Map<string, CanonicalExerciseLibraryInfo>();
  if (exerciseIds.length > 0) {
    const { data: libRows } = await supabase
      .from("exercise_library")
      .select(
        "id, name, default_video_url, primary_muscle, description, setup_instructions, setup_points, equipment, secondary_muscles",
      )
      .in("id", exerciseIds);
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

  // 8) Build the exercises. Skip slots with no exercise (canonical doesn't auto-fill —
  // a seeded/clean plan always has exercise_id) and overrides marked removed.
  // TODO(P4): expand prescription_json.replacements as separate accessory entries.
  const exercises: CanonicalResolvedExercise[] = [];
  for (const slot of slots ?? []) {
    const ov = slotOverride.get(slot.id);
    if (ov?.removed) continue;
    if (!slot.exercise_id) continue;

    const pj = {
      ...((slot.prescription_json as Record<string, unknown>) ?? {}),
      ...(ov?.override_json ?? {}),
    };
    const prescribable = slotFromPrescriptionJson(pj);
    const snapshot = isStrengthSlot(prescribable)
      ? buildStrengthPrescriptionSnapshot(prescribable, presetColumnConfig)
      : buildActivityPrescriptionSnapshot(prescribable);

    exercises.push({
      planSlotId: slot.id,
      exerciseId: slot.exercise_id,
      section: (slot.section as CanonicalResolvedExercise["section"]) ?? "main",
      sortOrder: slot.sort_order ?? 0,
      instructions: slot.instructions ?? null,
      prescriptionSnapshot: snapshot,
      library: libraryById.get(slot.exercise_id) ?? null,
    });
  }

  // 9) Existing canonical logs for this session's slots (resume support).
  const slotIds = exercises.map((e) => e.planSlotId);
  let existingLogs: CanonicalSetLogRow[] = [];
  if (slotIds.length > 0) {
    const { data: logs } = await supabase
      .from("exercise_set_logs")
      .select(
        "plan_slot_id, set_index, performed_reps, performed_load, performed_rir, performed_rpe, performed_json, notes, skipped, created_at",
      )
      .eq("assignment_id", assignmentId)
      .in("plan_slot_id", slotIds);
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

  return {
    assignmentId,
    planId: plan.id,
    ownerCoachId: plan.owner_coach_id,
    weekIndex,
    planSessionId: session.id,
    title: session.name?.trim() || DEFAULT_SESSION_NAMES[session.activity_type] || "Session",
    activityType: session.activity_type,
    exercises,
    existingLogs,
  };
}
