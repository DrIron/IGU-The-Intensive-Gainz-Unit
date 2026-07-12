import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDurationRange } from "@/lib/sessionDuration";

/**
 * ProgramStatStrip — the mono micro-stat line under a day/program title
 * ("12 sets · 48-62 min").
 *
 * Lifted from the header strip in `muscle-builder/DayColumn.tsx` (§11.2).
 * Presentational only — the caller computes sets and the duration estimate
 * (`estimateSessionDuration`); this just formats and lays them out.
 *
 * NOTE ON THE PROP CONTRACT: §11.2 sketches `{ sets, exercises, estMin?, reach? }`,
 * but that was written before reading the strip. What the builder actually renders
 * is sets + a duration RANGE (min/max seconds, plus an `inferred` flag driving the
 * tooltip). Implementing the sketch literally would have changed the rendering, so
 * the props below model the real thing. `exercises` / `reach` can be added when a
 * consumer (PR2 library card) actually needs them, rather than being invented now.
 *
 * Consumers (§11.2): program card, detail, assign dialog, in-use surfaces.
 */
export interface StatStripDuration {
  minSeconds: number;
  maxSeconds: number;
  /** True when the estimate assumed default tempo/rest → softer tooltip wording. */
  inferred: boolean;
}

interface ProgramStatStripProps {
  sets: number;
  duration?: StatStripDuration | null;
  className?: string;
}

export function ProgramStatStrip({ sets, duration, className }: ProgramStatStripProps) {
  // Self-omitting: nothing to say → render nothing (matches the builder's guard).
  if (sets <= 0 && !duration) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono text-muted-foreground",
        className,
      )}
    >
      {sets > 0 && <span>{sets} sets</span>}
      {duration && (
        <span
          className="inline-flex items-center gap-0.5"
          title={
            duration.inferred
              ? "Estimate assumes 2-4s/rep tempo and 60-120s rest when not set"
              : "Estimated session duration"
          }
        >
          <Clock className="h-2.5 w-2.5" aria-hidden />
          {formatDurationRange(duration.minSeconds, duration.maxSeconds)}
        </span>
      )}
    </div>
  );
}
