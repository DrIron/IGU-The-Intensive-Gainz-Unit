// src/components/client-overview/workouts/SessionLogViewer.tsx
// Read-only coach view of a single completed client_day_module: list of the
// client_module_exercises with their exercise_set_logs (performed reps / load
// / RIR / RPE) and the prescription snapshot for context.
//
// Desktop renders as Dialog; mobile as vaul Drawer per CLAUDE.md mobile rule.

import { memo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, Dumbbell, Clock, Check } from "lucide-react";
import { format } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  useSessionLog,
  type DrilldownDay,
  type DrilldownModule,
  type SessionLogEntry,
} from "./useClientWorkouts";

interface SessionLogViewerProps {
  module: DrilldownModule | null;
  day: DrilldownDay | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SessionLogViewer = memo(function SessionLogViewer({
  module,
  day,
  open,
  onOpenChange,
}: SessionLogViewerProps) {
  const isMobile = useIsMobile();
  const { entries, loading, error } = useSessionLog(
    open && module ? module.id : null,
  );

  const header = module ? (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
        {day && <span>{formatDayLabel(day)}</span>}
        {module.sessionType && (
          <Badge
            variant="outline"
            className="text-[10px] uppercase tracking-wide py-0 px-1"
          >
            {module.sessionType}
          </Badge>
        )}
        {module.completedAt ? (
          <Badge
            variant="secondary"
            className="text-[10px] uppercase tracking-wide py-0 px-1"
          >
            <Check className="h-2.5 w-2.5 mr-0.5" aria-hidden="true" />
            Completed
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="text-[10px] uppercase tracking-wide py-0 px-1"
          >
            Not yet completed
          </Badge>
        )}
      </div>
      <div className="text-lg font-semibold truncate">
        {module.title ?? "Untitled session"}
      </div>
    </div>
  ) : null;

  const body = (
    <div className="space-y-4">
      {module?.completedAt && (
        <div className="text-xs text-muted-foreground font-mono flex items-center gap-1.5">
          <Clock className="h-3 w-3" aria-hidden="true" />
          Completed {format(new Date(module.completedAt), "PPp")}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-md p-3">
          {error}
        </div>
      ) : entries.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Dumbbell className="h-6 w-6 mx-auto opacity-50 mb-2" aria-hidden="true" />
          No exercises on this session.
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => (
            <ExerciseBlock key={e.id} entry={e} />
          ))}
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="sr-only">Session log</DrawerTitle>
            {header}
          </DrawerHeader>
          <ScrollArea
            className="px-4 pb-6"
            style={{ maxHeight: "calc(92vh - 8rem)" }}
          >
            {body}
          </ScrollArea>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="text-left">
          <DialogTitle className="sr-only">Session log</DialogTitle>
          {header}
        </DialogHeader>
        <ScrollArea className="flex-1 pr-2">{body}</ScrollArea>
      </DialogContent>
    </Dialog>
  );
});

/* ------------------------------------------------------------------ */

function ExerciseBlock({ entry }: { entry: SessionLogEntry }) {
  const prescribedSets = readPrescribedSetCount(entry.prescriptionSnapshotJson);
  const loggedSets = entry.sets.length;
  return (
    <div className="rounded-md border border-border/50 bg-card/50">
      <div className="flex items-start justify-between gap-2 px-3 py-2 border-b border-border/40">
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{entry.exerciseName}</p>
          {entry.section && entry.section !== "main" && (
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
              {entry.section}
            </p>
          )}
        </div>
        <div className="shrink-0 text-xs font-mono tabular-nums text-muted-foreground">
          {loggedSets} / {prescribedSets ?? "--"} sets
        </div>
      </div>
      {loggedSets === 0 ? (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          Not logged.
        </div>
      ) : (
        <div className="divide-y divide-border/40">
          <div className="grid grid-cols-[auto,1fr,1fr,1fr,1fr] gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
            <span>Set</span>
            <span>Load</span>
            <span>Reps</span>
            <span>RIR</span>
            <span>RPE</span>
          </div>
          {entry.sets.map((s) => (
            <div
              key={s.setIndex}
              className={cn(
                "grid grid-cols-[auto,1fr,1fr,1fr,1fr] gap-2 px-3 py-1.5 text-sm font-mono tabular-nums",
              )}
            >
              <span className="text-muted-foreground">{s.setIndex}</span>
              <span>{s.performedLoad ?? "--"}</span>
              <span>{s.performedReps ?? "--"}</span>
              <span>{s.performedRir ?? "--"}</span>
              <span>{s.performedRpe ?? "--"}</span>
            </div>
          ))}
        </div>
      )}
      {entry.sets.some((s) => s.notes) && (
        <div className="px-3 py-2 border-t border-border/40 space-y-1">
          {entry.sets
            .filter((s) => s.notes)
            .map((s) => (
              <p key={s.setIndex} className="text-xs text-muted-foreground">
                <span className="font-mono mr-1.5">Set {s.setIndex}:</span>
                {s.notes}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function readPrescribedSetCount(
  snapshot: Record<string, unknown> | null,
): number | null {
  if (!snapshot) return null;
  const direct = snapshot.set_count;
  if (typeof direct === "number") return direct;
  const setsJson = snapshot.sets_json;
  if (Array.isArray(setsJson)) return setsJson.length;
  return null;
}

function formatDayLabel(day: DrilldownDay): string {
  try {
    return format(new Date(day.date), "EEE MMM d");
  } catch {
    return day.date;
  }
}
