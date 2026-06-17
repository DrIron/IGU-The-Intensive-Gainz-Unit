import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
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

interface TeamWeightProgressGraphProps {
  goal: any;
  weeklyProgress: Array<{
    week_number: number;
    average_weight_kg: number | null;
    weight_logs?: Array<{ date: string; weight: number }>;
  }>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function TeamWeightProgressGraph({ goal, weeklyProgress }: TeamWeightProgressGraphProps) {
  if (!goal) return null;

  const startDate = new Date(goal.start_date);
  const endDate = goal.estimated_end_date ? new Date(goal.estimated_end_date) : new Date();
  const totalWeeks = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (7 * DAY_MS)));

  // --- Predicted (target) curve: one point per week ---
  const weeklyRateDecimal = (goal.weekly_rate_percentage || 0) / 100;
  const predictedPoints: Array<{ ts: number; predicted: number }> = [];
  for (let week = 0; week <= totalWeeks; week++) {
    const weekDate = new Date(startDate);
    weekDate.setDate(weekDate.getDate() + week * 7);
    let predictedWeight: number = goal.starting_weight_kg;
    if (goal.goal_type === "fat_loss") {
      predictedWeight = goal.starting_weight_kg * Math.pow(1 - weeklyRateDecimal, week);
    } else if (goal.goal_type === "muscle_gain") {
      const monthlyRate = weeklyRateDecimal / 4.33;
      predictedWeight = goal.starting_weight_kg * Math.pow(1 + monthlyRate, week);
    }
    predictedPoints.push({ ts: weekDate.getTime(), predicted: parseFloat(predictedWeight.toFixed(2)) });
  }

  // --- Actual points: prefer raw daily logs; fall back to weekly averages ---
  const realDailies: Array<{ ts: number; weight: number }> = [];
  for (const w of weeklyProgress) {
    for (const l of w.weight_logs ?? []) {
      if (l.weight && Number(l.weight) > 0) realDailies.push({ ts: new Date(l.date).getTime(), weight: Number(l.weight) });
    }
  }
  const weeklyAverages: Array<{ ts: number; weight: number }> = weeklyProgress
    .filter((w) => w.average_weight_kg && Number.isFinite(Number(w.average_weight_kg)))
    .map((w) => ({
      ts: startDate.getTime() + w.week_number * 7 * DAY_MS,
      weight: parseFloat(Number(w.average_weight_kg).toFixed(2)),
    }));

  const hasDailies = realDailies.length > 0;
  const points = (hasDailies ? realDailies : weeklyAverages).sort((a, b) => a.ts - b.ts);

  // 7-day trailing moving average (over whatever the actual points are).
  const actualPoints = points.map((p) => {
    const windowStart = p.ts - 7 * DAY_MS;
    const window = points.filter((o) => o.ts > windowStart && o.ts <= p.ts);
    const trend = window.reduce((s, o) => s + o.weight, 0) / window.length;
    return { ts: p.ts, daily: parseFloat(p.weight.toFixed(2)), trend: parseFloat(trend.toFixed(2)) };
  });

  // --- Merge onto a single time axis ---
  const byTs = new Map<number, { ts: number; predicted?: number; daily?: number; trend?: number }>();
  for (const p of predictedPoints) byTs.set(p.ts, { ...(byTs.get(p.ts) ?? { ts: p.ts }), predicted: p.predicted });
  for (const a of actualPoints) byTs.set(a.ts, { ...(byTs.get(a.ts) ?? { ts: a.ts }), daily: a.daily, trend: a.trend });
  const chartData = Array.from(byTs.values()).sort((a, b) => a.ts - b.ts);

  // --- Diet break markers (week index -> timestamp) ---
  const dietBreakTs: number[] = [];
  if (goal.diet_breaks_enabled && goal.diet_break_frequency_weeks) {
    const duration = goal.diet_break_duration_weeks || 1;
    for (let week = goal.diet_break_frequency_weeks; week <= totalWeeks; week += goal.diet_break_frequency_weeks + duration) {
      for (let i = 0; i < duration; i++) dietBreakTs.push(startDate.getTime() + (week + i) * 7 * DAY_MS);
    }
  }

  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weight Progress</CardTitle>
        <CardDescription>Target trend vs your actual weight</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
              formatter={(v: any) => (v ? `${v} kg` : "No data")}
            />
            <Legend />
            {dietBreakTs.map((ts) => (
              <ReferenceLine key={ts} x={ts} stroke="hsl(var(--warning))" strokeDasharray="3 3" label={{ value: "DB", position: "top", fontSize: 10 }} />
            ))}
            <Line type="monotone" dataKey="predicted" stroke="hsl(var(--destructive))" strokeDasharray="5 5" dot={false} connectNulls name="Target Trend" />
            {hasDailies && (
              <Scatter dataKey="daily" fill="hsl(var(--chart-1))" fillOpacity={0.35} name="Daily weigh-in" />
            )}
            <Line type="monotone" dataKey="trend" stroke="hsl(var(--chart-1))" strokeWidth={2.5} dot={!hasDailies ? { r: 3 } : false} connectNulls name="Your Weight Trend" />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Legend explanation */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground pt-2 border-t">
          <div className="flex items-center gap-2">
            <div className="w-6 h-0 border-t-2 border-dashed border-destructive" />
            <span>Target weight trend</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-[hsl(var(--chart-1))]" />
            <span>Your weight trend</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
