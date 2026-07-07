import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { toneClasses, type Interpretation } from "@/lib/interpret";
import { DeltaChip } from "@/components/ui/delta-chip";

export interface NutritionTrendPoint {
  week: number;
  value: number;
}

interface NutritionTrendChartProps {
  /** Metric label, e.g. "Steps" / "Adherence". */
  label: string;
  points: NutritionTrendPoint[];
  /** Unit shown after the hero value + in the tooltip (e.g. "steps", "%"). */
  unit: string;
  /** hsl chart colour token, e.g. "hsl(var(--chart-3))". */
  color: string;
  /** Muted copy shown when there is nothing to plot. */
  emptyText: string;
  interpretation?: Interpretation;
  /** Formats the hero + tooltip value (default: locale-string). */
  format?: (v: number) => string;
}

/**
 * NU5 — generic weekly-line trend chart for the metric-stack expanded view
 * (steps + adherence). Mirrors BodyFatProgressGraph's header + Recharts line so
 * all four expanded charts read consistently. Range filtering is the caller's
 * job — pass an already-windowed `points` array.
 */
export function NutritionTrendChart({
  label,
  points,
  unit,
  color,
  emptyText,
  interpretation,
  format,
}: NutritionTrendChartProps) {
  const fmt = format ?? ((v: number) => v.toLocaleString());
  const data = [...points].sort((a, b) => a.week - b.week);

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">{emptyText}</CardContent>
      </Card>
    );
  }

  const latest = data[data.length - 1].value;
  const prev = data.length > 1 ? data[data.length - 2].value : null;
  const delta = prev != null ? Math.round((latest - prev) * 10) / 10 : null;
  const tone = interpretation?.tone ?? "neutral";

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-semibold tabular-nums">{fmt(latest)}</span>
              <span className="text-sm text-muted-foreground">{unit}</span>
            </div>
          </div>
          {delta != null && <DeltaChip value={delta} suffix={unit === "%" ? "%" : ""} tone={tone} />}
        </div>
        {interpretation?.sentence && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", toneClasses(tone).dot)} />
            {interpretation.sentence}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="week" label={{ value: "Week", position: "insideBottom", offset: -5 }} className="text-xs" />
            <YAxis className="text-xs" domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }}
              labelFormatter={(week) => `Week ${week}`}
              formatter={(value: number) => `${fmt(value)} ${unit}`.trim()}
            />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 4 }} name={label} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
