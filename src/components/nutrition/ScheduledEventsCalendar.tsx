import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { Coffee, UtensilsCrossed, ChevronLeft, ChevronRight, CalendarCheck } from "lucide-react";
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  parseISO,
  isWithinInterval,
} from "date-fns";
import { cn } from "@/lib/utils";
import type { DietBreak, RefeedDay } from "@/types/nutrition-phase22";

/**
 * Unified calendar view of diet breaks + refeed days for an active phase.
 *
 * Read-only by design: scheduling still happens through `DietBreakManager`
 * and `RefeedDayScheduler` below. This card's job is to give the coach a
 * single at-a-glance view of what's coming up and what's happened, so they
 * can spot clashes (a refeed landing inside a scheduled diet break, etc.)
 * without context-switching between two lists.
 *
 * Events are color-coded:
 *   - Diet break range: amber background spanning scheduled_start_date to
 *     scheduled_end_date (inclusive), muted if completed/skipped.
 *   - Refeed single day: blue dot in the bottom-right of the cell.
 *
 * Clicking a cell with any event opens a popover with the details. Clicking
 * an empty cell does nothing -- we don't duplicate the schedule flow here.
 */
interface ScheduledEventsCalendarProps {
  phaseId: string;
  /** Optional: show the card without the outer `<Card>` wrapper. */
  unwrapped?: boolean;
}

export function ScheduledEventsCalendar({ phaseId, unwrapped = false }: ScheduledEventsCalendarProps) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [dietBreaks, setDietBreaks] = useState<DietBreak[]>([]);
  const [refeedDays, setRefeedDays] = useState<RefeedDay[]>([]);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async (targetPhase: string) => {
    setLoading(true);
    try {
      // The tables are small (per-phase), so a single fetch of both is cheap.
      const [breaksRes, refeedsRes] = await Promise.all([
        supabase
          .from("diet_breaks")
          .select("*")
          .eq("phase_id", targetPhase)
          .order("scheduled_start_date", { ascending: true }),
        supabase
          .from("refeed_days")
          .select("*")
          .eq("phase_id", targetPhase)
          .order("scheduled_date", { ascending: true }),
      ]);

      if (breaksRes.error) throw breaksRes.error;
      if (refeedsRes.error) throw refeedsRes.error;

      setDietBreaks((breaksRes.data as DietBreak[]) || []);
      setRefeedDays((refeedsRes.data as RefeedDay[]) || []);
    } catch (err) {
      console.error("[ScheduledEventsCalendar] load:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!phaseId) return;
    if (hasFetched.current === phaseId) return;
    hasFetched.current = phaseId;
    load(phaseId);
  }, [phaseId, load]);

  // Grid cells: full weeks from startOfWeek(first-of-month) to endOfWeek(last-of-month).
  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(month));
    const end = endOfWeek(endOfMonth(month));
    return eachDayOfInterval({ start, end });
  }, [month]);

  const body = (
    <>
      {/* Header -- month navigation */}
      <div className="flex items-center justify-between mb-3">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setMonth((m) => startOfMonth(new Date(m.getFullYear(), m.getMonth() - 1, 1)))}
          aria-label="Previous month"
          className="h-8 w-8 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-medium text-sm tabular-nums">{format(month, "MMMM yyyy")}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setMonth((m) => startOfMonth(new Date(m.getFullYear(), m.getMonth() + 1, 1)))}
          aria-label="Next month"
          className="h-8 w-8 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-0.5 mb-1 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-center py-1">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {gridDays.map((day) => {
          const inCurrentMonth = isSameMonth(day, month);
          const today = isToday(day);
          const breaksForDay = dietBreaks.filter((b) =>
            isWithinInterval(day, {
              start: parseISO(b.scheduled_start_date),
              end: parseISO(b.scheduled_end_date),
            }),
          );
          const refeedsForDay = refeedDays.filter((r) => isSameDay(day, parseISO(r.scheduled_date)));
          const hasEvent = breaksForDay.length > 0 || refeedsForDay.length > 0;

          const cell = (
            <div
              className={cn(
                "relative h-10 rounded text-[11px] tabular-nums flex items-start justify-start p-1 transition-colors",
                !inCurrentMonth && "opacity-30",
                today && "ring-1 ring-primary",
                breaksForDay.length > 0 && breakDayColor(breaksForDay[0].status),
                hasEvent && "cursor-pointer hover:ring-1 hover:ring-ring",
              )}
            >
              <span className={cn(today && "font-semibold")}>{format(day, "d")}</span>
              {refeedsForDay.length > 0 && (
                <span
                  aria-label="Refeed day"
                  className={cn(
                    "absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full",
                    refeedDayColor(refeedsForDay[0].status),
                  )}
                />
              )}
            </div>
          );

          if (!hasEvent) return <div key={day.toISOString()}>{cell}</div>;

          return (
            <Popover key={day.toISOString()}>
              <PopoverTrigger asChild>{cell}</PopoverTrigger>
              <PopoverContent className="w-64" align="start">
                <DayDetails date={day} breaks={breaksForDay} refeeds={refeedsForDay} />
              </PopoverContent>
            </Popover>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground font-mono">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-amber-400/70" aria-hidden />
          <span>Diet break</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden />
          <span>Refeed</span>
        </div>
        {loading && <span className="ml-auto">Loading…</span>}
      </div>
    </>
  );

  if (unwrapped) return <div>{body}</div>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarCheck className="h-4 w-4" />
          Scheduled Events
        </CardTitle>
        <CardDescription>Diet breaks and refeed days on one calendar.</CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

function breakDayColor(status: DietBreak["status"]): string {
  switch (status) {
    case "active":
      return "bg-amber-400/40";
    case "scheduled":
      return "bg-amber-400/20";
    case "completed":
      return "bg-amber-400/10 text-muted-foreground";
    case "skipped":
    case "cancelled":
      return "bg-muted/40 text-muted-foreground line-through";
    default:
      return "";
  }
}

function refeedDayColor(status: RefeedDay["status"]): string {
  switch (status) {
    case "completed":
      return "bg-blue-500";
    case "scheduled":
      return "bg-blue-400";
    case "skipped":
    case "cancelled":
      return "bg-muted-foreground/40";
    default:
      return "bg-blue-500";
  }
}

function DayDetails({
  date,
  breaks,
  refeeds,
}: {
  date: Date;
  breaks: DietBreak[];
  refeeds: RefeedDay[];
}) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
        {format(date, "EEE MMM d, yyyy")}
      </p>
      {breaks.map((b) => (
        <div key={b.id} className="text-xs space-y-0.5">
          <div className="flex items-center gap-1.5 font-medium">
            <Coffee className="h-3 w-3 text-amber-500" />
            <span>Diet break -- {b.status}</span>
          </div>
          <p className="text-muted-foreground">
            {format(parseISO(b.scheduled_start_date), "MMM d")} -- {format(parseISO(b.scheduled_end_date), "MMM d")}
          </p>
          {b.maintenance_calories && (
            <p className="font-mono text-muted-foreground">{b.maintenance_calories} kcal</p>
          )}
          {b.reason && <p className="text-muted-foreground italic">{b.reason}</p>}
        </div>
      ))}
      {refeeds.map((r) => (
        <div key={r.id} className="text-xs space-y-0.5">
          <div className="flex items-center gap-1.5 font-medium">
            <UtensilsCrossed className="h-3 w-3 text-blue-500" />
            <span>Refeed -- {r.refeed_type} -- {r.status}</span>
          </div>
          {r.target_calories && (
            <p className="font-mono text-muted-foreground">{r.target_calories} kcal target</p>
          )}
          {r.actual_calories && (
            <p className="font-mono text-muted-foreground">{r.actual_calories} kcal actual</p>
          )}
        </div>
      ))}
      <p className="text-[10px] text-muted-foreground pt-1 border-t">
        Edit in the cards below.
      </p>
    </div>
  );
}
