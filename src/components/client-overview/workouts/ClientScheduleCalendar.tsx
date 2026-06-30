// src/components/client-overview/workouts/ClientScheduleCalendar.tsx
//
// B5 — coach-facing, READ-ONLY week/month calendar of a single client's training
// schedule, inside Client Overview → Workouts → Calendar. A staff sibling of the
// client page (src/pages/client/WorkoutCalendar.tsx) — mirrors its grid + status
// logic but is view-only (no TakeDeloadCard, no logging nav) and does NOT touch
// that file. Past sessions open the existing read-only SessionLogViewer; upcoming
// sessions are static.
//
// Data is dual-path, mirroring the client page: board_v2 + an active canonical
// assignment → loadCanonicalSchedule; else (flag off / no assignment / null
// schedule) → the legacy useClientWorkoutsWeek/Month hooks (both take a userId, so
// the coach passes context.clientUserId; coach RLS already permits these reads).
// Both shapes normalise into one SessionCell so the render is source-agnostic.

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isBoardV2Enabled } from "@/lib/featureFlags";
import {
  resolveActiveAssignment,
  loadCanonicalSchedule,
  canonicalSessionTitle,
  type CanonicalSchedule,
} from "@/lib/canonicalScheduleAdapter";
import {
  useClientWorkoutsMonth,
  useClientWorkoutsWeek,
  deriveModuleBrief,
} from "@/hooks/useClientWorkouts";
import { SessionLogViewer } from "./SessionLogViewer";
import type { DrilldownDay, DrilldownModule } from "./useClientWorkouts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChevronLeft, ChevronRight, CheckCircle2, Dumbbell, Snowflake } from "lucide-react";
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isSameWeek,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { cn } from "@/lib/utils";

const WEEK_OPTS = { weekStartsOn: 1 as const };

interface SessionCell {
  id: string; // legacy client_day_modules.id, OR canonical plan_session_id
  title: string;
  type: string;
  done: boolean;
  exerciseCount: number;
  muscles: string[];
  isDeload: boolean;
  /** Canonical sessions carry this so the viewer reads via assignment+plan_session. */
  canonical?: { assignmentId: string; date: string };
}

type DerivedStatus = "done" | "missed" | "upcoming";
function deriveStatus(cell: SessionCell, date: Date): DerivedStatus {
  if (cell.done) return "done";
  return startOfDay(date).getTime() < startOfDay(new Date()).getTime() ? "missed" : "upcoming";
}

const DOT: Record<DerivedStatus, string> = {
  done: "bg-emerald-500",
  missed: "bg-red-500/70",
  upcoming: "bg-muted-foreground/40",
};
const RAIL: Record<DerivedStatus, string> = {
  done: "bg-emerald-500",
  missed: "bg-red-500/70",
  upcoming: "bg-muted-foreground/40",
};
const PILL: Record<DerivedStatus, string> = {
  done: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  missed: "bg-red-500/10 text-red-600 dark:text-red-400",
  upcoming: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<DerivedStatus, string> = { done: "Done", missed: "Missed", upcoming: "Scheduled" };

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function formatType(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function briefText(cell: SessionCell) {
  const count = `${cell.exerciseCount} exercise${cell.exerciseCount === 1 ? "" : "s"}`;
  return cell.muscles.length ? `${count} · ${cell.muscles.map(cap).join(", ")}` : count;
}

interface ClientScheduleCalendarProps {
  clientUserId: string;
}

export function ClientScheduleCalendar({ clientUserId }: ClientScheduleCalendarProps) {
  const isMobile = useIsMobile();
  const [view, setView] = useState<"month" | "week">("month");
  const [anchor, setAnchor] = useState(new Date());

  // Read-only session-log viewer target (past sessions only).
  const [logTarget, setLogTarget] = useState<{ module: DrilldownModule; day: DrilldownDay } | null>(null);

  // ── canonical path (board_v2 + active assignment) ──────────────────────────
  const boardV2 = isBoardV2Enabled();
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<CanonicalSchedule | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(boardV2);
  const assignmentFetchedRef = useRef(false);

  useEffect(() => {
    // Re-resolve whenever the client changes.
    assignmentFetchedRef.current = false;
    setAssignmentId(null);
    setSchedule(null);
    if (!boardV2) {
      setScheduleLoading(false);
      return;
    }
    let cancelled = false;
    setScheduleLoading(true);
    (async () => {
      const assignment = await resolveActiveAssignment(clientUserId);
      if (cancelled) return;
      if (!assignment) {
        setScheduleLoading(false);
        return;
      }
      setAssignmentId(assignment.id);
      const s = await loadCanonicalSchedule(assignment.id);
      if (cancelled) return;
      setSchedule(s);
      setScheduleLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [boardV2, clientUserId]);

  const useCanonical = boardV2 && !!schedule && !!assignmentId;

  // ── legacy path (flag off / no assignment) ─────────────────────────────────
  const { data: monthRows, isLoading: monthLoading } = useClientWorkoutsMonth(clientUserId, anchor);
  const { data: weekRows, isLoading: weekLoading } = useClientWorkoutsWeek(clientUserId, anchor);

  // ── "has any active program?" probe — drives the empty state (not a blank grid).
  // Definitive across both paths (canonical assignment OR legacy program). Read-only.
  const [hasProgram, setHasProgram] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    setHasProgram(null);
    (async () => {
      const [aRes, pRes] = await Promise.all([
        supabase
          .from("client_plan_assignment")
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientUserId)
          .eq("status", "active"),
        supabase
          .from("client_programs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", clientUserId)
          .eq("status", "active"),
      ]);
      if (cancelled) return;
      setHasProgram((aRes.count ?? 0) > 0 || (pRes.count ?? 0) > 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientUserId]);

  // ── normalise both sources into date → SessionCell[] ───────────────────────
  const canonicalByDate = useMemo<Record<string, SessionCell[]> | null>(() => {
    if (!useCanonical || !schedule || !assignmentId) return null;
    const map: Record<string, SessionCell[]> = {};
    for (const [iso, day] of schedule.byDate) {
      map[iso] = day.modules.map((m) => ({
        id: m.id,
        title: canonicalSessionTitle(m),
        type: m.module_type,
        done: m.status === "completed",
        exerciseCount: m.exerciseCount,
        muscles: m.muscles,
        isDeload: m.isDeload,
        canonical: { assignmentId, date: iso },
      }));
    }
    return map;
  }, [useCanonical, schedule, assignmentId]);

  const legacyMonthByDate = useMemo<Record<string, SessionCell[]>>(() => {
    const map: Record<string, SessionCell[]> = {};
    for (const day of monthRows ?? []) {
      const mods = (day.client_day_modules ?? []).map((m: any): SessionCell => {
        const brief = deriveModuleBrief(m);
        return {
          id: m.id,
          title: m.title || formatType(m.module_type),
          type: m.module_type,
          done: m.status === "completed" || !!m.completed_at,
          exerciseCount: brief.exerciseCount,
          muscles: brief.muscles,
          isDeload: false,
        };
      });
      if (mods.length) map[day.date] = mods;
    }
    return map;
  }, [monthRows]);

  const legacyWeekByDate = useMemo<Record<string, SessionCell[]>>(() => {
    const map: Record<string, SessionCell[]> = {};
    for (const row of weekRows ?? []) {
      const d = row.client_program_days?.date;
      if (!d) continue;
      const brief = deriveModuleBrief(row);
      (map[d] ??= []).push({
        id: row.id,
        title: row.title || formatType(row.module_type),
        type: row.module_type,
        done: row.status === "completed" || !!row.completed_at,
        exerciseCount: brief.exerciseCount,
        muscles: brief.muscles,
        isDeload: false,
      });
    }
    return map;
  }, [weekRows]);

  const monthByDate = canonicalByDate ?? legacyMonthByDate;
  const weekByDate = canonicalByDate ?? legacyWeekByDate;

  // ── date scaffolding ───────────────────────────────────────────────────────
  const monthStart = startOfMonth(anchor);
  const weekStart = startOfWeek(anchor, WEEK_OPTS);
  const weekEnd = endOfWeek(anchor, WEEK_OPTS);
  const gridStart = startOfWeek(monthStart, WEEK_OPTS);
  const gridEnd = endOfWeek(endOfMonth(anchor), WEEK_OPTS);
  const monthDays = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const isCurrentMonth = isSameMonth(anchor, new Date());
  const isCurrentWeek = isSameWeek(anchor, new Date(), WEEK_OPTS);
  const atCurrent = view === "month" ? isCurrentMonth : isCurrentWeek;

  const goPrev = () => setAnchor((d) => (view === "month" ? subMonths(d, 1) : subWeeks(d, 1)));
  const goNext = () => setAnchor((d) => (view === "month" ? addMonths(d, 1) : addWeeks(d, 1)));
  const periodLabel =
    view === "month" ? format(anchor, "MMMM yyyy") : `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d")}`;

  // ── recap: X / Y done across the visible range ─────────────────────────────
  const recap = useMemo(() => {
    const days = view === "month" ? monthDays.filter((d) => isSameMonth(d, anchor)) : weekDays;
    let total = 0;
    let done = 0;
    for (const day of days) {
      const cells = (view === "month" ? monthByDate : weekByDate)[format(day, "yyyy-MM-dd")] ?? [];
      for (const c of cells) {
        total += 1;
        if (c.done) done += 1;
      }
    }
    return { done, total };
  }, [view, monthDays, weekDays, monthByDate, weekByDate, anchor]);

  const loading = useCanonical || (boardV2 && scheduleLoading)
    ? scheduleLoading
    : view === "month"
      ? monthLoading
      : weekLoading;

  // Past sessions open the read-only viewer; upcoming are static.
  const openSession = (cell: SessionCell, date: Date) => {
    const status = deriveStatus(cell, date);
    if (status === "upcoming") return; // static
    const iso = format(date, "yyyy-MM-dd");
    const module: DrilldownModule = {
      id: cell.id,
      title: cell.title,
      moduleType: cell.type,
      sessionType: cell.type,
      status: cell.done ? "completed" : null,
      completedAt: cell.done ? iso : null,
      sortOrder: 0,
      isDeload: cell.isDeload,
      canonical: cell.canonical,
    };
    const day: DrilldownDay = {
      id: `cell-${iso}`,
      dayIndex: 0,
      date: iso,
      title: null,
      modules: [module],
      isDeload: cell.isDeload,
    };
    setLogTarget({ module, day });
  };

  // ── empty state: no active program at all ──────────────────────────────────
  if (hasProgram === false) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          <Dumbbell className="mx-auto mb-2 h-6 w-6 opacity-50" aria-hidden />
          No active program for this client. Assign one under the Programs tab.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toggle + period nav + recap */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border bg-card p-1">
          {(["month", "week"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-3.5 py-1.5 text-sm font-medium capitalize transition-colors",
                view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous" onClick={goPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[140px] text-center text-base font-semibold tabular-nums">{periodLabel}</span>
          <Button variant="outline" size="icon" aria-label="Next" onClick={goNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!atCurrent && (
            <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())}>
              Today
            </Button>
          )}
        </div>
      </div>

      {/* Recap strip */}
      <div className="rounded-lg border bg-muted/30 px-4 py-2 text-sm">
        <span className="font-semibold tabular-nums">{recap.done}</span>
        <span className="text-muted-foreground">
          {" "}
          / {recap.total} session{recap.total === 1 ? "" : "s"} completed {view === "month" ? "this month" : "this week"}
        </span>
      </div>

      {loading ? (
        <Skeleton className="h-72 w-full" />
      ) : view === "month" ? (
        <div>
          <div className="mb-1 grid grid-cols-7 gap-1.5">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="text-center text-[10px] uppercase tracking-wide text-muted-foreground">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {monthDays.map((day) => {
              const cells = monthByDate[format(day, "yyyy-MM-dd")] ?? [];
              const inMonth = isSameMonth(day, anchor);
              const today = isToday(day);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={cells.length === 0}
                  onClick={() => {
                    setAnchor(day);
                    setView("week");
                  }}
                  className={cn(
                    "min-h-[58px] rounded-lg border p-1.5 text-center align-top transition-colors",
                    today ? "border-primary" : "border-border",
                    cells.length > 0 ? "cursor-pointer hover:bg-muted/40" : "cursor-default",
                    !inMonth && "opacity-40",
                  )}
                >
                  <div className={cn("font-mono text-xs", today && "font-semibold text-primary")}>{format(day, "d")}</div>
                  <div className="mt-1 flex flex-wrap justify-center gap-1">
                    {cells.map((c) => (
                      <span key={c.id} className={cn("h-1.5 w-1.5 rounded-full", DOT[deriveStatus(c, day)])} aria-hidden />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
            <span><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" />Done</span>
            <span><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-500/70 align-middle" />Missed</span>
            <span><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/40 align-middle" />Upcoming</span>
          </div>
        </div>
      ) : isMobile ? (
        <div className="space-y-3">
          {weekDays.map((day) => {
            const cells = weekByDate[format(day, "yyyy-MM-dd")] ?? [];
            const today = isToday(day);
            return (
              <div key={day.toISOString()} className={cn("rounded-lg border bg-card p-3", today ? "border-primary" : "border-border")}>
                <p className={cn("mb-2 text-sm font-semibold", today && "text-primary")}>
                  {format(day, "EEEE, MMM d")}
                  {today && <span className="ml-2 text-[11px] font-normal text-primary">Today</span>}
                </p>
                {cells.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {cells.map((c) => (
                      <SessionRow key={c.id} cell={c} date={day} onOpen={openSession} />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground/50">Rest day</p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-7 items-start gap-2">
          {weekDays.map((day) => {
            const cells = weekByDate[format(day, "yyyy-MM-dd")] ?? [];
            const today = isToday(day);
            return (
              <div key={day.toISOString()} className={cn("flex min-h-[150px] flex-col rounded-lg border bg-card p-2", today ? "border-primary" : "border-border")}>
                <div className="mb-2 text-center">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{format(day, "EEE")}</p>
                  <p className={cn("text-sm font-semibold", today && "text-primary")}>{format(day, "d")}</p>
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  {cells.length > 0 ? (
                    cells.map((c) => <WeekChip key={c.id} cell={c} date={day} onOpen={openSession} />)
                  ) : (
                    <div className="flex flex-1 items-center justify-center">
                      <span className="text-[11px] text-muted-foreground/50">Rest</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Read-only session-log viewer (reused from WorkoutsTab) — past sessions only. */}
      <SessionLogViewer
        module={logTarget?.module ?? null}
        day={logTarget?.day ?? null}
        open={Boolean(logTarget)}
        onOpenChange={(open) => !open && setLogTarget(null)}
      />
    </div>
  );
}

/** Enriched stacked row (mobile week + reuse). */
function SessionRow({ cell, date, onOpen }: { cell: SessionCell; date: Date; onOpen: (c: SessionCell, d: Date) => void }) {
  const status = deriveStatus(cell, date);
  const clickable = status !== "upcoming";
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => onOpen(cell, date)}
      className={cn(
        "flex w-full items-center gap-0 overflow-hidden rounded-lg border bg-card text-left transition-colors",
        clickable ? "hover:bg-muted/40" : "cursor-default",
      )}
      aria-label={clickable ? `View ${cell.title}` : cell.title}
    >
      <span className={cn("w-1 self-stretch shrink-0", RAIL[status])} aria-hidden />
      <span className="flex-1 px-4 py-3">
        <span className="flex items-baseline justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            {cell.isDeload && <Snowflake className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />}
            {cell.isDeload ? "Recovery" : cell.title}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">{format(date, "EEE d")}</span>
        </span>
        {cell.isDeload && <span className="block text-[11px] font-medium text-amber-600 dark:text-amber-400">Recovery week</span>}
        <span className="text-xs text-muted-foreground">{briefText(cell)}</span>
      </span>
      <span className={cn("mr-3 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium", PILL[status])}>{STATUS_LABEL[status]}</span>
    </button>
  );
}

/** Compact chip for the desktop 7-day week grid. */
function WeekChip({ cell, date, onOpen }: { cell: SessionCell; date: Date; onOpen: (c: SessionCell, d: Date) => void }) {
  const status = deriveStatus(cell, date);
  const clickable = status !== "upcoming";
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => onOpen(cell, date)}
      className={cn("w-full overflow-hidden rounded-md border text-left transition-opacity", clickable ? "hover:opacity-90" : "cursor-default")}
      aria-label={clickable ? `View ${cell.title}` : cell.title}
    >
      <span className="flex">
        <span className={cn("w-1 shrink-0", RAIL[status])} aria-hidden />
        <span className="flex-1 px-1.5 py-1">
          <span className="flex items-center gap-1 text-xs font-medium">
            {cell.isDeload && <Snowflake className="h-3 w-3 shrink-0 text-amber-500" aria-hidden />}
            {cell.done && <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" aria-hidden />}
            <span className="truncate">{cell.isDeload ? "Recovery" : cell.title}</span>
          </span>
          <span className="block font-mono text-[10px] text-muted-foreground">{cell.exerciseCount} ex</span>
          {cell.muscles.length > 0 && (
            <span className="block truncate text-[10px] text-muted-foreground">{cell.muscles.map(cap).join(", ")}</span>
          )}
        </span>
      </span>
    </button>
  );
}
