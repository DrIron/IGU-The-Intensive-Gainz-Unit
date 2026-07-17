// src/components/client-overview/workouts/WorkoutHistoryTrends.tsx
//
// Long-duration training trends for the Workouts History sub-tab (HT):
// weekly tonnage + weekly time-under-tension, bucketed across the client's whole
// logging history and marked by nutrition-phase bands (same vocabulary as the
// nutrition History trends). Reuses the tonnage / TUST primitives from
// useWorkoutPulse's source-of-truth helpers.
//
// Degrade-safe: any failed read leaves the slice empty -> the shared chart shows
// its calm empty state.

import { useCallback, useEffect, useRef, useState } from "react";
import { Dumbbell, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { setTonnage, estimateSetTust } from "@/utils/workoutFlags";
import type { LoggedSet } from "@/utils/prEngine";
import {
  PhaseAnnotatedTrendChart,
  type TrendPoint,
  type TrendPhase,
} from "@/components/client-overview/charts/PhaseAnnotatedTrendChart";

interface RawLog {
  skipped: boolean;
  performed_load: number | null;
  performed_reps: number | null;
  performed_rir: number | null;
  performed_rpe: number | null;
  performed_json: Record<string, unknown> | null;
  prescribed: Record<string, unknown> | null;
  created_at: string;
}

function toLoggedSet(r: RawLog): LoggedSet {
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

function tempoFromLog(r: RawLog): string | null {
  const p = r.prescribed as Record<string, unknown> | null;
  return p && typeof p.tempo === "string" ? p.tempo : null;
}

function mondayOf(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function WorkoutHistoryTrends({ clientUserId }: { clientUserId: string }) {
  const [tonnage, setTonnagePoints] = useState<TrendPoint[]>([]);
  const [tust, setTustPoints] = useState<TrendPoint[]>([]);
  const [phases, setPhases] = useState<TrendPhase[]>([]);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async (userId: string) => {
    const [logsRes, phasesRes] = await Promise.all([
      supabase
        .from("exercise_set_logs")
        .select(
          "skipped, performed_load, performed_reps, performed_rir, performed_rpe, performed_json, prescribed, created_at",
        )
        .eq("created_by_user_id", userId)
        .order("created_at", { ascending: true }),
      supabase
        .from("nutrition_phases")
        .select("start_date, phase_name")
        .eq("user_id", userId)
        .order("start_date", { ascending: true }),
    ]);
    if (logsRes.error) console.warn("[WorkoutHistoryTrends] logs:", logsRes.error.message);
    if (phasesRes.error) console.warn("[WorkoutHistoryTrends] phases:", phasesRes.error.message);

    // Bucket tonnage + TUST by ISO week (Monday).
    const tonByWeek = new Map<number, number>();
    const tusByWeek = new Map<number, number>();
    for (const raw of (logsRes.data ?? []) as RawLog[]) {
      if (raw.skipped) continue;
      const wk = mondayOf(new Date(raw.created_at)).getTime();
      if (!Number.isFinite(wk)) continue;
      const ls = toLoggedSet(raw);
      tonByWeek.set(wk, (tonByWeek.get(wk) ?? 0) + setTonnage(ls));
      tusByWeek.set(wk, (tusByWeek.get(wk) ?? 0) + estimateSetTust(ls, tempoFromLog(raw)));
    }

    const tonPts = [...tonByWeek.entries()]
      .map(([t, v]) => ({ t, value: Math.round(v) }))
      .sort((a, b) => a.t - b.t);
    const tusPts = [...tusByWeek.entries()]
      .map(([t, v]) => ({ t, value: Math.round((v / 60) * 10) / 10 })) // seconds -> minutes
      .sort((a, b) => a.t - b.t);

    setTonnagePoints(tonPts);
    setTustPoints(tusPts);
    setPhases(
      (phasesRes.data ?? [])
        .map((p) => ({ t: new Date(p.start_date).getTime(), name: p.phase_name ?? "Phase" }))
        .filter((m) => Number.isFinite(m.t)),
    );
  }, []);

  useEffect(() => {
    if (hasFetched.current === clientUserId) return;
    hasFetched.current = clientUserId;
    load(clientUserId).catch((err) => console.error("[WorkoutHistoryTrends]", err));
  }, [clientUserId, load]);

  return (
    <div className="space-y-5">
      <PhaseAnnotatedTrendChart
        title="Weekly tonnage across phases"
        description="total load lifted per week"
        icon={Dumbbell}
        points={tonnage}
        phases={phases}
        unit="kg"
        formatValue={(v) => Math.round(v).toLocaleString()}
        betterDirection="up"
        emptyLabel="No logged sets yet to chart tonnage."
      />
      <PhaseAnnotatedTrendChart
        title="Weekly time under tension across phases"
        description="estimated working minutes per week"
        icon={Timer}
        points={tust}
        phases={phases}
        unit="min"
        formatValue={(v) => `${Math.round(v)}`}
        betterDirection="neutral"
        emptyLabel="No logged sets yet to chart time under tension."
      />
    </div>
  );
}
