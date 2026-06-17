import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { cn } from "@/lib/utils";
import { toneClasses, type Interpretation } from "@/lib/interpret";
import { DeltaChip } from "@/components/ui/delta-chip";

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

  // MetricCard-pattern header: latest reading + WoW delta + interpretation.
  const latest = dataWithBodyFat[dataWithBodyFat.length - 1].bodyFat;
  const prev = dataWithBodyFat.length > 1 ? dataWithBodyFat[dataWithBodyFat.length - 2].bodyFat : null;
  const delta = prev != null ? parseFloat((latest - prev).toFixed(1)) : null;
  const interpretation: Interpretation =
    delta == null
      ? { tone: "neutral", label: "", sentence: "First body-fat reading logged." }
      : delta < -0.1
        ? { tone: "on_track", label: "", sentence: `Body fat trending down (${Math.abs(delta)}% since last reading).` }
        : delta > 0.1
          ? { tone: "attention", label: "", sentence: `Body fat up ${delta}% since last reading.` }
          : { tone: "neutral", label: "", sentence: "Body fat holding steady." };

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">Body Fat</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-semibold tabular-nums">{latest.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          {delta != null && <DeltaChip value={delta} suffix="%" tone={interpretation.tone} />}
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
