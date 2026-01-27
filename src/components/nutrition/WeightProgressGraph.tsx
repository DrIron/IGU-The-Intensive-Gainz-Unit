import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

interface WeightProgressGraphProps {
  phase: any;
  weightLogs: Array<{
    log_date: string;
    weight_kg: number;
    week_number: number;
  }>;
}

export function WeightProgressGraph({ phase, weightLogs }: WeightProgressGraphProps) {
  // Calculate predicted weight curve
  const startDate = new Date(phase.start_date);
  const endDate = phase.estimated_end_date ? new Date(phase.estimated_end_date) : new Date();
  const totalWeeks = Math.ceil((endDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
  
  const weeklyRateDecimal = phase.weekly_rate_percentage / 100;
  const predictedData = [];
  
  for (let week = 0; week <= totalWeeks; week++) {
    const weekDate = new Date(startDate);
    weekDate.setDate(weekDate.getDate() + (week * 7));
    
    let predictedWeight: number;
    if (phase.goal_type === 'fat_loss' || phase.goal_type === 'loss') {
      predictedWeight = phase.starting_weight_kg * Math.pow(1 - weeklyRateDecimal, week);
    } else if (phase.goal_type === 'muscle_gain' || phase.goal_type === 'gain') {
      // Monthly rate for muscle gain
      const monthlyRate = weeklyRateDecimal / 4.33;
      predictedWeight = phase.starting_weight_kg * Math.pow(1 + monthlyRate, week);
    } else {
      predictedWeight = phase.starting_weight_kg;
    }
    
    predictedData.push({
      week,
      date: weekDate.toISOString().split('T')[0],
      predicted: parseFloat(predictedWeight.toFixed(2))
    });
  }

  // Calculate weekly averages from actual logs
  const weeklyAverages = new Map<number, { total: number; count: number }>();
  weightLogs.forEach(log => {
    const existing = weeklyAverages.get(log.week_number) || { total: 0, count: 0 };
    weeklyAverages.set(log.week_number, {
      total: existing.total + log.weight_kg,
      count: existing.count + 1
    });
  });

  const actualData = Array.from(weeklyAverages.entries()).map(([week, data]) => ({
    week,
    actual: parseFloat((data.total / data.count).toFixed(2))
  }));

  // Merge predicted and actual data
  const chartData = predictedData.map(p => {
    const actual = actualData.find(a => a.week === p.week);
    return {
      week: p.week,
      predicted: p.predicted,
      actual: actual?.actual || null
    };
  });

  // Find diet break weeks
  const dietBreakWeeks: number[] = [];
  if (phase.diet_break_enabled && phase.diet_break_frequency_weeks) {
    for (let week = phase.diet_break_frequency_weeks; week <= totalWeeks; week += phase.diet_break_frequency_weeks + (phase.diet_break_duration_weeks || 1)) {
      for (let i = 0; i < (phase.diet_break_duration_weeks || 1); i++) {
        dietBreakWeeks.push(week + i);
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weight Progress</CardTitle>
        <CardDescription>Predicted vs Actual Weight Trend</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="week" 
              label={{ value: 'Week', position: 'insideBottom', offset: -5 }}
              className="text-xs"
            />
            <YAxis 
              label={{ value: 'Weight (kg)', angle: -90, position: 'insideLeft' }}
              className="text-xs"
              domain={['dataMin - 2', 'dataMax + 2']}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
              labelFormatter={(week) => `Week ${week}`}
              formatter={(value: any) => value ? `${value} kg` : 'No data'}
            />
            <Legend />
            
            {/* Diet break markers */}
            {dietBreakWeeks.map(week => (
              <ReferenceLine 
                key={week} 
                x={week} 
                stroke="hsl(var(--warning))" 
                strokeDasharray="3 3"
                label={{ value: 'DB', position: 'top', fontSize: 10 }}
              />
            ))}
            
            <Line 
              type="monotone" 
              dataKey="predicted" 
              stroke="hsl(var(--primary))" 
              strokeDasharray="5 5"
              dot={false}
              name="Predicted"
            />
            <Line 
              type="monotone" 
              dataKey="actual" 
              stroke="hsl(var(--chart-1))" 
              strokeWidth={2}
              dot={{ r: 4 }}
              connectNulls
              name="Actual"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
