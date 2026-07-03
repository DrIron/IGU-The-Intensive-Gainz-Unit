import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthSession } from "@/hooks/useAuthSession";
import { supabase } from "@/integrations/supabase/client";
import { isBoardV2Enabled } from "@/lib/featureFlags";
import { TakeDeloadCard } from "@/components/workouts/TakeDeloadCard";
import { loadCanonicalSchedule, canonicalSessionTitle, type CanonicalSchedule } from "@/lib/canonicalScheduleAdapter";
import { ClientPageLayout } from "@/components/layouts/ClientPageLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { ChevronLeft, ChevronRight, CheckCircle2, MessageCircle, Dumbbell, Snowflake } from "lucide-react";
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
import { ExerciseHistoryPanel } from "@/components/workouts/ExerciseHistoryPanel";

const WEEK_OPTS = { weekStartsOn: 1 as const };

interface SessionModule {
  id: string;
  title: string | null;
  module_type: string;
  status: string;
  exerciseCount: number;
  muscles: string[];
  /** Deload v2 — this session belongs to a recovery/deload running week (canonical grid only). */
  isDeload?: boolean;
  /** Deload v2 — canonical session: open via assignment+session params instead of a legacy module id. */
  canonical?: { assignmentId: string; date: string };
}

function formatType(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type StatusKey = "done" | "due" | "upcoming" | "missed";
function statusFor(status: string, date: Date): { key: StatusKey; label: string } {
  if (status === "completed") return { key: "done", label: "Done" };
  const today = startOfDay(new Date());
  const d = startOfDay(date);
  if (d.getTime() === today.getTime()) return { key: "due", label: "Due today" };
  if (d.getTime() > today.getTime()) return { key: "upcoming", label: "Scheduled" };
  return { key: "missed", label: "Missed" };
}
const RAIL: Record<StatusKey, string> = { done: "bg-emerald-500", due: "bg-amber-500", upcoming: "bg-muted-foreground/40", missed: "bg-red-500/70" };
const DOT: Record<StatusKey, string> = { done: "bg-emerald-500", due: "bg-amber-500", upcoming: "bg-muted-foreground/40", missed: "bg-red-500/70" };
const PILL: Record<StatusKey, string> = {
  done: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  due: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  upcoming: "bg-muted text-muted-foreground",
  missed: "bg-red-500/10 text-red-600 dark:text-red-400",
};

function briefText(m: SessionModule) {
  const count = `${m.exerciseCount} exercise${m.exerciseCount === 1 ? "" : "s"}`;
  return m.muscles.length ? `${count} · ${m.muscles.map(cap).join(", ")}` : count;
}

/** One enriched session row (used in the "This week" list). */
function SessionBrief({ m, date, onOpen }: { m: SessionModule; date: Date; onOpen: (m: SessionModule) => void }) {
  const s = statusFor(m.status, date);
  return (
    <button
      type="button"
      onClick={() => onOpen(m)}
      className="flex w-full items-center gap-0 overflow-hidden rounded-lg border bg-card text-left transition-colors hover:bg-muted/40"
      aria-label={`Open ${m.title || formatType(m.module_type)}`}
    >
      <span className={cn("w-1 self-stretch shrink-0", RAIL[s.key])} aria-hidden />
      <span className="flex-1 px-4 py-3">
        <span className="flex items-baseline justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            {m.isDeload && <Snowflake className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />}
            {m.title || formatType(m.module_type)}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">{format(date, "EEE d")}</span>
        </span>
        {m.isDeload && <span className="block text-[11px] font-medium text-amber-600 dark:text-amber-400">Recovery week</span>}
        <span className="text-xs text-muted-foreground">{briefText(m)}</span>
      </span>
      <span className={cn("mr-3 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium", PILL[s.key])}>{s.label}</span>
    </button>
  );
}

/** Compact enriched chip used in the 7-day week grid. */
function WeekChip({ m, date, onOpen }: { m: SessionModule; date: Date; onOpen: (m: SessionModule) => void }) {
  const s = statusFor(m.status, date);
  return (
    <button
      type="button"
      onClick={() => onOpen(m)}
      className="w-full overflow-hidden rounded-md border text-left transition-opacity hover:opacity-90"
      aria-label={`Open ${m.title || formatType(m.module_type)}`}
    >
      <span className="flex">
        <span className={cn("w-1 shrink-0", RAIL[s.key])} aria-hidden />
        <span className="flex-1 px-1.5 py-1">
          <span className="flex items-center gap-1 text-xs font-medium">
            {m.isDeload && <Snowflake className="h-3 w-3 shrink-0 text-amber-500" aria-hidden />}
            {m.status === "completed" && <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" aria-hidden />}
            <span className="truncate">{m.isDeload ? "Recovery" : m.title || formatType(m.module_type)}</span>
          </span>
          <span className="block font-mono text-[10px] text-muted-foreground">{m.exerciseCount} ex</span>
          {m.muscles.length > 0 && <span className="block truncate text-[10px] text-muted-foreground">{m.muscles.map(cap).join(", ")}</span>}
        </span>
      </span>
    </button>
  );
}

function WorkoutsContent() {
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = searchParams.get("tab") === "history" ? "history" : "schedule";
  const [view, setView] = useState<"month" | "week">("month");
  const [anchor, setAnchor] = useState(new Date());

  useDocumentTitle({ title: "Workouts", description: "Your training schedule and history" });

  const setTab = (next: "schedule" | "history") => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  // The client's active canonical assignment powers "take a deload this week" (write,
  // board_v2-gated) AND the schedule grid, so an on-demand deload's insert+shift shows.
  const boardV2 = isBoardV2Enabled();
  const [canonical, setCanonical] = useState<{ id: string; planId: string | null; startDate: string | null } | null>(null);
  const canonicalFetchedRef = useRef(false);
  useEffect(() => {
    if (!user?.id || canonicalFetchedRef.current) return;
    canonicalFetchedRef.current = true;
    supabase
      .from("client_plan_assignment")
      .select("id, plan_id, start_date")
      .eq("client_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setCanonical(data ? { id: data.id, planId: data.plan_id ?? null, startDate: data.start_date ?? null } : null);
      });
  }, [user?.id]);

  // Load the canonical schedule (running sequence + inserts) once an assignment exists.
  // deloadNonce bumps after a take/remove so the grid reflects the shift live.
  const [schedule, setSchedule] = useState<CanonicalSchedule | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [deloadNonce, setDeloadNonce] = useState(0);
  useEffect(() => {
    if (!canonical?.id) {
      setSchedule(null);
      return;
    }
    let cancelled = false;
    setScheduleLoading(true);
    loadCanonicalSchedule(canonical.id)
      .then((s) => {
        if (!cancelled) setSchedule(s);
      })
      .finally(() => {
        if (!cancelled) setScheduleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canonical?.id, deloadNonce]);

  // Canonical date→sessions map (drives all grids). Null → graceful empty grid.
  const canonicalByDate = useMemo<Record<string, SessionModule[]> | null>(() => {
    if (!schedule || !canonical) return null;
    const map: Record<string, SessionModule[]> = {};
    for (const [iso, day] of schedule.byDate) {
      map[iso] = day.modules.map((m) => ({
        id: m.id,
        title: canonicalSessionTitle(m),
        module_type: m.module_type,
        status: m.status,
        exerciseCount: m.exerciseCount,
        muscles: m.muscles,
        isDeload: m.isDeload,
        canonical: { assignmentId: canonical.id, date: iso },
      }));
    }
    return map;
  }, [schedule, canonical]);

  const onOpen = (m: SessionModule) => {
    if (m.canonical) {
      navigate(
        `/client/workout/session/canonical?assignment=${m.canonical.assignmentId}&session=${m.id}&date=${m.canonical.date}`,
      );
    } else {
      navigate(`/client/workout/session/${m.id}`);
    }
  };

  // All grids read the canonical map. Null schedule → empty maps (graceful empty grid).
  const monthByDate = canonicalByDate ?? {};
  const displayedWeekByDate = canonicalByDate ?? {};
  const thisWeekByDate = canonicalByDate ?? {};

  const monthStart = startOfMonth(anchor);
  const weekStart = startOfWeek(anchor, WEEK_OPTS);
  const weekEnd = endOfWeek(anchor, WEEK_OPTS);
  const isCurrentMonth = isSameMonth(anchor, new Date());
  const isCurrentWeek = isSameWeek(anchor, new Date(), WEEK_OPTS);

  // Month grid days: full weeks covering the month (Mon-Sun rows).
  const gridStart = startOfWeek(monthStart, WEEK_OPTS);
  const gridEnd = endOfWeek(endOfMonth(anchor), WEEK_OPTS);
  const monthDays = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // "This week" list rows (current calendar week), sorted by date.
  const thisWeekStart = startOfWeek(new Date(), WEEK_OPTS);
  const thisWeekDays = eachDayOfInterval({ start: thisWeekStart, end: endOfWeek(new Date(), WEEK_OPTS) });
  const thisWeekList = thisWeekDays.flatMap((day) =>
    (thisWeekByDate[format(day, "yyyy-MM-dd")] ?? []).map((m) => ({ m, date: day })),
  );

  const goPrev = () => setAnchor((d) => (view === "month" ? subMonths(d, 1) : subWeeks(d, 1)));
  const goNext = () => setAnchor((d) => (view === "month" ? addMonths(d, 1) : addWeeks(d, 1)));
  const periodLabel = view === "month" ? format(anchor, "MMMM yyyy") : `${format(weekStart, "MMM d")} -- ${format(weekEnd, "MMM d")}`;
  const atCurrent = view === "month" ? isCurrentMonth : isCurrentWeek;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 pt-6 pb-24 md:pt-8 md:pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Dumbbell className="h-6 w-6 text-primary" aria-hidden />
            Workouts
          </h1>
          <p className="text-sm text-muted-foreground">Your training schedule and history.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/messages")} className="gap-1.5">
          <MessageCircle className="h-4 w-4" aria-hidden />
          Message coach
        </Button>
      </div>

      {/* Schedule / History tabs */}
      <div className="flex gap-5 border-b">
        <button
          type="button"
          onClick={() => setTab("schedule")}
          className={cn("-mb-px border-b-2 pb-2 text-sm font-medium", tab === "schedule" ? "border-primary text-foreground" : "border-transparent text-muted-foreground")}
        >
          Schedule
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          className={cn("-mb-px border-b-2 pb-2 text-sm font-medium", tab === "history" ? "border-primary text-foreground" : "border-transparent text-muted-foreground")}
        >
          History
        </button>
      </div>

      {tab === "history" ? (
        <ExerciseHistoryPanel />
      ) : (
        <div className="space-y-5">
          {boardV2 && canonical && (
            <TakeDeloadCard
              variant="client"
              assignmentId={canonical.id}
              planId={canonical.planId}
              startDate={canonical.startDate}
              clientId={user?.id ?? null}
              onChange={() => setDeloadNonce((n) => n + 1)}
            />
          )}
          {/* Week/Month toggle + period nav */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border bg-card p-1">
              {(["month", "week"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={cn("rounded-md px-3.5 py-1.5 text-sm font-medium capitalize transition-colors", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50")}
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" aria-label="Previous" onClick={goPrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[150px] text-center text-base font-semibold tabular-nums">{periodLabel}</span>
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

          {view === "month" ? (
            <>
              {scheduleLoading ? (
                <Skeleton className="h-72 w-full" />
              ) : (
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
                      const mods = monthByDate[format(day, "yyyy-MM-dd")] ?? [];
                      const inMonth = isSameMonth(day, anchor);
                      const today = isToday(day);
                      return (
                        <button
                          key={day.toISOString()}
                          type="button"
                          disabled={mods.length === 0}
                          onClick={() => {
                            setAnchor(day);
                            setView("week");
                          }}
                          className={cn(
                            "min-h-[58px] rounded-lg border p-1.5 text-center align-top transition-colors",
                            today ? "border-primary" : "border-border",
                            mods.length > 0 ? "hover:bg-muted/40 cursor-pointer" : "cursor-default",
                            !inMonth && "opacity-40",
                          )}
                        >
                          <div className={cn("font-mono text-xs", today && "text-primary font-semibold")}>{format(day, "d")}</div>
                          <div className="mt-1 flex flex-wrap justify-center gap-1">
                            {mods.map((m) => (
                              <span key={m.id} className={cn("h-1.5 w-1.5 rounded-full", DOT[statusFor(m.status, day).key])} aria-hidden />
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
                    <span><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" />Done</span>
                    <span><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" />Due</span>
                    <span><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/40 align-middle" />Scheduled</span>
                    <span><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-500/70 align-middle" />Missed</span>
                  </div>
                </div>
              )}

              {/* This week enriched list */}
              <div className="space-y-2">
                <h2 className="text-sm font-medium">This week</h2>
                {thisWeekList.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {thisWeekList.map(({ m, date }) => (
                      <SessionBrief key={m.id} m={m} date={date} onOpen={onOpen} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No sessions scheduled this week.</p>
                )}
              </div>
            </>
          ) : scheduleLoading ? (
            <div className={cn("grid gap-2", isMobile ? "grid-cols-1" : "grid-cols-7")}>
              {Array(isMobile ? 4 : 7)
                .fill(0)
                .map((_, i) => (
                  <Skeleton key={i} className={isMobile ? "h-20" : "h-40"} />
                ))}
            </div>
          ) : isMobile ? (
            <div className="space-y-3">
              {weekDays.map((day) => {
                const mods = displayedWeekByDate[format(day, "yyyy-MM-dd")] ?? [];
                const today = isToday(day);
                return (
                  <div key={day.toISOString()} className={cn("rounded-lg border bg-card p-3", today ? "border-primary" : "border-border")}>
                    <p className={cn("mb-2 text-sm font-semibold", today && "text-primary")}>
                      {format(day, "EEEE, MMM d")}
                      {today && <span className="ml-2 text-[11px] font-normal text-primary">Today</span>}
                    </p>
                    {mods.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {mods.map((m) => (
                          <SessionBrief key={m.id} m={m} date={day} onOpen={onOpen} />
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
                const mods = displayedWeekByDate[format(day, "yyyy-MM-dd")] ?? [];
                const today = isToday(day);
                return (
                  <div key={day.toISOString()} className={cn("flex min-h-[150px] flex-col rounded-lg border bg-card p-2", today ? "border-primary" : "border-border")}>
                    <div className="mb-2 text-center">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{format(day, "EEE")}</p>
                      <p className={cn("text-sm font-semibold", today && "text-primary")}>{format(day, "d")}</p>
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5">
                      {mods.length > 0 ? (
                        mods.map((m) => <WeekChip key={m.id} m={m} date={day} onOpen={onOpen} />)
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
        </div>
      )}
    </div>
  );
}

export default function WorkoutCalendar() {
  return (
    <ClientPageLayout>
      <WorkoutsContent />
    </ClientPageLayout>
  );
}
