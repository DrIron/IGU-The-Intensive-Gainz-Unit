// src/components/nutrition/AllPhasesCircumferenceChart.tsx
//
// Multi-series body-circumference timeline across all of a client's phases (HT).
// Waist / chest / hips / thighs each get their own colored line on the shared
// PhaseAnnotatedTrendChart, with phase bands + duration toggle. Only metrics
// that actually have readings render as series.

import { useCallback, useEffect, useRef, useState } from "react";
import { Ruler } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  PhaseAnnotatedTrendChart,
  type TrendSeries,
  type TrendPhase,
} from "@/components/client-overview/charts/PhaseAnnotatedTrendChart";

const METRICS: { key: "waist_cm" | "chest_cm" | "hips_cm" | "thighs_cm"; name: string; color: string }[] = [
  { key: "waist_cm", name: "Waist", color: "#f43f5e" },
  { key: "chest_cm", name: "Chest", color: "#3b82f6" },
  { key: "hips_cm", name: "Hips", color: "#f59e0b" },
  { key: "thighs_cm", name: "Thighs", color: "#22c55e" },
];

interface CircRow {
  log_date: string;
  waist_cm: number | null;
  chest_cm: number | null;
  hips_cm: number | null;
  thighs_cm: number | null;
}

export function AllPhasesCircumferenceChart({ clientUserId }: { clientUserId: string }) {
  const [series, setSeries] = useState<TrendSeries[]>([]);
  const [phases, setPhases] = useState<TrendPhase[]>([]);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async (userId: string) => {
    const [circRes, phasesRes] = await Promise.all([
      supabase
        .from("circumference_logs")
        .select("log_date, waist_cm, chest_cm, hips_cm, thighs_cm")
        .eq("user_id", userId)
        .order("log_date", { ascending: true }),
      supabase
        .from("nutrition_phases")
        .select("start_date, phase_name")
        .eq("user_id", userId)
        .order("start_date", { ascending: true }),
    ]);
    if (circRes.error) console.warn("[AllPhasesCircumferenceChart] circumference:", circRes.error.message);
    if (phasesRes.error) console.warn("[AllPhasesCircumferenceChart] phases:", phasesRes.error.message);

    const rows = (circRes.data ?? []) as CircRow[];
    const built: TrendSeries[] = METRICS.map((m) => ({
      key: m.key,
      name: m.name,
      color: m.color,
      points: rows
        .map((r) => ({ t: new Date(r.log_date).getTime(), value: Number(r[m.key]) }))
        .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.value)),
    })).filter((s) => s.points.length > 0);

    setSeries(built);
    setPhases(
      (phasesRes.data ?? [])
        .map((p) => ({ t: new Date(p.start_date).getTime(), name: p.phase_name ?? "Phase" }))
        .filter((m) => Number.isFinite(m.t)),
    );
  }, []);

  useEffect(() => {
    if (hasFetched.current === clientUserId) return;
    hasFetched.current = clientUserId;
    load(clientUserId).catch((err) => console.error("[AllPhasesCircumferenceChart]", err));
  }, [clientUserId, load]);

  return (
    <PhaseAnnotatedTrendChart
      title="Measurements across phases"
      description="body circumference"
      icon={Ruler}
      series={series}
      phases={phases}
      unit="cm"
      formatValue={(v) => v.toFixed(1)}
      emptyLabel="No body measurements logged yet."
    />
  );
}
