// src/components/nutrition/AllPhasesStepsChart.tsx
//
// Long-duration daily-steps timeline across all of a client's phases (HT).
// Thin loader over PhaseAnnotatedTrendChart.

import { useCallback, useEffect, useRef, useState } from "react";
import { Footprints } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  PhaseAnnotatedTrendChart,
  type TrendPoint,
  type TrendPhase,
} from "@/components/client-overview/charts/PhaseAnnotatedTrendChart";

export function AllPhasesStepsChart({ clientUserId }: { clientUserId: string }) {
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [phases, setPhases] = useState<TrendPhase[]>([]);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async (userId: string) => {
    const [stepsRes, phasesRes] = await Promise.all([
      supabase
        .from("step_logs")
        .select("log_date, steps")
        .eq("user_id", userId)
        .order("log_date", { ascending: true }),
      supabase
        .from("nutrition_phases")
        .select("start_date, phase_name")
        .eq("user_id", userId)
        .order("start_date", { ascending: true }),
    ]);
    if (stepsRes.error) console.warn("[AllPhasesStepsChart] steps:", stepsRes.error.message);
    if (phasesRes.error) console.warn("[AllPhasesStepsChart] phases:", phasesRes.error.message);

    setPoints(
      (stepsRes.data ?? [])
        .map((s) => ({ t: new Date(s.log_date).getTime(), value: Number(s.steps) }))
        .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.value)),
    );
    setPhases(
      (phasesRes.data ?? [])
        .map((p) => ({ t: new Date(p.start_date).getTime(), name: p.phase_name ?? "Phase" }))
        .filter((m) => Number.isFinite(m.t)),
    );
  }, []);

  useEffect(() => {
    if (hasFetched.current === clientUserId) return;
    hasFetched.current = clientUserId;
    load(clientUserId).catch((err) => console.error("[AllPhasesStepsChart]", err));
  }, [clientUserId, load]);

  return (
    <PhaseAnnotatedTrendChart
      title="Steps across phases"
      description="daily steps"
      icon={Footprints}
      points={points}
      phases={phases}
      unit="steps"
      formatValue={(v) => Math.round(v).toLocaleString()}
      betterDirection="up"
      emptyLabel="No step data recorded yet."
    />
  );
}
