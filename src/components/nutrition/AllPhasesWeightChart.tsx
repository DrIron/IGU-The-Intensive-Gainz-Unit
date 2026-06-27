// src/components/nutrition/AllPhasesWeightChart.tsx
//
// Long-duration weight timeline across ALL of a client's nutrition phases, with
// vertical markers at each phase boundary (redesign nutrition Stage 4 / N2).
// Complements the existing phase-scoped CoachNutritionGraphs (week-number axis)
// with a single date-axis view of the whole journey.
//
// Coach-readable via the same RLS as weight_logs / nutrition_phases; degrade-safe
// (empty -> calm empty state).

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { LineChart as LineChartIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Point {
  t: number; // log_date as ms timestamp
  weight: number;
}
interface PhaseMark {
  t: number;
  name: string;
}

export function AllPhasesWeightChart({ clientUserId }: { clientUserId: string }) {
  const [points, setPoints] = useState<Point[]>([]);
  const [marks, setMarks] = useState<PhaseMark[]>([]);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async (userId: string) => {
    setLoading(true);
    const [weightsRes, phasesRes] = await Promise.all([
      supabase
        .from("weight_logs")
        .select("log_date, weight_kg")
        .eq("user_id", userId)
        .order("log_date", { ascending: true }),
      supabase
        .from("nutrition_phases")
        .select("start_date, phase_name")
        .eq("user_id", userId)
        .order("start_date", { ascending: true }),
    ]);
    if (weightsRes.error) console.warn("[AllPhasesWeightChart] weights:", weightsRes.error.message);
    if (phasesRes.error) console.warn("[AllPhasesWeightChart] phases:", phasesRes.error.message);

    const pts: Point[] = (weightsRes.data ?? [])
      .map((w) => ({ t: new Date(w.log_date).getTime(), weight: Number(w.weight_kg) }))
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.weight));
    const phaseMarks: PhaseMark[] = (phasesRes.data ?? [])
      .map((p) => ({ t: new Date(p.start_date).getTime(), name: p.phase_name ?? "Phase" }))
      .filter((m) => Number.isFinite(m.t));

    setPoints(pts);
    setMarks(phaseMarks);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (hasFetched.current === clientUserId) return;
    hasFetched.current = clientUserId;
    load(clientUserId).catch((err) => {
      console.error("[AllPhasesWeightChart]", err);
      setLoading(false);
    });
  }, [clientUserId, load]);

  const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <LineChartIcon className="h-4 w-4" aria-hidden="true" />
          Weight across phases
        </CardTitle>
        <CardDescription>The whole journey, with a marker at each phase start.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-56 rounded bg-muted animate-pulse" />
        ) : points.length < 2 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Not enough weigh-ins yet to chart a trend.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis
                type="number"
                dataKey="t"
                domain={["dataMin", "dataMax"]}
                scale="time"
                tickFormatter={fmtDate}
                tick={{ fontSize: 10 }}
                minTickGap={32}
              />
              <YAxis
                domain={["dataMin - 1", "dataMax + 1"]}
                tickFormatter={(v) => `${Math.round(v)}`}
                tick={{ fontSize: 10 }}
                width={32}
              />
              <Tooltip
                labelFormatter={(t) => new Date(Number(t)).toLocaleDateString()}
                formatter={(v: number) => [`${v.toFixed(1)} kg`, "Weight"]}
                contentStyle={{ fontSize: 12 }}
              />
              {marks.map((m, i) => (
                <ReferenceLine
                  key={`${m.t}-${i}`}
                  x={m.t}
                  stroke="hsl(var(--status-ontrack))"
                  strokeDasharray="3 3"
                  label={{ value: m.name, position: "insideTopLeft", fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                />
              ))}
              <Line
                type="monotone"
                dataKey="weight"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
