import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MuscleDistributionRibbon, type MuscleRibbonSegment } from "./MuscleDistributionRibbon";
import { ProgramStatStrip, type StatStripDuration } from "./ProgramStatStrip";
import { ProgramStatusPill, type ProgramStatus } from "./ProgramStatusPill";
import { SyncStatePill, type SyncState } from "./SyncStatePill";
import type { ProgramStructure, FocusChips } from "./programSummaryAdapter";

/**
 * ProgramSummaryCard — the keystone (§11.2). One card, every surface: library,
 * assign dialog, detail header, in-use. Build it once and "the same card
 * everywhere" (§5.2) holds by construction.
 *
 * Presentational only (§11.1): the caller adapts rows → slots, runs
 * `useMusclePlanVolume`, and hands the results in. No fetching here.
 *
 * Composes the PR1 primitives rather than re-inlining any of them:
 *   MuscleDistributionRibbon · ProgramStatStrip · ProgramStatusPill · SyncStatePill
 *
 * Card content is LOCKED (§2A + §6):
 *   name · structure line · ribbon · mono sets/exercises/min strip · status + reach
 *
 * NO landmark zones on the card (§6.3 LOCKED) — per-muscle zones across ~11
 * muscles are too dense here, and any single-zone aggregate would misrepresent the
 * program. They live in the detail view's MuscleDistributionBars.
 */
export interface ProgramReach {
  clients: number;
  teams: number;
}

interface ProgramSummaryCardProps {
  name: string;
  level?: string | null;
  structure: ProgramStructure;
  ribbon: MuscleRibbonSegment[];
  sets: number;
  exercises: number;
  duration?: StatStripDuration | null;
  focus: FocusChips;
  status: ProgramStatus;
  /** "N clients · M teams" — omitted entirely when the program is unassigned. */
  reach?: ProgramReach | null;
  syncState?: SyncState | null;
  tags?: string[];
  /** Rendered under the footer — the kebab, supplied by the consuming surface. */
  actionSlot?: React.ReactNode;
  className?: string;
}

/** "6 wks · 4 days/wk · 24 sessions" */
function structureLine({ weeks, daysPerWeek, sessions }: ProgramStructure): string {
  const parts: string[] = [];
  if (weeks > 0) parts.push(`${weeks} ${weeks === 1 ? "wk" : "wks"}`);
  if (daysPerWeek > 0) parts.push(`${daysPerWeek} days/wk`);
  if (sessions > 0) parts.push(`${sessions} ${sessions === 1 ? "session" : "sessions"}`);
  return parts.join(" · ");
}

function reachLine({ clients, teams }: ProgramReach): string | null {
  const parts: string[] = [];
  if (clients > 0) parts.push(`${clients} ${clients === 1 ? "client" : "clients"}`);
  if (teams > 0) parts.push(`${teams} ${teams === 1 ? "team" : "teams"}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function ProgramSummaryCard({
  name,
  level,
  structure,
  ribbon,
  sets,
  exercises,
  duration,
  focus,
  status,
  reach,
  syncState,
  tags,
  actionSlot,
  className,
}: ProgramSummaryCardProps) {
  const structureText = structureLine(structure);
  const reachText = reach ? reachLine(reach) : null;

  return (
    <div className={cn("flex h-full flex-col gap-2.5 p-4", className)}>
      {/* Header — name + status/level. */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-1 text-sm font-semibold">{name}</h3>
          {structureText && (
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{structureText}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ProgramStatusPill status={status} count={reach?.clients} />
          {syncState && <SyncStatePill state={syncState} />}
        </div>
      </div>

      {/* The single highest-value add: what this program actually trains. */}
      <MuscleDistributionRibbon segments={ribbon} />

      {/* Focus chips — coach's session names, else derived dominant muscle. */}
      {focus.chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {focus.chips.map((chip) => (
            <Badge key={chip} variant="secondary" className="text-[10px] font-normal">
              {chip}
            </Badge>
          ))}
          {focus.overflow > 0 && (
            <span className="font-mono text-[10px] text-muted-foreground">+{focus.overflow}</span>
          )}
        </div>
      )}

      {/* Mono volume strip. */}
      <ProgramStatStrip sets={sets} exercises={exercises} duration={duration} />

      {/* Footer — level + tags + reach + actions. */}
      <div className="mt-auto flex items-end justify-between gap-2 pt-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {level && (
            <Badge variant="outline" className="text-[10px] capitalize">
              {level}
            </Badge>
          )}
          {(tags ?? []).slice(0, 3).map((tag) => (
            <Badge key={tag} variant="outline" className="text-[10px] font-normal">
              {tag}
            </Badge>
          ))}
          {reachText && (
            <span className="font-mono text-[10px] text-muted-foreground">{reachText}</span>
          )}
        </div>
        {actionSlot && <div className="shrink-0">{actionSlot}</div>}
      </div>
    </div>
  );
}
