import { cn } from "@/lib/utils";

/**
 * MacroDonut — a donut split by CALORIE CONTRIBUTION (protein*4 : fat*9 : carb*4),
 * for the nutrition goal display (NU7). Render-only over stored grams; no macro
 * math beyond the 4/9/4 energy split. Arcs use the shared macro palette tokens
 * (--macro-protein/fat/carb) so it matches MacroDistributionRibbon exactly.
 *
 * The legend keeps each macro's grams AND % on screen (the visual augments the
 * numbers, it doesn't replace them).
 */
interface MacroDonutProps {
  protein: number; // grams
  fat: number; // grams
  carbs: number; // grams
  size?: number;
  strokeWidth?: number;
  className?: string;
  /**
   * Rendered in the middle of the ring. `NutritionSummary` puts the calorie number here so
   * that ONE object carries both "how many calories" and "what's the macro split".
   */
  center?: React.ReactNode;
  /**
   * `NutritionSummary` supplies its own spacious legend (aligned grams/% columns + target
   * context), so it turns this one off. Defaults to true — existing callers are unchanged.
   */
  showLegend?: boolean;
}

const MACROS = [
  { key: "protein", label: "P", token: "var(--macro-protein)" },
  { key: "fat", label: "F", token: "var(--macro-fat)" },
  { key: "carb", label: "C", token: "var(--macro-carb)" },
] as const;

export function MacroDonut({
  protein,
  fat,
  carbs,
  size = 132,
  strokeWidth = 14,
  className,
  center,
  showLegend = true,
}: MacroDonutProps) {
  const grams = { protein: Math.max(0, protein), fat: Math.max(0, fat), carb: Math.max(0, carbs) };
  const cals = { protein: grams.protein * 4, fat: grams.fat * 9, carb: grams.carb * 4 };
  const total = cals.protein + cals.fat + cals.carb;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Accumulate arc offsets clockwise from the top (-90° rotation on the svg).
  let acc = 0;
  const arcs = MACROS.map((m) => {
    const frac = total > 0 ? cals[m.key] / total : 0;
    const arc = { token: m.token, dash: frac * circumference, offset: acc * circumference };
    acc += frac;
    return arc;
  });

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label="Macro calorie split">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className="text-muted"
            stroke="currentColor"
          />
          {total > 0 &&
            arcs.map((a, i) => (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth={strokeWidth}
                stroke={`hsl(${a.token})`}
                strokeDasharray={`${a.dash} ${circumference - a.dash}`}
                strokeDashoffset={-a.offset}
              />
            ))}
        </svg>
        {center && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            {center}
          </div>
        )}
      </div>

      {/* Legend — grams + % stay visible */}
      {showLegend && (
      <ul className="flex-1 min-w-0 space-y-1.5 text-sm">
        {MACROS.map((m) => {
          const pct = total > 0 ? Math.round((cals[m.key] / total) * 100) : 0;
          return (
            <li key={m.key} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: `hsl(${m.token})` }}
                aria-hidden
              />
              <span className="font-medium">{m.label === "P" ? "Protein" : m.label === "F" ? "Fat" : "Carbs"}</span>
              <span className="ml-auto font-mono tabular-nums">
                {Math.round(grams[m.key])}g
                <span className="text-muted-foreground"> · {pct}%</span>
              </span>
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
}
