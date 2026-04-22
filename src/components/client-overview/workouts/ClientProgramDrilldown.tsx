// src/components/client-overview/workouts/ClientProgramDrilldown.tsx
// Per-program day layout. Renders the client_program_days for a selected
// program grouped into weeks, with module chips per day showing completion
// state. Clicking a module opens the SessionLogViewer drawer/dialog.

import { memo, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type {
  ClientProgramSummary,
  DrilldownDay,
  DrilldownModule,
} from "./useClientWorkouts";

interface ClientProgramDrilldownProps {
  program: ClientProgramSummary;
  days: DrilldownDay[];
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onOpenModule: (module: DrilldownModule, day: DrilldownDay) => void;
}

export const ClientProgramDrilldown = memo(function ClientProgramDrilldown({
  program,
  days,
  loading,
  error,
  onBack,
  onOpenModule,
}: ClientProgramDrilldownProps) {
  // Group days into weeks using day_index (1-based). W1 = days 1-7, etc.
  const weeks = useMemo(() => {
    const byWeek = new Map<number, DrilldownDay[]>();
    for (const d of days) {
      const wk = Math.max(1, Math.ceil(d.dayIndex / 7));
      const arr = byWeek.get(wk) ?? [];
      arr.push(d);
      byWeek.set(wk, arr);
    }
    return Array.from(byWeek.entries())
      .sort(([a], [b]) => a - b)
      .map(([weekIndex, weekDays]) => ({
        weekIndex,
        days: weekDays.slice().sort((a, b) => a.dayIndex - b.dayIndex),
      }));
  }, [days]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to program list">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
            {program.macrocycleName ?? "Program"}
          </p>
          <h3 className="font-semibold text-lg md:text-xl truncate">
            {program.title}
          </h3>
        </div>
        <div className="text-right shrink-0 font-mono tabular-nums text-xs text-muted-foreground">
          <div>
            {program.completedModules} / {program.totalModules || "--"}
          </div>
          <div className="text-[10px]">completed</div>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-6 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : weeks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No days scheduled for this program yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {weeks.map((w) => (
            <WeekSection
              key={w.weekIndex}
              weekIndex={w.weekIndex}
              days={w.days}
              onOpenModule={onOpenModule}
            />
          ))}
        </div>
      )}
    </div>
  );
});

/* ------------------------------------------------------------------ */

interface WeekSectionProps {
  weekIndex: number;
  days: DrilldownDay[];
  onOpenModule: (module: DrilldownModule, day: DrilldownDay) => void;
}

function WeekSection({ weekIndex, days, onOpenModule }: WeekSectionProps) {
  const totalMods = days.reduce((n, d) => n + d.modules.length, 0);
  const completedMods = days.reduce(
    (n, d) => n + d.modules.filter((m) => m.completedAt).length,
    0,
  );
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Week
          </span>
          <span className="font-semibold">{weekIndex}</span>
        </div>
        <span className="text-xs text-muted-foreground font-mono tabular-nums">
          {completedMods} / {totalMods}
        </span>
      </CardHeader>
      <CardContent className="pt-2">
        {/* Mobile: stack; desktop: 7-col grid */}
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
          {days.map((d) => (
            <DayCell key={d.id} day={d} onOpenModule={onOpenModule} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DayCell({
  day,
  onOpenModule,
}: {
  day: DrilldownDay;
  onOpenModule: (module: DrilldownModule, day: DrilldownDay) => void;
}) {
  const isRest = day.modules.length === 0;
  return (
    <div
      className={cn(
        "rounded-md border p-2 space-y-1.5 min-h-[92px]",
        isRest && "border-dashed bg-muted/20",
      )}
    >
      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
        <span>{formatDayLabel(day.date)}</span>
        <span className="tabular-nums">D{day.dayIndex}</span>
      </div>
      {isRest ? (
        <div className="h-full flex items-center justify-center py-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
            Rest
          </span>
        </div>
      ) : (
        <div className="space-y-1">
          {day.modules.map((m) => (
            <ModuleChip
              key={m.id}
              module={m}
              onClick={() => onOpenModule(m, day)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ModuleChip({
  module,
  onClick,
}: {
  module: DrilldownModule;
  onClick: () => void;
}) {
  const isCompleted = Boolean(module.completedAt);
  const isSkipped = module.status === "skipped";
  const Icon = isCompleted ? CheckCircle2 : isSkipped ? XCircle : Circle;
  const iconClass = isCompleted
    ? "text-emerald-500"
    : isSkipped
      ? "text-destructive"
      : "text-muted-foreground/60";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-1.5 px-1.5 py-1 rounded border text-left text-xs",
        "hover:bg-muted/50 hover:border-border transition-colors",
        "border-border/40 bg-background",
        isCompleted && "bg-emerald-500/5 border-emerald-500/20",
      )}
      aria-label={`${module.title ?? "Session"} ${isCompleted ? "completed" : ""}`}
    >
      <Icon className={cn("h-3 w-3 shrink-0", iconClass)} aria-hidden="true" />
      <span className="truncate flex-1 min-w-0">
        {module.title ?? "Untitled"}
      </span>
      {module.sessionType && module.sessionType !== "strength" && (
        <Badge
          variant="outline"
          className="text-[9px] uppercase tracking-wider py-0 px-1 shrink-0"
        >
          {sessionTypeShort(module.sessionType)}
        </Badge>
      )}
    </button>
  );
}

function sessionTypeShort(type: string): string {
  switch (type) {
    case "cardio":
      return "Cardio";
    case "hiit":
      return "HIIT";
    case "mobility":
    case "yoga_mobility":
      return "Mob";
    case "recovery":
      return "Rec";
    case "sport_specific":
      return "Sport";
    default:
      return type.slice(0, 6);
  }
}

function formatDayLabel(iso: string): string {
  try {
    return format(new Date(iso), "EEE d");
  } catch {
    return iso;
  }
}
