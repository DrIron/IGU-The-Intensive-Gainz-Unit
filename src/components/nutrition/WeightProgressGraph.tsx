import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Scatter,
  ComposedChart,
} from "recharts";
import { cn } from "@/lib/utils";
import { classifyPhaseStatus, interpretPhaseStatus, toneClasses } from "@/lib/interpret";
import { DeltaChip } from "@/components/ui/delta-chip";

interface WeightProgressGraphProps {
  phase: any;
  weightLogs: Array<{
    log_date: string;
    weight_kg: number;
    week_number: number;
  }>;
  /**
   * Signed % change vs the previous week (already computed upstream in
   * ClientNutrition). Drives the header DeltaChip + interpretation tone -- do
   * NOT recompute here.
   */
  latestActualChangePercent?: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function WeightProgressGraph({ phase, weightLogs, latestActualChangePercent = null }: WeightProgressGraphProps) {
  const startDate = new Date(phase.start_date);
  const endDate = phase.estimated_end_date ? new Date(phase.estimated_end_date) : new Date();
  const totalWeeks = Math.ceil((endDate.getTime() - startDate.getTime()) / (7 * DAY_MS));

  // --- Predicted (target) curve: one point per week ---
  const weeklyRateDecimal = phase.weekly_rate_percentage / 100;
  const predictedPoints: Array<{ ts: number; predicted: number }> = [];
  for (let week = 0; week <= totalWeeks; week++) {
    const weekDate = new Date(startDate);
    weekDate.setDate(weekDate.getDate() + week * 7);
    let predictedWeight: number;
    if (phase.goal_type === "fat_loss") {
      predictedWeight = phase.starting_weight_kg * Math.pow(1 - weeklyRateDecimal, week);
    } else if (phase.goal_type === "muscle_gain") {
      const monthlyRate = weeklyRateDecimal / 4.33;
      predictedWeight = phase.starting_weight_kg * Math.pow(1 + monthlyRate, week);
    } else {
      predictedWeight = phase.starting_weight_kg;
    }
    predictedPoints.push({ ts: weekDate.getTime(), predicted: parseFloat(predictedWeight.toFixed(2)) });
  }

  // --- Raw daily logs + 7-day trailing moving-average trend ---
  const sortedLogs = [...weightLogs]
    .filter((l) => Number.isFinite(Number(l.weight_kg)))
    .map((l) => ({ ts: new Date(l.log_date).getTime(), weight: Number(l.weight_kg) }))
    .sort((a, b) => a.ts - b.ts);

  const dailyPoints = sortedLogs.map((l) => {
    // Trailing 7-calendar-day window (inclusive) ending at this log.
    const windowStart = l.ts - 7 * DAY_MS;
    const window = sortedLogs.filter((o) => o.ts > windowStart && o.ts <= l.ts);
    const trend = window.reduce((s, o) => s + o.weight, 0) / window.length;
    return { ts: l.ts, daily: parseFloat(l.weight.toFixed(2)), trend: parseFloat(trend.toFixed(2)) };
  });

  // --- Merge all series onto a single time axis (keyed by timestamp) ---
  const byTs = new Map<number, { ts: number; predicted?: number; daily?: number; trend?: number }>();
  for (const p of predictedPoints) byTs.set(p.ts, { ...(byTs.get(p.ts) ?? { ts: p.ts }), predicted: p.predicted });
  for (const d of dailyPoints)
    byTs.set(d.ts, { ...(byTs.get(d.ts) ?? { ts: d.ts }), daily: d.daily, trend: d.trend });
  const chartData = Array.from(byTs.values()).sort((a, b) => a.ts - b.ts);

  // --- Diet break markers (converted from week index to timestamp) ---
  const dietBreakTs: number[] = [];
  if (phase.diet_break_enabled && phase.diet_break_frequency_weeks) {
    for (
      let week = phase.diet_break_frequency_weeks;
      week <= totalWeeks;
      week += phase.diet_break_frequency_weeks + (phase.diet_break_duration_weeks || 1)
    ) {
      for (let i = 0; i < (phase.diet_break_duration_weeks || 1); i++) {
        dietBreakTs.push(startDate.getTime() + (week + i) * 7 * DAY_MS);
      }
    }
  }

  // --- Header: hero trend weight + WoW DeltaChip + interpretation sentence ---
  const latestTrend = dailyPoints.length > 0 ? dailyPoints[dailyPoints.length - 1].trend : null;
  const status = classifyPhaseStatus({
    isActive: phase.is_active !== false,
    latestActualChangePercent,
    weeklyRatePercentage: phase.weekly_rate_percentage,
    goalType: phase.goal_type,
  });
  const interpretation = interpretPhaseStatus({
    status,
    latestActualChangePercent,
    weeklyRatePercentage: phase.weekly_rate_percentage,
    goalType: phase.goal_type,
  });
  const deltaRounded = latestActualChangePercent != null ? Math.round(latestActualChangePercent * 10) / 10 : null;

  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">Weight Trend</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-semibold tabular-nums">
                {latestTrend != null ? latestTrend.toFixed(1) : "--"}
              </span>
              <span className="text-sm text-muted-foreground">kg</span>
            </div>
          </div>
          {deltaRounded != null && <DeltaChip value={deltaRounded} suffix="%/wk" tone={interpretation.tone} />}
        </div>
        {interpretation.sentence && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden
              className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", toneClasses(interpretation.tone).dot)}
            />
            {interpretation.sentence}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={fmtDate}
              className="text-xs"
            />
            <YAxis
              label={{ value: "Weight (kg)", angle: -90, position: "insideLeft" }}
              className="text-xs"
              domain={["dataMin - 2", "dataMax + 2"]}
            />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }}
              labelFormatter={(ts) => fmtDate(Number(ts))}
              formatter={(value: any) => (value ? `${value} kg` : "No data")}
            />
            <Legend />

            {dietBreakTs.map((ts) => (
              <ReferenceLine
                key={ts}
                x={ts}
                stroke="hsl(var(--warning))"
                strokeDasharray="3 3"
                label={{ value: "DB", position: "top", fontSize: 10 }}
              />
            ))}

            {/* Target (predicted) line -- dashed */}
            <Line
              type="monotone"
              dataKey="predicted"
              stroke="hsl(var(--primary))"
              strokeDasharray="5 5"
              dot={false}
              connectNulls
              name="Target"
            />
            {/* Raw daily weigh-ins -- faint dots, no connecting line */}
            <Scatter dataKey="daily" fill="hsl(var(--chart-1))" fillOpacity={0.35} name="Daily weigh-in" />
            {/* 7-day moving-average trend -- bold */}
            <Line
              type="monotone"
              dataKey="trend"
              stroke="hsl(var(--chart-1))"
              strokeWidth={2.5}
              dot={false}
              connectNulls
              name="Your Weight Trend"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
