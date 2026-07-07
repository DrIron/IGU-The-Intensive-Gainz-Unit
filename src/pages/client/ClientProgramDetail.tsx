import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthSession } from "@/hooks/useAuthSession";
import { supabase } from "@/integrations/supabase/client";
import { ClientPageLayout } from "@/components/layouts/ClientPageLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  resolveActiveAssignment,
  loadCanonicalSchedule,
  canonicalSessionTitle,
  type CanonicalSchedule,
  type CanonicalScheduleModule,
} from "@/lib/canonicalScheduleAdapter";
import { boardDayDate } from "@/lib/boardDates";
import { ArrowLeft, CalendarDays, ChevronRight, Dumbbell, Snowflake } from "lucide-react";
import { differenceInDays, format, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";

interface ProgramAssignment {
  id: string;
  planId: string | null;
  startDate: string | null;
}

// ── status helpers (mirror WorkoutCalendar's SessionBrief vocabulary) ──────────
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
const PILL: Record<StatusKey, string> = {
  done: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  due: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  upcoming: "bg-muted text-muted-foreground",
  missed: "bg-red-500/10 text-red-600 dark:text-red-400",
};

function formatType(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function briefText(m: CanonicalScheduleModule) {
  const count = `${m.exerciseCount} exercise${m.exerciseCount === 1 ? "" : "s"}`;
  const muscles = m.muscles.slice(0, 4);
  return muscles.length ? `${count} · ${muscles.map(cap).join(", ")}` : count;
}

/** One session card: title / type / brief + status pill + Start/Review. Whole card starts the session. */
function ProgramSessionCard({ m, date, onStart }: { m: CanonicalScheduleModule; date: Date; onStart: () => void }) {
  const s = statusFor(m.status, date);
  const action = s.key === "done" ? "Review" : "Start";
  return (
    <button
      type="button"
      onClick={onStart}
      className="flex w-full items-center gap-0 overflow-hidden rounded-lg border bg-card text-left transition-colors hover:bg-muted/40"
      aria-label={`${action} ${canonicalSessionTitle(m) || formatType(m.module_type)}`}
    >
      <span className={cn("w-1 self-stretch shrink-0", RAIL[s.key])} aria-hidden />
      <span className="min-w-0 flex-1 px-4 py-3">
        <span className="flex items-baseline justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            {m.isDeload && <Snowflake className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />}
            {canonicalSessionTitle(m) || formatType(m.module_type)}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">{format(date, "EEE")}</span>
        </span>
        <span className="block truncate text-xs text-muted-foreground">{briefText(m)}</span>
      </span>
      <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium", PILL[s.key])}>{s.label}</span>
      <span className="ml-2 mr-3 flex shrink-0 items-center gap-0.5 text-xs font-medium text-primary">
        {action}
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </span>
    </button>
  );
}

function RestRow({ date }: { date: Date }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-dashed bg-muted/20 px-4 py-2 text-xs text-muted-foreground/70">
      <span>Rest</span>
      <span className="font-mono">{format(date, "EEE")}</span>
    </div>
  );
}

/**
 * CT2 — read-only client program overview. Distinct from the calendar's
 * "what day is it?" view, this is the "what's my whole program?" structure:
 * plan name + progress → week-by-week list of sessions → tap-to-start. Canonical
 * reads only (resolveActiveAssignment + loadCanonicalSchedule). No schema change.
 */
function ProgramDetailContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isLoading: sessionLoading } = useAuthSession();
  const assignmentParam = searchParams.get("assignment");

  const [assignment, setAssignment] = useState<ProgramAssignment | null>(null);
  const [planName, setPlanName] = useState<string>("Your program");
  const [schedule, setSchedule] = useState<CanonicalSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef<string | null>(null);

  useDocumentTitle({ title: "Program", description: "Your full training program" });

  const load = useCallback(async (userId: string, param: string | null) => {
    setLoading(true);
    try {
      let resolved: ProgramAssignment | null = null;
      if (param) {
        // Explicit assignment (client's own — RLS scopes it).
        const { data } = await supabase
          .from("client_plan_assignment")
          .select("id, plan_id, start_date")
          .eq("id", param)
          .eq("client_id", userId)
          .maybeSingle();
        resolved = data?.id ? { id: data.id, planId: data.plan_id ?? null, startDate: data.start_date ?? null } : null;
      } else {
        const active = await resolveActiveAssignment(userId);
        resolved = active ? { id: active.id, planId: active.plan_id, startDate: active.start_date } : null;
      }

      setAssignment(resolved);
      if (!resolved) {
        setSchedule(null);
        return;
      }

      const [sched, planRow] = await Promise.all([
        loadCanonicalSchedule(resolved.id),
        resolved.planId
          ? supabase.from("plan").select("name").eq("id", resolved.planId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setSchedule(sched);
      setPlanName((planRow as { data: { name?: string } | null }).data?.name ?? "Your program");
    } catch (err) {
      console.error("[ClientProgramDetail] load:", err);
      setAssignment(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const key = `${user?.id ?? (sessionLoading ? "__wait__" : "__anon__")}:${assignmentParam ?? ""}`;
    if (hasFetched.current === key) return;
    hasFetched.current = key;
    if (sessionLoading) return;
    if (!user?.id) {
      setLoading(false);
      return;
    }
    load(user.id, assignmentParam);
  }, [user?.id, sessionLoading, assignmentParam, load]);

  const openSession = (m: CanonicalScheduleModule, iso: string) => {
    if (!assignment) return;
    navigate(`/client/workout/session/canonical?assignment=${assignment.id}&session=${m.id}&date=${iso}`);
  };

  const Header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-2">
        <Button variant="ghost" size="icon" aria-label="Back" onClick={() => navigate(-1)} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Dumbbell className="h-6 w-6 text-primary" aria-hidden />
            {planName}
          </h1>
          <p className="text-sm text-muted-foreground">Your full training program.</p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={() => navigate("/client/workout/calendar")} className="gap-1.5">
        <CalendarDays className="h-4 w-4" aria-hidden />
        Calendar
      </Button>
    </div>
  );

  if (loading) {
    return (
      <div className="container mx-auto max-w-4xl space-y-6 px-4 pt-6 pb-24 md:pt-8 md:pb-12">
        {Header}
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!assignment || !schedule) {
    return (
      <div className="container mx-auto max-w-4xl space-y-6 px-4 pt-6 pb-24 md:pt-8 md:pb-12">
        {Header}
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <Dumbbell className="mx-auto mb-2 h-6 w-6 opacity-50" aria-hidden />
            Your coach hasn't assigned a program yet. It'll show up here once they do.
          </CardContent>
        </Card>
      </div>
    );
  }

  // Overview stats.
  const totalWeeks = schedule.totalWeeks;
  const currentWeek = Math.min(
    Math.max(totalWeeks, 1),
    Math.max(1, Math.floor(differenceInDays(new Date(), new Date(schedule.startDate)) / 7) + 1),
  );
  const allModules = [...schedule.byDate.values()].flatMap((d) => d.modules);
  const totalSessions = allModules.length;
  const completedSessions = allModules.filter((m) => m.status === "completed").length;

  return (
    <div className="container mx-auto max-w-4xl space-y-6 px-4 pt-6 pb-24 md:pt-8 md:pb-12">
      {Header}

      {/* Overview */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Progress</p>
            <p className="text-lg font-semibold">
              Week {currentWeek} of {totalWeeks}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Sessions</p>
            <p className="text-lg font-semibold tabular-nums">
              {completedSessions} <span className="text-sm font-normal text-muted-foreground">of {totalSessions} done</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Week sections */}
      <div className="space-y-5">
        {schedule.weeks.map((week) => {
          const isCurrent = week.runningIndex === currentWeek;
          const days = Array.from({ length: 7 }, (_, i) => {
            const utc = boardDayDate(schedule.startDate, week.runningIndex, i + 1);
            const iso = utc.toISOString().slice(0, 10);
            return { iso, date: new Date(`${iso}T00:00:00`), mods: schedule.byDate.get(iso)?.modules ?? [] };
          });
          return (
            <section key={week.runningIndex} className="flex gap-3">
              <div aria-hidden className={cn("w-1 shrink-0 rounded-full", isCurrent ? "bg-emerald-500" : "bg-transparent")} />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <h2 className={cn("text-sm font-semibold", isCurrent && "text-emerald-600 dark:text-emerald-400")}>
                    Week {week.runningIndex}
                  </h2>
                  {isCurrent && (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      This week
                    </span>
                  )}
                  {week.isDeload && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      <Snowflake className="h-3 w-3" aria-hidden />
                      Recovery
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {days.map(({ iso, date, mods }) =>
                    mods.length > 0 ? (
                      mods.map((m) => (
                        <ProgramSessionCard key={m.id} m={m} date={date} onStart={() => openSession(m, iso)} />
                      ))
                    ) : (
                      <RestRow key={iso} date={date} />
                    ),
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default function ClientProgramDetail() {
  return (
    <ClientPageLayout>
      <ProgramDetailContent />
    </ClientPageLayout>
  );
}
