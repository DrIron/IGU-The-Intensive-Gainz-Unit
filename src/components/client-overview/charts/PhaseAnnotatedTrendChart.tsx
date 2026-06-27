// src/components/client-overview/charts/PhaseAnnotatedTrendChart.tsx
//
// Reusable long-duration trend chart with phase annotation (redesign HT).
// A single date-axis line with:
//   - a soft shaded band per phase (so you can see which phase any point was in)
//   - a colored boundary line at each phase start
//   - a named legend (swatch · phase name · date range)
//   - a duration toggle (M / Q / 6M / Y / All)
//
// Presentational + self-contained: callers load their own series + phase
// boundaries and hand them in. Used by weight / steps / measurements (nutrition
// History) and tonnage / TUST / measurements (workouts History).

import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
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
  ReferenceArea,
} from "recharts";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TrendPoint {
  t: number; // ms timestamp
  value: number;
}
export interface TrendPhase {
  t: number; // phase start, ms timestamp
  name: string;
}

interface PhaseAnnotatedTrendChartProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  points: TrendPoint[];
  phases: TrendPhase[];
  unit?: string;
  /** Formats a value for the hero/tooltip (defaults to 1-dp). */
  formatValue?: (v: number) => string;
  /** "down" = lower is better (fat loss, body fat); flips trend tone. */
  betterDirection?: "up" | "down" | "neutral";
  /** Empty-state copy when there are <2 points. */
  emptyLabel?: string;
  className?: string;
}

const PHASE_COLORS = ["#10b981", "#a855f7", "#f59e0b", "#06b6d4", "#ec4899", "#84cc16"];

const RANGES: { key: string; label: string; months: number | null }[] = [
  { key: "1m", label: "M", months: 1 },
  { key: "3m", label: "Q", months: 3 },
  { key: "6m", label: "6M", months: 6 },
  { key: "12m", label: "Y", months: 12 },
  { key: "all", label: "All", months: null },
];

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export function PhaseAnnotatedTrendChart({
  title,
  description,
  icon: Icon,
  points,
  phases,
  unit,
  formatValue,
  betterDirection = "neutral",
  emptyLabel = "Not enough data yet to chart a trend.",
  className,
}: PhaseAnnotatedTrendChartProps) {
  const [rangeKey, setRangeKey] = useState("all");
  const fmt = formatValue ?? ((v: number) => v.toFixed(1));

  const sorted = useMemo(
    () => [...points].filter((p) => Number.isFinite(p.t) && Number.isFinite(p.value)).sort((a, b) => a.t - b.t),
    [points],
  );

  // Apply the duration window. "All" keeps everything; otherwise clamp to the
  // last N months relative to the most recent point (not "now", so a dormant
  // client's history still shows).
  const windowed = useMemo(() => {
    const months = RANGES.find((r) => r.key === rangeKey)?.months ?? null;
    if (months == null || sorted.length === 0) return sorted;
    const last = sorted[sorted.length - 1].t;
    const cutoff = last - months * MONTH_MS;
    return sorted.filter((p) => p.t >= cutoff);
  }, [sorted, rangeKey]);

  const sortedPhases = useMemo(
    () =>
      [...phases]
        .filter((p) => Number.isFinite(p.t))
        .sort((a, b) => a.t - b.t)
        .map((p, i) => ({ ...p, color: PHASE_COLORS[i % PHASE_COLORS.length] })),
    [phases],
  );

  const domainMin = windowed.length ? windowed[0].t : 0;
  const domainMax = windowed.length ? windowed[windowed.length - 1].t : 0;

  // Phase bands: from each phase start to the next phase start (or chart end),
  // clamped to the visible window. Only phases overlapping the window render.
  const bands = useMemo(() => {
    return sortedPhases
      .map((p, i) => {
        const next = sortedPhases[i + 1]?.t ?? domainMax;
        const x1 = Math.max(p.t, domainMin);
        const x2 = Math.min(next, domainMax);
        return { ...p, x1, x2, nextT: sortedPhases[i + 1]?.t ?? null };
      })
      .filter((b) => b.x2 > b.x1 || (b.t >= domainMin && b.t <= domainMax));
  }, [sortedPhases, domainMin, domainMax]);

  const visiblePhases = useMemo(
    () => sortedPhases.filter((p) => p.t <= domainMax && (sortedPhases[sortedPhases.indexOf(p) + 1]?.t ?? domainMax) >= domainMin),
    [sortedPhases, domainMin, domainMax],
  );

  const trend = useMemo(() => {
    if (windowed.length < 2) return null;
    const first = windowed[0].value;
    const last = windowed[windowed.length - 1].value;
    const diff = last - first;
    const rising = diff > 0;
    const flat = Math.abs(diff) < 1e-9;
    const good =
      betterDirection === "neutral"
        ? "neutral"
        : (betterDirection === "up") === rising && !flat
          ? "good"
          : "bad";
    return { first, last, diff, rising, flat, good };
  }, [windowed, betterDirection]);

  const fmtTick = (t: number) =>
    new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const fmtRange = (startT: number, endT: number | null) =>
    `${new Date(startT).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${
      endT ? new Date(endT).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "present"
    }`;

  const trendTone =
    trend?.good === "good"
      ? "text-status-ontrack"
      : trend?.good === "bad"
        ? "text-status-attention"
        : "text-muted-foreground";
  const TrendIcon = trend?.flat ? Minus : trend?.rising ? TrendingUp : TrendingDown;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
              {title}
            </CardTitle>
            {(description || trend) && (
              <CardDescription className="flex items-center gap-2">
                {trend && (
                  <span className={cn("inline-flex items-center gap-1 font-mono tabular-nums", trendTone)}>
                    <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {fmt(trend.first)} → {fmt(trend.last)}
                    {unit ? ` ${unit}` : ""}
                  </span>
                )}
                {description && <span className="text-muted-foreground">{description}</span>}
              </CardDescription>
            )}
          </div>
          <div className="flex shrink-0 gap-1" role="group" aria-label="Duration">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRangeKey(r.key)}
                aria-pressed={rangeKey === r.key}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11px] tabular-nums transition-colors",
                  rangeKey === r.key
                    ? "border-foreground bg-foreground text-background font-medium"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {windowed.length < 2 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={windowed} margin={{ top: 8, right: 12, bottom: 4, left: -4 }}>
                {bands.map((b, i) => (
                  <ReferenceArea
                    key={`band-${b.t}-${i}`}
                    x1={b.x1}
                    x2={b.x2}
                    fill={b.color}
                    fillOpacity={0.07}
                    ifOverflow="hidden"
                  />
                ))}
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis
                  type="number"
                  dataKey="t"
                  domain={["dataMin", "dataMax"]}
                  scale="time"
                  tickFormatter={fmtTick}
                  tick={{ fontSize: 10 }}
                  minTickGap={32}
                />
                <YAxis
                  domain={["dataMin - 1", "dataMax + 1"]}
                  tickFormatter={(v) => fmt(Number(v))}
                  tick={{ fontSize: 10 }}
                  width={44}
                />
                <Tooltip
                  labelFormatter={(t) => new Date(Number(t)).toLocaleDateString()}
                  formatter={(v: number) => [`${fmt(Number(v))}${unit ? ` ${unit}` : ""}`, title]}
                  contentStyle={{ fontSize: 12 }}
                />
                {bands.map((b, i) => (
                  <ReferenceLine
                    key={`line-${b.t}-${i}`}
                    x={b.t}
                    stroke={b.color}
                    strokeDasharray="3 3"
                    strokeWidth={1.5}
                    ifOverflow="hidden"
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>

            {visiblePhases.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t pt-3">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Phases</span>
                {visiblePhases.map((p, i) => {
                  const nextT = sortedPhases[sortedPhases.indexOf(p) + 1]?.t ?? null;
                  return (
                    <span key={`legend-${p.t}-${i}`} className="flex items-center gap-1.5 text-xs">
                      <span
                        aria-hidden="true"
                        className="inline-block h-3 w-0.5 rounded-sm"
                        style={{ backgroundColor: p.color }}
                      />
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground">{fmtRange(p.t, nextT)}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
