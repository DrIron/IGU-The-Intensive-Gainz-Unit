import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthSession } from "@/hooks/useAuthSession";
import { ClientPageLayout } from "@/components/layouts/ClientPageLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import {
  addWeeks,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameWeek,
  isToday,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { cn } from "@/lib/utils";
import { useClientWorkoutsWeek } from "@/hooks/useClientWorkouts";

const WEEK_OPTS = { weekStartsOn: 1 as const };

interface WeekModule {
  id: string;
  title: string | null;
  module_type: string;
  status: string;
}

function formatType(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusChipClass(status: string) {
  if (status === "completed") {
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  }
  return "bg-primary/10 text-primary border-primary/25";
}

function SessionChip({ m, onOpen }: { m: WeekModule; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(m.id)}
      className={cn(
        "min-h-[36px] w-full rounded-md border px-2 py-1.5 text-left text-xs font-medium transition-opacity hover:opacity-90",
        statusChipClass(m.status),
      )}
      aria-label={`Open ${m.title || formatType(m.module_type)}`}
    >
      <span className="flex items-center gap-1.5">
        {m.status === "completed" && (
          <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
        )}
        <span className="truncate">{m.title || formatType(m.module_type)}</span>
      </span>
    </button>
  );
}

function DayColumn({
  day,
  modules,
  onOpen,
}: {
  day: Date;
  modules: WeekModule[];
  onOpen: (id: string) => void;
}) {
  const today = isToday(day);
  return (
    <div
      className={cn(
        "flex min-h-[150px] flex-col rounded-lg border bg-card p-2",
        today ? "border-primary" : "border-border",
      )}
    >
      <div className="mb-2 text-center">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {format(day, "EEE")}
        </p>
        <p className={cn("text-sm font-semibold", today && "text-primary")}>
          {format(day, "d")}
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        {modules.length > 0 ? (
          modules.map((m) => <SessionChip key={m.id} m={m} onOpen={onOpen} />)
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <span className="text-[11px] text-muted-foreground/50">Rest</span>
          </div>
        )}
      </div>
    </div>
  );
}

function DayRow({
  day,
  modules,
  onOpen,
}: {
  day: Date;
  modules: WeekModule[];
  onOpen: (id: string) => void;
}) {
  const today = isToday(day);
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3",
        today ? "border-primary" : "border-border",
      )}
    >
      <p className={cn("mb-2 text-sm font-semibold", today && "text-primary")}>
        {format(day, "EEEE, MMM d")}
        {today && <span className="ml-2 text-[11px] font-normal text-primary">Today</span>}
      </p>
      {modules.length > 0 ? (
        <div className="flex flex-col gap-2">
          {modules.map((m) => (
            <SessionChip key={m.id} m={m} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground/50">Rest day</p>
      )}
    </div>
  );
}

function WorkoutCalendarContent() {
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const isMobile = useIsMobile();
  const [weekAnchor, setWeekAnchor] = useState(new Date());

  useDocumentTitle({
    title: "Workout Calendar",
    description: "View your workout schedule",
  });

  const { data: rows, isLoading } = useClientWorkoutsWeek(user?.id, weekAnchor);

  const weekStart = startOfWeek(weekAnchor, WEEK_OPTS);
  const weekEnd = endOfWeek(weekAnchor, WEEK_OPTS);
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const isCurrentWeek = isSameWeek(weekAnchor, new Date(), WEEK_OPTS);
  const rangeLabel = `${format(weekStart, "MMM d")} -- ${format(weekEnd, "MMM d")}`;

  const byDate = useMemo(() => {
    const map: Record<string, WeekModule[]> = {};
    for (const row of rows ?? []) {
      const d = row.client_program_days?.date;
      if (!d) continue;
      (map[d] ??= []).push({
        id: row.id,
        title: row.title,
        module_type: row.module_type,
        status: row.status,
      });
    }
    return map;
  }, [rows]);

  const onOpen = (id: string) => navigate(`/client/workout/session/${id}`);

  const header = (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <CalendarIcon className="h-6 w-6 text-primary" aria-hidden="true" />
          Workout Calendar
        </h1>
        <p className="text-sm text-muted-foreground">
          Your training schedule, week by week.
        </p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous week"
            onClick={() => setWeekAnchor((d) => subWeeks(d, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[150px] text-center text-base font-semibold tabular-nums">
            {rangeLabel}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next week"
            onClick={() => setWeekAnchor((d) => addWeeks(d, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {!isCurrentWeek && (
          <Button variant="ghost" size="sm" onClick={() => setWeekAnchor(new Date())}>
            This week
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 pt-6 pb-24 md:pt-8 md:pb-12">
      {header}

      {isLoading ? (
        <div className={cn("grid gap-2", isMobile ? "grid-cols-1" : "grid-cols-7")}>
          {Array(isMobile ? 4 : 7)
            .fill(0)
            .map((_, i) => (
              <Skeleton key={i} className={isMobile ? "h-20" : "h-40"} />
            ))}
        </div>
      ) : isMobile ? (
        <div className="space-y-3">
          {weekDays.map((day) => (
            <DayRow
              key={day.toISOString()}
              day={day}
              modules={byDate[format(day, "yyyy-MM-dd")] ?? []}
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7 items-start gap-2">
          {weekDays.map((day) => (
            <DayColumn
              key={day.toISOString()}
              day={day}
              modules={byDate[format(day, "yyyy-MM-dd")] ?? []}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function WorkoutCalendar() {
  return (
    <ClientPageLayout>
      <WorkoutCalendarContent />
    </ClientPageLayout>
  );
}
