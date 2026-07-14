import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadError } from "@/components/ui/load-error";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/errorLogging";
import { KUWAIT_UTC_OFFSET_HOURS } from "@/lib/kuwaitTime";
import { SESSION_TIMINGS, SESSION_TYPES } from "@/types/workout-builder";
import { CalendarDays, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";

/**
 * BUG13 — coach-created sessions were invisible to the client.
 *
 * A coach schedules ad-hoc sessions on a client's calendar (`direct_calendar_sessions`, via
 * DirectClientCalendar). The coach sees them; the client's /sessions page read ONLY
 * `session_bookings` — the client-initiated booking flow — so the coach's sessions never
 * rendered anywhere the client could see them. RLS had always permitted the read
 * (`client_user_id = auth.uid()`); nobody had ever asked for the rows.
 *
 * These are READ-ONLY here, and not merely by omission of buttons: the RLS UPDATE and DELETE
 * policies on this table are `coach_user_id = auth.uid() OR is_admin(...)`, so a client
 * cannot mutate one even if they tried. The client's own bookings stay cancellable in the
 * booking card above; these do not.
 */

interface DirectSession {
  id: string;
  title: string;
  session_type: string;
  session_timing: string;
  session_date: string; // DATE — no clock time
  status: string;
  notes: string | null;
}

const TYPE_LABEL = new Map(SESSION_TYPES.map((t) => [t.value as string, t.label]));
const TIMING_LABEL = new Map(SESSION_TIMINGS.map((t) => [t.value as string, t.label]));

/**
 * Today's calendar date in Kuwait, as `YYYY-MM-DD`.
 *
 * `session_date` is a bare DATE, so the upcoming/past split is a calendar-day question, not
 * an instant one. Comparing it against the browser's local midnight would put a session on
 * the wrong side of the line for any client travelling — and IGU's day boundary is Kuwait's,
 * not the device's. String compare is exact for ISO dates.
 */
function kuwaitToday(now: Date): string {
  return new Date(now.getTime() + KUWAIT_UTC_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10);
}

export function CoachScheduledSessions({ clientUserId }: { clientUserId: string }) {
  const [sessions, setSessions] = useState<DirectSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const { data, error } = await supabase
        .from("direct_calendar_sessions")
        .select("id, title, session_type, session_timing, session_date, status, notes")
        .eq("client_user_id", clientUserId)
        .order("session_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      setSessions((data ?? []) as DirectSession[]);
    } catch (e: unknown) {
      // A failed read is NOT "your coach hasn't scheduled anything" — that's the CC10 lie.
      captureException(e, { source: "CoachScheduledSessions" });
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [clientUserId]);

  useEffect(() => {
    if (!clientUserId || hasFetched.current === clientUserId) return;
    hasFetched.current = clientUserId;
    load();
  }, [clientUserId, load]);

  if (loading) {
    return (
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="animate-pulse space-y-3">
            <div className="h-5 w-48 rounded bg-muted" />
            <div className="h-16 w-full rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <div className="mb-6">
        <LoadError message="We couldn't load the sessions your coach scheduled." onRetry={load} />
      </div>
    );
  }

  // Genuinely nothing scheduled: say nothing rather than add an empty card to a page that
  // already has its own booking section.
  if (sessions.length === 0) return null;

  const today = kuwaitToday(new Date());
  const upcoming = sessions.filter((s) => s.session_date >= today).reverse(); // soonest first
  const past = sessions.filter((s) => s.session_date < today); // already newest-first

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
          Scheduled by Your Coach
        </CardTitle>
        <CardDescription>
          Your coach added these to your calendar. To change one, message your coach.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {upcoming.length > 0 && (
          <SessionGroup heading="Upcoming" sessions={upcoming} />
        )}
        {past.length > 0 && <SessionGroup heading="Past" sessions={past} muted />}
      </CardContent>
    </Card>
  );
}

function SessionGroup({
  heading,
  sessions,
  muted = false,
}: {
  heading: string;
  sessions: DirectSession[];
  muted?: boolean;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">{heading}</h3>
      <ul className="space-y-3">
        {sessions.map((s) => (
          <li
            key={s.id}
            data-session-row={s.id}
            className={`rounded-lg border bg-card p-4 ${muted ? "opacity-70" : ""}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{s.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    {format(parseISO(s.session_date), "EEE, MMM d, yyyy")}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    {TIMING_LABEL.get(s.session_timing) ?? s.session_timing}
                  </span>
                </p>
                {s.notes && <p className="mt-2 text-sm text-muted-foreground">{s.notes}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline">{TYPE_LABEL.get(s.session_type) ?? s.session_type}</Badge>
                {s.status === "completed" && <Badge variant="secondary">Completed</Badge>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
