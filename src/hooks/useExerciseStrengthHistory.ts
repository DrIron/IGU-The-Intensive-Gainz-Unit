// src/hooks/useExerciseStrengthHistory.ts
//
// HX1 — shared canonical exercise-history hook backing BOTH client history surfaces
// (ExerciseHistory.tsx page + ExerciseHistoryPanel.tsx live panel) so the twins stop
// drifting. Replaces the old estimated one-rep-max (Epley) model + the dead `client_module_exercises!inner`
// embed (that FK was dropped in P5/B1). Everything is ACTUAL logged numbers — no estimation.
//
// Reads are canonical (plan_slot_id-keyed):
//   picker  = distinct movements the client has logs for
//             (exercise_set_logs → plan_slots.exercise_id → exercise_library.name)
//   history = loadCrossInstanceHistory(userId, [exerciseId]) — two batched in() reads,
//             no per-exercise fan-out. Session date = created_at's calendar day.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { selectWithRetry } from "@/lib/selectWithRetry";
import { loadCrossInstanceHistory } from "@/lib/canonicalSessionResolver";

export interface ExerciseOption {
  id: string;
  name: string;
}

/** One logged set, for the per-set performance table. */
export interface StrengthLogEntry {
  key: string;
  date: string; // YYYY-MM-DD (from created_at's calendar day)
  set_index: number;
  performed_reps: number | null;
  performed_load: number | null;
  performed_rir: number | null;
  performed_rpe: number | null;
  notes: string | null;
}

/** All-time + per-session rep-max analysis (no estimation). */
export interface RepMaxAnalysis {
  /** All-time heaviest load logged at each exact rep count. */
  bestLoadAtReps: Map<number, number>;
  /** Per rep count → per session (date) the max load logged at that exact rep, date-ascending. */
  sessionsByRep: Map<number, { date: string; bestLoad: number }[]>;
  /** Rep counts present, ascending — the chip options. */
  availableReps: number[];
  /** Densest bracket: most distinct sessions, tiebreak → lower rep count. */
  defaultHeadlineReps: number | null;
  /** Heaviest single set overall. */
  prTopLoad: { value: number; date: string } | null;
  /** Best single-session volume (Σ load×reps). */
  prVolume: { value: number; date: string } | null;
}

/** The trend series for a chosen rep bracket (headline sparkline + delta). */
export interface RepMaxSeries {
  series: number[];
  latest: number;
  delta: number;
  sessionCount: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const dayOf = (isoTimestamp: string) => isoTimestamp.slice(0, 10);

function maxInto(map: Map<number, number>, key: number, v: number) {
  const cur = map.get(key);
  if (cur == null || v > cur) map.set(key, v);
}

function bestVolume(volumeByDate: Map<string, number>): { value: number; date: string } | null {
  let best: { value: number; date: string } | null = null;
  for (const [date, value] of volumeByDate) {
    if (!best || value > best.value) best = { value, date };
  }
  return best;
}

/**
 * Fold the client's logged sets for ONE movement into the rep-max analysis.
 * Only sets with a positive load feed the heaviest-set tile; sets that ALSO
 * carry a positive rep count feed the "best load at N reps" model (a set with
 * no reps has no rep bracket to belong to).
 */
export function analyzeRepMaxHistory(entries: StrengthLogEntry[]): RepMaxAnalysis | null {
  if (entries.length === 0) return null;

  const bestLoadAtReps = new Map<number, number>();
  const byRepByDate = new Map<number, Map<string, number>>(); // reps → date → best load that day
  const volumeByDate = new Map<string, number>();
  let prTopLoad: { value: number; date: string } | null = null;

  for (const e of entries) {
    const load = e.performed_load;
    const reps = e.performed_reps;
    const date = e.date;
    if (load == null || load <= 0) continue;

    // Heaviest single set overall (independent of rep count).
    if (!prTopLoad || load > prTopLoad.value) prTopLoad = { value: load, date };

    if (reps == null || reps <= 0) continue;

    maxInto(bestLoadAtReps, reps, load);

    let dateMap = byRepByDate.get(reps);
    if (!dateMap) {
      dateMap = new Map<string, number>();
      byRepByDate.set(reps, dateMap);
    }
    const dayBest = dateMap.get(date);
    if (dayBest == null || load > dayBest) dateMap.set(date, load);

    volumeByDate.set(date, (volumeByDate.get(date) ?? 0) + load * reps);
  }

  const sessionsByRep = new Map<number, { date: string; bestLoad: number }[]>();
  for (const [reps, dateMap] of byRepByDate) {
    const arr = Array.from(dateMap.entries())
      .map(([date, bestLoad]) => ({ date, bestLoad }))
      .sort((a, b) => a.date.localeCompare(b.date));
    sessionsByRep.set(reps, arr);
  }

  const availableReps = Array.from(sessionsByRep.keys()).sort((a, b) => a - b);
  // Densest bracket: most distinct sessions, tiebreak → lower rep count (heavier/stronger bias).
  const defaultHeadlineReps = availableReps.reduce<number | null>((best, reps) => {
    if (best == null) return reps;
    const a = sessionsByRep.get(reps)!.length;
    const b = sessionsByRep.get(best)!.length;
    if (a > b) return reps;
    if (a === b && reps < best) return reps;
    return best;
  }, null);

  return {
    bestLoadAtReps,
    sessionsByRep,
    availableReps,
    defaultHeadlineReps,
    prTopLoad,
    prVolume: bestVolume(volumeByDate),
  };
}

/** Trend series for a chosen rep bracket (the headline sparkline + delta). */
export function seriesForReps(analysis: RepMaxAnalysis | null, reps: number | null): RepMaxSeries | null {
  if (!analysis || reps == null) return null;
  const sessions = analysis.sessionsByRep.get(reps);
  if (!sessions || sessions.length === 0) return null;
  const series = sessions.map((s) => round1(s.bestLoad));
  const latest = series[series.length - 1];
  const delta = round1(series[series.length - 1] - series[0]);
  return { series, latest, delta, sessionCount: series.length };
}

export interface UseExerciseStrengthHistoryReturn {
  exercises: ExerciseOption[];
  exercisesLoading: boolean;
  selectedExercise: string;
  setSelectedExercise: (id: string) => void;
  logs: StrengthLogEntry[];
  logsLoading: boolean;
  analysis: RepMaxAnalysis | null;
}

export function useExerciseStrengthHistory(): UseExerciseStrengthHistoryReturn {
  const { toast } = useToast();
  const { user, isLoading: sessionLoading } = useAuthSession();
  const [exercises, setExercises] = useState<ExerciseOption[]>([]);
  const [exercisesLoading, setExercisesLoading] = useState(true);
  const [selectedExercise, setSelectedExercise] = useState<string>("");
  const [logs, setLogs] = useState<StrengthLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Picker: distinct movements the client has canonical logs for.
  const loadExercises = useCallback(
    async (currentUser: SupabaseUser | null) => {
      try {
        if (!currentUser) return;
        // 1) distinct plan_slot_ids the client has logged.
        const { data: logRows, error: logErr } = await selectWithRetry(() =>
          supabase
            .from("exercise_set_logs")
            .select("plan_slot_id")
            .eq("created_by_user_id", currentUser.id)
            .not("plan_slot_id", "is", null),
        );
        if (logErr) throw logErr;
        const slotIds = [...new Set((logRows ?? []).map((r) => r.plan_slot_id).filter((v): v is string => Boolean(v)))];
        if (slotIds.length === 0) {
          setExercises([]);
          return;
        }
        // 2) slot → exercise_id.
        const { data: slots, error: slotErr } = await selectWithRetry(() =>
          supabase.from("plan_slots").select("id, exercise_id").in("id", slotIds),
        );
        if (slotErr) throw slotErr;
        const exerciseIds = [...new Set((slots ?? []).map((s) => s.exercise_id).filter((v): v is string => Boolean(v)))];
        if (exerciseIds.length === 0) {
          setExercises([]);
          return;
        }
        // 3) exercise_id → name.
        const { data: lib, error: libErr } = await selectWithRetry(() =>
          supabase.from("exercise_library").select("id, name").in("id", exerciseIds),
        );
        if (libErr) throw libErr;
        const exerciseList: ExerciseOption[] = (lib ?? [])
          .map((e) => ({ id: e.id as string, name: (e.name as string) ?? "" }))
          .filter((e) => e.id && e.name)
          .sort((a, b) => a.name.localeCompare(b.name));
        setExercises(exerciseList);
      } catch (error: unknown) {
        console.error("Error loading exercises:", error);
        toast({ title: "Error loading exercises", description: sanitizeErrorForUser(error), variant: "destructive" });
      } finally {
        setExercisesLoading(false);
      }
    },
    [toast],
  );

  // Per-exercise history via the canonical cross-instance resolver.
  const loadExerciseLogs = useCallback(async () => {
    if (!selectedExercise || !user) return;
    setLogsLoading(true);
    try {
      const byExercise = await loadCrossInstanceHistory(user.id, [selectedExercise]);
      const rows = byExercise.get(selectedExercise) ?? [];
      const formatted: StrengthLogEntry[] = rows.map((r) => ({
        key: `${r.plan_slot_id}-${r.set_index}-${r.created_at}`,
        date: dayOf(r.created_at),
        set_index: r.set_index,
        performed_reps: r.performed_reps,
        performed_load: r.performed_load,
        performed_rir: r.performed_rir,
        performed_rpe: r.performed_rpe,
        notes: r.notes,
      }));
      setLogs(formatted);
    } catch (error: unknown) {
      console.error("Error loading logs:", error);
      toast({ title: "Error loading history", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setLogsLoading(false);
    }
  }, [selectedExercise, user, toast]);

  // Keyed on session state so the effect retries once the session resolves.
  const hasLoadedExercises = useRef<string | null>(null);
  useEffect(() => {
    const key = user?.id ?? (sessionLoading ? "__waiting__" : "__unauth__");
    if (hasLoadedExercises.current === key) return;
    hasLoadedExercises.current = key;
    if (sessionLoading) return;
    loadExercises(user ?? null);
  }, [user, sessionLoading, loadExercises]);

  useEffect(() => {
    if (selectedExercise) loadExerciseLogs();
    else setLogs([]);
  }, [selectedExercise, loadExerciseLogs]);

  const analysis = useMemo(() => analyzeRepMaxHistory(logs), [logs]);

  return {
    exercises,
    exercisesLoading,
    selectedExercise,
    setSelectedExercise,
    logs,
    logsLoading,
    analysis,
  };
}

export default useExerciseStrengthHistory;
