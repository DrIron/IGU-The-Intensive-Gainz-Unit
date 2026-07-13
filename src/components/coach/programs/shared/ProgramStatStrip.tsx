import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDurationRange } from "@/lib/sessionDuration";

/**
 * ProgramStatStrip — the mono micro-stat line under a day/program title
 * ("12 sets · 48-62 min").
 *
 * The middot was ALWAYS the intent (see the line above, unchanged since PR1) but the
 * render never emitted one — segments were merely gap-separated, so the builder and
 * PR2's library card shipped "312 sets 18 exercises". Fixed here. The dot is placed
 * BETWEEN segments, so a self-omitting segment leaves no dangling separator.
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
  /**
   * Exercise count — "312 sets · 18 exercises · ~58 min".
   *
   * PR1 deferred this prop "until a consumer needs it"; PR2's ProgramSummaryCard
   * is that consumer (the locked card spec is sets · exercises · min). Optional
   * and self-omitting, so the builder's day-column strip — which has no room for
   * it — renders exactly as before.
   */
  exercises?: number;
  duration?: StatStripDuration | null;
  className?: string;
}

export function ProgramStatStrip({ sets, exercises, duration, className }: ProgramStatStripProps) {
  // Self-omitting: nothing to say → render nothing (matches the builder's guard).
  if (sets <= 0 && !exercises && !duration) return null;

  // Segments are assembled first so the middot can be placed BETWEEN them. A
  // self-omitting segment (no exercises, no duration) must not leave a dangling
  // separator behind it.
  const parts: { key: string; node: React.ReactNode }[] = [];
  if (sets > 0) parts.push({ key: "sets", node: <span>{sets} sets</span> });
  if (exercises != null && exercises > 0) {
    parts.push({ key: "exercises", node: <span>{exercises} exercises</span> });
  }
  if (duration) {
    parts.push({
      key: "duration",
      node: (
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
      ),
    });
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono text-muted-foreground",
        className,
      )}
    >
      {parts.map((part, i) => (
        <span key={part.key} className="inline-flex items-center gap-x-2">
          {/* Middot BETWEEN segments only — never leading, never trailing. */}
          {i > 0 && <span aria-hidden>·</span>}
          {part.node}
        </span>
      ))}
    </div>
  );
}
