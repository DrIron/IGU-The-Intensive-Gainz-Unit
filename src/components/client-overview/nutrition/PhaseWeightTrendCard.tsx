import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Scale } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface PhaseWeightTrendCardProps {
  /** The active/selected nutrition phase (or null). */
  phase: { id: string; starting_weight_kg?: number | string | null; target_weight_kg?: number | string | null } | null;
}

interface Point {
  date: string;
  weight: number;
}

/**
 * Compact weight-trend card for the Nutrition tab's Overview sub-tab.
 *
 * Promoted from the retired Progress tab so the coach sees the weight line
 * without drilling into Nutrition -> History (which keeps the full
 * body-comp + circumference graphs via CoachNutritionGraphs). Read-only,
 * phase-scoped: a single SELECT on weight_logs by phase_id. Renders nothing
 * when there is no active phase.
 */
export function PhaseWeightTrendCard({ phase }: PhaseWeightTrendCardProps) {
  const [points, setPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!phase?.id) {
      setPoints([]);
      setLoading(false);
      return;
    }
    if (fetchedRef.current === phase.id) return;
    fetchedRef.current = phase.id;
    setLoading(true);
    supabase
      .from("weight_logs")
      .select("weight_kg, log_date")
      .eq("phase_id", phase.id)
      .order("log_date", { ascending: true })
      .then(({ data, error }) => {
        if (error) console.warn("[PhaseWeightTrendCard] weight_logs:", error.message);
        setPoints(
          (data ?? [])
            .map((l) => ({
              date: new Date(l.log_date as string).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
              weight: parseFloat(String(l.weight_kg)),
            }))
            .filter((p) => !Number.isNaN(p.weight)),
        );
        setLoading(false);
      });
  }, [phase]);

  if (!phase) return null;

  const startKg = phase.starting_weight_kg != null ? parseFloat(String(phase.starting_weight_kg)) : null;
  const targetKg = phase.target_weight_kg != null ? parseFloat(String(phase.target_weight_kg)) : null;
  const current = points.length > 0 ? points[points.length - 1].weight : null;
  const delta = current != null && startKg != null ? current - startKg : null;

  // Toward the target = current is closer to target than the start was.
  let towardTarget: boolean | null = null;
  if (current != null && startKg != null && targetKg != null) {
    towardTarget = Math.abs(current - targetKg) < Math.abs(startKg - targetKg);
  }
  const deltaTone =
    towardTarget === true ? "text-emerald-500" : towardTarget === false ? "text-amber-500" : "text-muted-foreground";

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-medium">Weight trend</span>
          </div>
          {current != null && (
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-lg font-medium tabular-nums">{current.toFixed(1)}</span>
              <span className="text-xs text-muted-foreground">kg</span>
              {delta != null && (
                <span className={cn("font-mono text-xs tabular-nums", deltaTone)}>
                  {delta > 0 ? "+" : ""}
                  {delta.toFixed(1)} kg
                </span>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex h-[160px] items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : points.length === 0 ? (
          <div className="flex h-[120px] items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">No weigh-ins logged in this phase yet.</p>
          </div>
        ) : (
          <div className="h-[170px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" minTickGap={24} />
                <YAxis
                  domain={["dataMin - 1", "dataMax + 1"]}
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  width={36}
                  tickFormatter={(v: number) => v.toFixed(0)}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`${Number(v).toFixed(1)} kg`, "Weight"]}
                />
                {startKg != null && (
                  <ReferenceLine y={startKg} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeOpacity={0.5} />
                )}
                {targetKg != null && (
                  <ReferenceLine y={targetKg} stroke="#1d9e75" strokeDasharray="4 4" strokeOpacity={0.7} />
                )}
                <Line type="monotone" dataKey="weight" stroke="#1d9e75" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
