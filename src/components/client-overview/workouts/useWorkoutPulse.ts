// src/components/client-overview/workouts/useWorkoutPulse.ts
//
// Data for the coach Workouts Pulse (B3): this-week metrics (adherence,
// tonnage, estimated TUST, PRs), a "needs your eyes" digest, and this week's
// sessions with per-exercise progression flags + PRs.
//
// Two sources, one engine (computePulse):
//   - LEGACY (board_v2 off): client_programs (active) -> client_program_days
//     (date) -> client_day_modules (completed_at) ; exercise_set_logs
//     (created_by_user_id = client) -> client_module_exercises -> exercise_library.
//   - CANONICAL (board_v2 on): loadCanonicalWorkoutLogs(assignment) +
//     loadCanonicalSchedule(assignment) — deload-aware; logs keyed by
//     assignment_id+plan_slot_id, grouped by plan_session_id. Coach reads rely on
//     the canonical exercise_set_logs + plan_* RLS policies (Slice 2/3 §0).
//
// exercise_set_logs rows carry performed_* + performed_json + the per-set
// `prescribed` snapshot in BOTH worlds (the canonical logger writes the same
// PrescriptionSnapshot shape), so flags/PRs read the prescription straight off
// the log and prEngine/workoutFlags need no changes — only the data source +
// grouping key differ.
//
// Degrade-safe: any failed read leaves that slice empty rather than throwing.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isBoardV2Enabled } from "@/lib/featureFlags";
import {
  resolveActiveAssignment,
  loadCanonicalSchedule,
  loadCanonicalWorkoutLogs,
  canonicalSessionTitle,
} from "@/lib/canonicalScheduleAdapter";
import {
  detectExercisePrs,
  type LoggedSet,
  type PrMatch,
} from "@/utils/prEngine";
import {
  progressionFlag,
  estimateSetTust,
  setTonnage,
  type Prescription,
  type ProgressionFlag,
} from "@/utils/workoutFlags";

export interface PulseExerciseRow {
  exerciseId: string;
  name: string;
  category: string | null;
  flag: ProgressionFlag;
  prs: PrMatch[];
  /** Compact "this vs last" summary, e.g. "100×6 → 102.5×6". */
  summary: string | null;
}

export interface PulseSession {
  moduleId: string;
  title: string;
  date: string; // YYYY-MM-DD
  prCount: number;
  flagged: number; // down + off_prescription
  exercises: PulseExerciseRow[];
}

export interface NeedsEyesItem {
  sessionTitle: string;
  exerciseName: string;
  flag: ProgressionFlag; // "down" | "off_prescription"
  detail: string;
}

export interface WorkoutPulse {
  loading: boolean;
  adherencePct: number | null;
  weeklyCompleted: number;
  weeklyScheduled: number;
  tonnageKg: number;
  prevTonnageKg: number;
  tustSeconds: number;
  prCount: number;
  /** Lifts whose flag is "up" this week, over lifts that had a prior session. */
  progressingCount: number;
  progressingTotal: number;
  /** down + off-prescription (== needsEyes.length). */
  flagCount: number;
  /** Last 6 weeks, oldest -> newest, for the History trend sparklines. */
  weeklyTonnage: number[];
  weeklyTust: number[];
  needsEyes: NeedsEyesItem[];
  sessions: PulseSession[];
}

const EMPTY: WorkoutPulse = {
  loading: true,
  adherencePct: null,
  weeklyCompleted: 0,
  weeklyScheduled: 0,
  tonnageKg: 0,
  prevTonnageKg: 0,
  tustSeconds: 0,
  prCount: 0,
  progressingCount: 0,
  progressingTotal: 0,
  flagCount: 0,
  weeklyTonnage: [],
  weeklyTust: [],
  needsEyes: [],
  sessions: [],
};

// ──────────────────────────────────────────────────────────────────────────────

function mondayOf(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface RawLog {
  client_module_exercise_id: string;
  set_index: number;
  skipped: boolean;
  performed_load: number | null;
  performed_reps: number | null;
  performed_rir: number | null;
  performed_rpe: number | null;
  performed_json: Record<string, unknown> | null;
  prescribed: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Engine-normalised log: the raw performed/prescribed fields plus the two grouping
 * keys the pulse needs — exerciseId and moduleId (the session-instance key).
 * Legacy moduleId = client_day_module_id (via client_module_exercises); canonical
 * moduleId = plan_session_id. computePulse() is agnostic to which world produced it.
 */
interface PulseLog {
  exerciseId: string;
  moduleId: string;
  set_index: number;
  skipped: boolean;
  performed_load: number | null;
  performed_reps: number | null;
  performed_rir: number | null;
  performed_rpe: number | null;
  performed_json: Record<string, unknown> | null;
  prescribed: Record<string, unknown> | null;
  created_at: string;
}

type ExMeta = Map<string, { name: string | null; category: string | null }>;
type WeekModule = { id: string; title: string; date: string };

function toLoggedSet(r: PulseLog): LoggedSet {
  const j = (r.performed_json ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    performedLoad: r.performed_load,
    performedReps: r.performed_reps,
    performedRir: r.performed_rir,
    performedRpe: r.performed_rpe,
    performedTime: num(j.performed_time),
    performedDistance: num(j.performed_distance),
    performedPace: num(j.performed_pace),
    performedRounds: num(j.performed_rounds),
    performedCalories: num(j.performed_calories),
    performedSide: typeof j.performed_side === "string" ? j.performed_side : null,
  };
}

function prescriptionFromLog(r: PulseLog): Prescription | null {
  const p = r.prescribed as Record<string, unknown> | null;
  if (!p) return null;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const it = p.intensity_type;
  return {
    repMin: num(p.rep_range_min),
    repMax: num(p.rep_range_max),
    intensityType: it === "RIR" || it === "RPE" ? it : null,
    intensityValue: num(p.intensity_value),
  };
}

function tempoFromLog(r: PulseLog): string | null {
  const p = r.prescribed as Record<string, unknown> | null;
  return p && typeof p.tempo === "string" ? p.tempo : null;
}

function fmtBest(set: LoggedSet | null): string | null {
  if (!set || set.performedLoad == null || set.performedReps == null) return null;
  return `${set.performedLoad}×${set.performedReps}`;
}

// ──────────────────────────────────────────────────────────────────────────────

/**
 * Compute the pulse from engine-normalised logs + this-week's module list. Shared
 * by the legacy and canonical branches so all metric/PR/flag logic is single-source
 * — the branches differ only in how they build `pulseLogs`/`exMeta`/`weekModules`.
 * `pulseLogs` MUST be ordered created_at asc; `weekModules` are the COMPLETED
 * sessions in the current week.
 */
function computePulse(
  pulseLogs: PulseLog[],
  exMeta: ExMeta,
  weekModules: WeekModule[],
  weeklyScheduled: number,
  weeklyCompleted: number,
  monday: Date,
): WorkoutPulse {
  // Group every log by exercise and by module (session).
  interface Grouped {
    byModule: Map<string, PulseLog[]>; // moduleId -> sets
    moduleOrder: string[]; // modules in chronological order (by first log)
  }
  const byExercise = new Map<string, Grouped>();
  for (const l of pulseLogs) {
    let g = byExercise.get(l.exerciseId);
    if (!g) {
      g = { byModule: new Map(), moduleOrder: [] };
      byExercise.set(l.exerciseId, g);
    }
    if (!g.byModule.has(l.moduleId)) {
      g.byModule.set(l.moduleId, []);
      g.moduleOrder.push(l.moduleId);
    }
    g.byModule.get(l.moduleId)!.push(l);
  }

  // Metrics — tonnage + TUST by week (last 6 weeks, oldest -> newest) +
  // this-week / prev-week totals, bucketed by each log's created_at.
  const N_WEEKS = 6;
  const weeklyTonnage = new Array<number>(N_WEEKS).fill(0);
  const weeklyTust = new Array<number>(N_WEEKS).fill(0);
  let tonnageKg = 0;
  let prevTonnageKg = 0;
  let tustSeconds = 0;
  for (const l of pulseLogs) {
    if (l.skipped) continue;
    const t = new Date(l.created_at);
    const ls = toLoggedSet(l);
    const ton = setTonnage(ls);
    const tus = estimateSetTust(ls, tempoFromLog(l));
    const diffWeeks = Math.round((monday.getTime() - mondayOf(t).getTime()) / (7 * 86400000));
    const idx = N_WEEKS - 1 - diffWeeks;
    if (idx >= 0 && idx < N_WEEKS) {
      weeklyTonnage[idx] += ton;
      weeklyTust[idx] += tus;
    }
    if (diffWeeks === 0) {
      tonnageKg += ton;
      tustSeconds += tus;
    } else if (diffWeeks === 1) {
      prevTonnageKg += ton;
    }
  }

  // Per-session exercise rows: flags + PRs.
  const sessions: PulseSession[] = [];
  const needsEyes: NeedsEyesItem[] = [];
  let prCount = 0;
  let progressingCount = 0;
  let progressingTotal = 0;

  // chronological session order (oldest first) for the week
  const weekModulesSorted = [...weekModules].sort((a, b) => a.date.localeCompare(b.date));

  for (const mod of weekModulesSorted) {
    const rows: PulseExerciseRow[] = [];
    let sessionPrCount = 0;
    let flagged = 0;

    for (const [exerciseId, g] of byExercise) {
      const thisSessionSets = g.byModule.get(mod.id);
      if (!thisSessionSets || thisSessionSets.length === 0) continue;

      const meta = exMeta.get(exerciseId);
      const category = meta?.category ?? null;
      const thisLogged = thisSessionSets.map(toLoggedSet);

      // Previous session = the module immediately before this one for this
      // exercise; prior history = everything before this module.
      const idx = g.moduleOrder.indexOf(mod.id);
      const prevModuleId = idx > 0 ? g.moduleOrder[idx - 1] : null;
      const prevLogged = prevModuleId
        ? (g.byModule.get(prevModuleId) ?? []).map(toLoggedSet)
        : [];
      const priorLogged: LoggedSet[] = [];
      for (let i = 0; i < idx; i++) {
        for (const l of g.byModule.get(g.moduleOrder[i]) ?? []) priorLogged.push(toLoggedSet(l));
      }

      const prescription = prescriptionFromLog(thisSessionSets[0]);
      const flag = progressionFlag({
        category,
        thisSets: thisLogged,
        prevSets: prevLogged,
        prescription,
      });
      const prs = detectExercisePrs(category, thisLogged, priorLogged);
      const celebrated = prs.filter((p) => p.celebrate);
      sessionPrCount += celebrated.length;

      // "Progressing" = lifts flagged up, over lifts that had a comparison.
      if (flag !== "none") progressingTotal += 1;
      if (flag === "up") progressingCount += 1;

      const name = meta?.name ?? "Exercise";
      const curBest = fmtBest(thisLogged.find((s) => s.performedLoad != null) ?? null);
      const prevBest = fmtBest(prevLogged.find((s) => s.performedLoad != null) ?? null);
      const summary = curBest
        ? prevBest && prevBest !== curBest
          ? `${prevBest} → ${curBest}`
          : curBest
        : null;

      if (flag === "down" || flag === "off_prescription") {
        flagged += 1;
        needsEyes.push({
          sessionTitle: mod.title,
          exerciseName: name,
          flag,
          detail:
            flag === "down"
              ? `regressed vs last session (${summary ?? "—"})`
              : `out of prescription (${summary ?? "—"})`,
        });
      }

      rows.push({ exerciseId, name, category, flag, prs, summary });
    }

    prCount += sessionPrCount;
    // Skip completed-but-empty modules (e.g. a stray program with no logged
    // exercises) -- nothing to review, just noise.
    if (rows.length > 0) {
      sessions.push({
        moduleId: mod.id,
        title: mod.title,
        date: mod.date,
        prCount: sessionPrCount,
        flagged,
        exercises: rows,
      });
    }
  }

  // newest session first for display
  sessions.reverse();

  return {
    loading: false,
    adherencePct: weeklyScheduled > 0 ? Math.round((weeklyCompleted / weeklyScheduled) * 100) : null,
    weeklyCompleted,
    weeklyScheduled,
    tonnageKg: Math.round(tonnageKg),
    prevTonnageKg: Math.round(prevTonnageKg),
    tustSeconds: Math.round(tustSeconds),
    prCount,
    progressingCount,
    progressingTotal,
    flagCount: needsEyes.length,
    weeklyTonnage: weeklyTonnage.map((n) => Math.round(n)),
    weeklyTust: weeklyTust.map((n) => Math.round(n)),
    needsEyes,
    sessions,
  };
}

// ──────────────────────────────────────────────────────────────────────────────

export function useWorkoutPulse(clientUserId: string): WorkoutPulse {
  const [data, setData] = useState<WorkoutPulse>(EMPTY);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async (userId: string) => {
    setData((d) => ({ ...d, loading: true }));

    const monday = mondayOf(new Date());
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    // ── board_v2: canonical assignment logs + schedule (deload-aware) ──────────
    if (isBoardV2Enabled()) {
      const assignment = await resolveActiveAssignment(userId);
      if (assignment) {
        const schedule = await loadCanonicalSchedule(assignment.id);
        if (schedule) {
          const canonicalLogs = await loadCanonicalWorkoutLogs(assignment.id);

          const exMeta: ExMeta = new Map();
          const pulseLogs: PulseLog[] = [];
          for (const cl of canonicalLogs) {
            // Non-library activity slots (cardio/mobility w/o exercise_id) carry no
            // PR/flag/tonnage semantics — parity with legacy, which only logged
            // library exercises. They never contributed to the pulse there either.
            if (!cl.exerciseId) continue;
            pulseLogs.push({
              exerciseId: cl.exerciseId,
              moduleId: cl.planSessionId,
              set_index: cl.set_index,
              skipped: cl.skipped,
              performed_load: cl.performed_load,
              performed_reps: cl.performed_reps,
              performed_rir: cl.performed_rir,
              performed_rpe: cl.performed_rpe,
              performed_json: cl.performed_json,
              prescribed: cl.prescribed,
              created_at: cl.created_at,
            });
            if (!exMeta.has(cl.exerciseId))
              exMeta.set(cl.exerciseId, { name: cl.exerciseName, category: cl.category });
          }

          // This week's scheduled/completed modules from the (deload-aware) schedule.
          const weekStart = isoDate(monday);
          const weekEnd = isoDate(sunday);
          let weeklyScheduled = 0;
          let weeklyCompleted = 0;
          const weekModules: WeekModule[] = [];
          for (const [iso, day] of schedule.byDate) {
            if (iso < weekStart || iso > weekEnd) continue;
            for (const m of day.modules) {
              weeklyScheduled += 1;
              if (m.status === "completed") {
                weeklyCompleted += 1;
                weekModules.push({ id: m.id, title: canonicalSessionTitle(m), date: iso });
              }
            }
          }

          setData(computePulse(pulseLogs, exMeta, weekModules, weeklyScheduled, weeklyCompleted, monday));
          return;
        }
        // schedule null → fall through to legacy (belt-and-suspenders: never render
        // empty canonical analytics on a partial/failed canonical read).
      }
      // no assignment → fall through to legacy.
    }

    // ── legacy path (unchanged behaviour) ─────────────────────────────────────
    // 1. Active programs.
    const { data: programs } = await supabase
      .from("client_programs")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active");
    const programIds = (programs ?? []).map((p) => p.id);
    if (programIds.length === 0) {
      setData({ ...EMPTY, loading: false, adherencePct: null });
      return;
    }

    // 2. This week's days + modules (scheduled + completed for adherence).
    const { data: dayRows } = await supabase
      .from("client_program_days")
      .select("id, date")
      .in("client_program_id", programIds)
      .gte("date", isoDate(monday))
      .lte("date", isoDate(sunday));
    const dayById = new Map((dayRows ?? []).map((d) => [d.id, d.date as string]));
    const dayIds = [...dayById.keys()];

    let weeklyScheduled = 0;
    let weeklyCompleted = 0;
    const weekModules: WeekModule[] = [];
    if (dayIds.length > 0) {
      const { data: mods } = await supabase
        .from("client_day_modules")
        .select("id, title, client_program_day_id, completed_at")
        .in("client_program_day_id", dayIds);
      for (const m of mods ?? []) {
        weeklyScheduled += 1;
        if (m.completed_at) {
          weeklyCompleted += 1;
          weekModules.push({
            id: m.id,
            title: m.title ?? "Session",
            date: dayById.get(m.client_program_day_id) ?? "",
          });
        }
      }
    }

    // 3. All of the client's set logs (PR/flag history needs full prior history).
    const { data: logRows } = await supabase
      .from("exercise_set_logs")
      .select(
        "client_module_exercise_id, set_index, skipped, performed_load, performed_reps, performed_rir, performed_rpe, performed_json, prescribed, created_at",
      )
      .eq("created_by_user_id", userId)
      .order("created_at", { ascending: true });
    const rawLogs = (logRows ?? []) as RawLog[];

    // 4. Map client_module_exercise_id -> { exercise_id, module_id }.
    const cmeIds = [...new Set(rawLogs.map((l) => l.client_module_exercise_id))];
    const cmeMap = new Map<string, { exerciseId: string; moduleId: string }>();
    if (cmeIds.length > 0) {
      const { data: cmes } = await supabase
        .from("client_module_exercises")
        .select("id, exercise_id, client_day_module_id")
        .in("id", cmeIds);
      for (const c of cmes ?? []) {
        cmeMap.set(c.id, { exerciseId: c.exercise_id, moduleId: c.client_day_module_id });
      }
    }

    // 5. Exercise names + categories.
    const exerciseIds = [...new Set([...cmeMap.values()].map((v) => v.exerciseId))];
    const exMeta: ExMeta = new Map();
    if (exerciseIds.length > 0) {
      const { data: lib } = await supabase
        .from("exercise_library")
        .select("id, name, category")
        .in("id", exerciseIds);
      for (const e of lib ?? []) exMeta.set(e.id, { name: e.name, category: e.category });
    }

    // Normalise to PulseLog (drop logs whose cme is unreadable/missing — in practice
    // the FK + RLS coupling means a readable log always has a readable cme).
    const pulseLogs: PulseLog[] = [];
    for (const l of rawLogs) {
      const meta = cmeMap.get(l.client_module_exercise_id);
      if (!meta) continue;
      pulseLogs.push({
        exerciseId: meta.exerciseId,
        moduleId: meta.moduleId,
        set_index: l.set_index,
        skipped: l.skipped,
        performed_load: l.performed_load,
        performed_reps: l.performed_reps,
        performed_rir: l.performed_rir,
        performed_rpe: l.performed_rpe,
        performed_json: l.performed_json,
        prescribed: l.prescribed,
        created_at: l.created_at,
      });
    }

    setData(computePulse(pulseLogs, exMeta, weekModules, weeklyScheduled, weeklyCompleted, monday));
  }, []);

  useEffect(() => {
    if (hasFetched.current === clientUserId) return;
    hasFetched.current = clientUserId;
    load(clientUserId).catch((err) => {
      console.error("[useWorkoutPulse]", err);
      setData({ ...EMPTY, loading: false });
    });
  }, [clientUserId, load]);

  return data;
}
