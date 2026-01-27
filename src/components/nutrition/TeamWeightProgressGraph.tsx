import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

interface TeamWeightProgressGraphProps {
  goal: any;
  weeklyProgress: Array<{
    week_number: number;
    average_weight_kg: number | null;
    weight_logs?: Array<{ date: string; weight: number }>;
  }>;
}

export function TeamWeightProgressGraph({ goal, weeklyProgress }: TeamWeightProgressGraphProps) {
  if (!goal) return null;

  // Calculate timeline
  const startDate = new Date(goal.start_date);
  const endDate = goal.estimated_end_date ? new Date(goal.estimated_end_date) : new Date();
  const totalWeeks = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)));

  // Predicted curve
  const weeklyRateDecimal = (goal.weekly_rate_percentage || 0) / 100;
  const predictedData: Array<{ week: number; date: string; predicted: number }> = [];
  for (let week = 0; week <= totalWeeks; week++) {
    const weekDate = new Date(startDate);
    weekDate.setDate(weekDate.getDate() + week * 7);

    let predictedWeight: number = goal.starting_weight_kg;
    if (goal.goal_type === 'loss' || goal.goal_type === 'fat_loss') {
      predictedWeight = goal.starting_weight_kg * Math.pow(1 - weeklyRateDecimal, week);
    } else if (goal.goal_type === 'gain' || goal.goal_type === 'muscle_gain') {
      // Convert monthly rate to weekly (same as client graph)
      const monthlyRate = weeklyRateDecimal / 4.33;
      predictedWeight = goal.starting_weight_kg * Math.pow(1 + monthlyRate, week);
    }

    predictedData.push({
      week,
      date: weekDate.toISOString().split('T')[0],
      predicted: parseFloat(predictedWeight.toFixed(2))
    });
  }

  // Actual weekly averages from weekly_progress
  const actualMap = new Map<number, number>();
  weeklyProgress.forEach(w => {
    if (w.average_weight_kg && Number.isFinite(Number(w.average_weight_kg))) {
      actualMap.set(w.week_number, parseFloat(Number(w.average_weight_kg).toFixed(2)));
    } else if (w.weight_logs && w.weight_logs.length > 0) {
      const valid = w.weight_logs.filter(l => l.weight && Number(l.weight) > 0);
      if (valid.length > 0) {
        const avg = valid.reduce((s, l) => s + Number(l.weight), 0) / valid.length;
        actualMap.set(w.week_number, parseFloat(avg.toFixed(2)));
      }
    }
  });

  const chartData = predictedData.map(p => ({
    week: p.week,
    predicted: p.predicted,
    actual: actualMap.get(p.week) ?? null
  }));

  // Diet break markers
  const dietBreakWeeks: number[] = [];
  if (goal.diet_breaks_enabled && goal.diet_break_frequency_weeks) {
    const duration = goal.diet_break_duration_weeks || 1;
    for (let week = goal.diet_break_frequency_weeks; week <= totalWeeks; week += goal.diet_break_frequency_weeks + duration) {
      for (let i = 0; i < duration; i++) dietBreakWeeks.push(week + i);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weight Progress</CardTitle>
        <CardDescription>Predicted vs Actual Weight Trend</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="week" label={{ value: 'Week', position: 'insideBottom', offset: -5 }} className="text-xs" />
            <YAxis label={{ value: 'Weight (kg)', angle: -90, position: 'insideLeft' }} className="text-xs" domain={['dataMin - 2', 'dataMax + 2']} />
            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} labelFormatter={(w) => `Week ${w}`} formatter={(v: any) => (v ? `${v} kg` : 'No data')} />
            <Legend />
            {dietBreakWeeks.map(week => (
              <ReferenceLine key={week} x={week} stroke="hsl(var(--warning))" strokeDasharray="3 3" label={{ value: 'DB', position: 'top', fontSize: 10 }} />
            ))}
            <Line type="monotone" dataKey="predicted" stroke="hsl(var(--destructive))" strokeDasharray="5 5" dot={false} name="Target Trend" />
            <Line type="monotone" dataKey="actual" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 4 }} connectNulls name="Your Weight" />
          </LineChart>
        </ResponsiveContainer>
        
        {/* Legend explanation */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground pt-2 border-t">
          <div className="flex items-center gap-2">
            <div className="w-6 h-0 border-t-2 border-dashed border-destructive" />
            <span>Target weight trend</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="w-6 h-0.5 bg-[hsl(var(--chart-1))]" />
              <div className="w-2 h-2 rounded-full bg-[hsl(var(--chart-1))]" />
            </div>
            <span>Your actual weight logs</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
