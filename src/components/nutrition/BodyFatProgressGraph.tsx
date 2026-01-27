import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface BodyFatProgressGraphProps {
  weeklyProgress: Array<{
    week_number: number;
    body_fat_percentage: number | null;
  }>;
}

export function BodyFatProgressGraph({ weeklyProgress }: BodyFatProgressGraphProps) {
  // Filter for weeks with body fat data
  const dataWithBodyFat = weeklyProgress
    .filter(w => w.body_fat_percentage !== null && w.body_fat_percentage !== undefined)
    .map(w => ({
      week: w.week_number,
      bodyFat: parseFloat(w.body_fat_percentage.toFixed(1))
    }))
    .sort((a, b) => a.week - b.week);

  if (dataWithBodyFat.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Body Fat Progress</CardTitle>
        <CardDescription>Body Fat Percentage Over Time</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={dataWithBodyFat} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="week" 
              label={{ value: 'Week', position: 'insideBottom', offset: -5 }}
              className="text-xs"
            />
            <YAxis 
              label={{ value: 'Body Fat %', angle: -90, position: 'insideLeft' }}
              className="text-xs"
              domain={['dataMin - 2', 'dataMax + 2']}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
              labelFormatter={(week) => `Week ${week}`}
              formatter={(value: any) => `${value}%`}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="bodyFat" 
              stroke="hsl(var(--chart-2))" 
              strokeWidth={2}
              dot={{ r: 4 }}
              name="Body Fat %"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
