// src/components/nutrition/AllPhasesBodyFatChart.tsx
//
// Long-duration body-fat % timeline across all of a client's phases (HT).
// Thin loader over PhaseAnnotatedTrendChart. body_fat_logs has no phase_id, so
// phases come from nutrition_phases by user_id (same as the weight chart).

import { useCallback, useEffect, useRef, useState } from "react";
import { Percent } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  PhaseAnnotatedTrendChart,
  type TrendPoint,
  type TrendPhase,
} from "@/components/client-overview/charts/PhaseAnnotatedTrendChart";

export function AllPhasesBodyFatChart({ clientUserId }: { clientUserId: string }) {
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [phases, setPhases] = useState<TrendPhase[]>([]);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async (userId: string) => {
    const [bfRes, phasesRes] = await Promise.all([
      supabase
        .from("body_fat_logs")
        .select("log_date, body_fat_percentage")
        .eq("user_id", userId)
        .order("log_date", { ascending: true }),
      supabase
        .from("nutrition_phases")
        .select("start_date, phase_name")
        .eq("user_id", userId)
        .order("start_date", { ascending: true }),
    ]);
    if (bfRes.error) console.warn("[AllPhasesBodyFatChart] body_fat:", bfRes.error.message);
    if (phasesRes.error) console.warn("[AllPhasesBodyFatChart] phases:", phasesRes.error.message);

    setPoints(
      (bfRes.data ?? [])
        .map((b) => ({ t: new Date(b.log_date).getTime(), value: Number(b.body_fat_percentage) }))
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
    load(clientUserId).catch((err) => console.error("[AllPhasesBodyFatChart]", err));
  }, [clientUserId, load]);

  return (
    <PhaseAnnotatedTrendChart
      title="Body fat across phases"
      description="body fat %"
      icon={Percent}
      points={points}
      phases={phases}
      unit="%"
      betterDirection="down"
      emptyLabel="No body-fat readings logged yet."
    />
  );
}
