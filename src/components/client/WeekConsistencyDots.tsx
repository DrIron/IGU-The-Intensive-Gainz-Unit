import { cn } from "@/lib/utils";

/**
 * WeekConsistencyDots (CL5) — a quiet week strip near the client hero.
 *
 * ── FRAMING RULE (non-negotiable) ───────────────────────────────────────────
 * This is PRESENCE, NOT A STREAK.
 *
 *   - A day the client trained is a filled crimson dot.
 *   - A day they did not is a NEUTRAL OUTLINE dot. Never red, never destructive,
 *     never a warning. It is not a failure state; it is just a day.
 *   - The label counts what HAPPENED ("4 active days this week"), never what didn't.
 *     No "3 missed", no "don't break the chain", no flame, no streak, no guilt.
 *   - Zero active days reads "0 active days this week" and nothing else. No nudge,
 *     no scolding, no "let's get moving!". A person having a hard week does not need
 *     their dashboard to point at it.
 *
 * Grounded in timespent/Me+ gentle week-dots — explicitly NOT QUITTR's flame-streak
 * pressure framing. If in doubt: quieter.
 *
 * This SUPERSEDES AD2 (the awards/trophy screen). Do not build a gamified wall. If
 * milestones are ever wanted they ride here as occasional gentle callouts.
 *
 * Presentational only — the caller supplies the data (`useWeeklyConsistency`).
 *
 * Week runs MONDAY → SUNDAY, matching the IGU week every other surface uses
 * (`startOfIguWeek` = weekStartsOn: 1). See the hook for why.
 */

/** Mon → Sun. Duplicate letters (T/T, S/S) are fine — this is a glanceable strip. */
const DAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;

interface WeekConsistencyDotsProps {
  /** The 7 Kuwait dates of this week, Monday → Sunday. */
  weekDates: string[];
  /** Dates on which a workout was logged. */
  activeDates: Set<string>;
  activeCount: number;
  className?: string;
}

export function WeekConsistencyDots({
  weekDates,
  activeDates,
  activeCount,
  className,
}: WeekConsistencyDotsProps) {
  if (weekDates.length !== 7) return null;

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="flex items-center gap-3" role="list" aria-label="This week's activity">
        {weekDates.map((iso, i) => {
          const isActive = activeDates.has(iso);
          return (
            <div key={iso} className="flex flex-col items-center gap-1.5" role="listitem">
              <span
                aria-hidden
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  // Filled = trained. Outline = didn't. Both are neutral facts;
                  // the outline is muted-border, NEVER destructive/red/amber.
                  isActive ? "bg-primary" : "border border-border bg-transparent",
                )}
              />
              <span className="font-mono text-[10px] uppercase text-muted-foreground">
                {DAY_INITIALS[i]}
              </span>
              <span className="sr-only">
                {isActive ? "Active" : "No workout logged"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Counts what happened. Never what didn't. */}
      <p className="font-mono text-xs text-muted-foreground">
        {activeCount} {activeCount === 1 ? "active day" : "active days"} this week
      </p>
    </div>
  );
}
