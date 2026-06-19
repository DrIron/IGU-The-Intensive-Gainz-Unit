// NU7 Phase 2 — body-comp journey arc + phase timeline for the goal display.
// Render-only over stored goal values + the current marker from useCurrentBodyComp.
// Tokens only (primary fill / muted track).
import { cn } from "@/lib/utils";

/**
 * Horizontal journey bar: start → current → target, with the current value
 * marked proportionally between start and target (direction-agnostic, clamped).
 * Used for body-fat (unit "%") or weight (unit " kg").
 */
export function JourneyArc({
  label,
  start,
  current,
  target,
  unit,
  className,
}: {
  label: string;
  start: number;
  current: number | null;
  target: number;
  unit: string;
  className?: string;
}) {
  const span = target - start;
  const pos =
    current == null ? 0 : span === 0 ? 1 : Math.max(0, Math.min(1, (current - start) / span));
  const fmt = (v: number) => `${Math.round(v * 10) / 10}${unit}`;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {current != null ? `now ${fmt(current)}` : "no log yet"}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-muted">
        {current != null && (
          <>
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary"
              style={{ width: `${pos * 100}%` }}
            />
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary"
              style={{ left: `${pos * 100}%` }}
              aria-hidden
            />
          </>
        )}
      </div>
      <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
        <span>{fmt(start)}</span>
        <span>{fmt(target)}</span>
      </div>
    </div>
  );
}

/** Slim start → est-end bar with "Week N of total". */
export function PhaseTimeline({
  startDate,
  endDate,
  durationWeeks,
  className,
}: {
  startDate: string;
  endDate?: string | null;
  durationWeeks?: number | null;
  className?: string;
}) {
  const startMs = new Date(startDate).getTime();
  const elapsedWeeks = Math.max(
    1,
    Math.floor((Date.now() - startMs) / (7 * 24 * 60 * 60 * 1000)) + 1,
  );
  const total = durationWeeks && durationWeeks > 0 ? durationWeeks : null;
  const week = total ? Math.min(elapsedWeeks, total) : elapsedWeeks;
  const pct = total ? Math.min(1, week / total) : 0;
  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">Timeline</span>
        <span className="text-muted-foreground tabular-nums">
          {total ? `Week ${week} of ${total}` : `Week ${week}`}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
        <span>{fmtDate(startDate)}</span>
        <span>{endDate ? fmtDate(endDate) : "--"}</span>
      </div>
    </div>
  );
}
