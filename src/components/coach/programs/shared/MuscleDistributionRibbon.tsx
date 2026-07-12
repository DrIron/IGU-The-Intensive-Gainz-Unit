import { cn } from "@/lib/utils";

/**
 * MuscleDistributionRibbon — the thin stacked colour bar showing how a day's (or
 * a program's) strength volume splits across muscle groups.
 *
 * Lifted verbatim from the inline ribbon in `muscle-builder/DayColumn.tsx` (§11.2).
 * Presentational only: no data fetching, no volume math. Callers compute the
 * segments (parent-muscle colours come from `getMuscleDisplay`) and pass them in.
 *
 * Consumers (§11.2): builder day column, program card, detail view, macro block,
 * in-use surfaces.
 */
export interface MuscleRibbonSegment {
  /** Parent muscle id — used as the React key. */
  id: string;
  /** Hex from `getMuscleDisplay(parentId).colorHex`. */
  colorHex: string;
  /** Share of the day's strength sets, 0-100. */
  pct: number;
}

interface MuscleDistributionRibbonProps {
  segments: MuscleRibbonSegment[];
  /** Tailwind height class. Default matches the builder's 2px hairline. */
  height?: string;
  className?: string;
}

export function MuscleDistributionRibbon({
  segments,
  height = "h-[2px]",
  className,
}: MuscleDistributionRibbonProps) {
  // Self-omitting: a day with no strength volume renders nothing, not an empty rail.
  if (segments.length === 0) return null;

  return (
    <div
      className={cn("w-full flex overflow-hidden rounded-full bg-muted/30", height, className)}
      aria-hidden
    >
      {segments.map(({ id, colorHex, pct }) => (
        <div key={id} style={{ width: `${pct}%`, backgroundColor: colorHex }} />
      ))}
    </div>
  );
}
