import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";

/**
 * Minimal trend sparkline for a MetricCard. Renders nothing for <2 points
 * (a single value has no trend to draw).
 */
export function Sparkline({
  data,
  color = "hsl(var(--chart-1))",
  height = 40,
}: {
  data: number[];
  color?: string;
  height?: number;
}) {
  if (!data || data.length < 2) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data.map((v, i) => ({ i, v }))} margin={{ top: 4, right: 0, bottom: 4, left: 0 }}>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
