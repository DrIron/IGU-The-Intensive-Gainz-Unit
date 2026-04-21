// src/components/client-overview/workouts/WorkoutAdherencePulse.tsx
// At-a-glance hero for the coach's Workouts tab. Four stat tiles echoing the
// OverviewTab StatTile vocabulary (monospace primary, color rail, muted label)
// so the two tabs feel continuous.

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Dumbbell, CalendarRange, TrendingUp, Timer } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  type AdherencePulse,
  type ClientProgramSummary,
  weeksIntoProgram,
} from "./useClientWorkouts";

interface WorkoutAdherencePulseProps {
  pulse: AdherencePulse;
  loading: boolean;
}

export function WorkoutAdherencePulse({ pulse, loading }: WorkoutAdherencePulseProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      <StatTile
        icon={<Dumbbell className="h-4 w-4" aria-hidden="true" />}
        label="Active Program"
        railColor={pulse.activeProgram ? "bg-emerald-500" : "bg-muted"}
        loading={loading}
        empty={!pulse.activeProgram}
        emptyLabel="None assigned"
        primary={
          pulse.activeProgram
            ? weeksLabel(pulse.activeProgram)
            : "--"
        }
        secondary={pulse.activeProgram?.title ?? undefined}
      />
      <StatTile
        icon={<Timer className="h-4 w-4" aria-hidden="true" />}
        label="Last Workout"
        railColor={workoutRail(pulse.lastWorkoutAt)}
        loading={loading}
        empty={!pulse.lastWorkoutAt}
        emptyLabel="No completions yet"
        primary={pulse.lastWorkoutAt ? relative(pulse.lastWorkoutAt) : "--"}
        secondary={pulse.lastWorkoutAt ? absolute(pulse.lastWorkoutAt) : undefined}
      />
      <StatTile
        icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
        label="This Week"
        railColor={weeklyRail(pulse.weeklyCompletionPct)}
        loading={loading}
        empty={pulse.weeklyCompletionPct == null}
        emptyLabel="Nothing scheduled"
        primary={
          pulse.weeklyCompletionPct != null
            ? `${pulse.weeklyCompletionPct}%`
            : "--"
        }
        secondary={
          pulse.weeklyCompletionPct != null
            ? `${pulse.weeklyCompleted} / ${pulse.weeklyScheduled} done`
            : undefined
        }
      />
      <StatTile
        icon={<CalendarRange className="h-4 w-4" aria-hidden="true" />}
        label="Macrocycle"
        railColor={pulse.activeProgram?.macrocycleName ? "bg-primary" : "bg-muted"}
        loading={loading}
        empty={!pulse.activeProgram?.macrocycleName}
        emptyLabel="Standalone"
        primary={pulse.activeProgram?.macrocycleName ?? "--"}
        secondary={undefined}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface StatTileProps {
  icon: React.ReactNode;
  label: string;
  railColor: string;
  primary: string;
  secondary?: string;
  loading: boolean;
  empty: boolean;
  emptyLabel: string;
}

function StatTile({
  icon,
  label,
  railColor,
  primary,
  secondary,
  loading,
  empty,
  emptyLabel,
}: StatTileProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex h-full">
          <div aria-hidden="true" className={cn("w-1 shrink-0", railColor)} />
          <div className="flex-1 p-3 md:p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
              {icon}
              <span>{label}</span>
            </div>
            {loading ? (
              <div className="h-7 w-20 rounded bg-muted animate-pulse" />
            ) : empty ? (
              <p className="text-sm text-muted-foreground">{emptyLabel}</p>
            ) : (
              <div className="space-y-0.5">
                <p className="font-mono tabular-nums text-xl md:text-2xl font-display leading-none truncate">
                  {primary}
                </p>
                {secondary && (
                  <p className="font-mono text-[11px] text-muted-foreground tabular-nums truncate">
                    {secondary}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function weeksLabel(p: ClientProgramSummary): string {
  const w = weeksIntoProgram(p);
  if (w == null) return p.title.slice(0, 18);
  return `Week ${w}`;
}

function relative(iso: string): string {
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

function absolute(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}

function workoutRail(iso: string | null): string {
  const d = daysSince(iso);
  if (d == null) return "bg-muted";
  if (d <= 3) return "bg-emerald-500";
  if (d <= 7) return "bg-amber-500";
  return "bg-destructive";
}

function weeklyRail(pct: number | null): string {
  if (pct == null) return "bg-muted";
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-destructive";
}
