import { useCallback, useEffect, useRef, useState } from "react";
import { format, formatDistanceToNowStrict, isFuture } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calendar as CalendarIcon,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { formatSnakeCase } from "@/lib/statusUtils";
import { DirectClientCalendar } from "@/components/coach/programs/DirectClientCalendar";
import type { ClientOverviewTabProps } from "../types";

interface DirectSession {
  id: string;
  title: string;
  session_type: string;
  session_timing: string;
  session_date: string;
  status: string;
  notes: string | null;
}

interface AddonLog {
  id: string;
  session_date: string;
  notes: string | null;
  addon_name: string | null;
}

/**
 * Sessions tab -- read-only digest of what this client has booked and
 * consumed outside their recurring program.
 *
 *  - Upcoming + recent "direct calendar" sessions from
 *    `direct_calendar_sessions` (ad-hoc workouts a coach scheduled on a
 *    specific date).
 *  - Addon session logs joined via `addon_purchases -> addon_services` so
 *    the coach sees a booking's service name, not a bare purchase id.
 *
 * Primary coach or admin also gets a collapsible `DirectClientCalendar`
 * below the lists so they can schedule / edit sessions without leaving
 * the tab. Other viewers see the read-only digest only.
 */
export function SessionsTab({ context }: ClientOverviewTabProps) {
  const { clientUserId, subscription, viewerRole, profile } = context;
  const [direct, setDirect] = useState<DirectSession[]>([]);
  const [addons, setAddons] = useState<AddonLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async (userId: string) => {
    setLoading(true);

    const [authRes, directRes, purchasesRes, subRes] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("direct_calendar_sessions")
        .select(
          "id, title, session_type, session_timing, session_date, status, notes",
        )
        .eq("client_user_id", userId)
        .order("session_date", { ascending: false })
        .limit(30),
      supabase
        .from("addon_purchases")
        .select("id, addon_service_id")
        .eq("client_id", userId),
      subscription?.id
        ? supabase
            .from("subscriptions")
            .select("coach_id")
            .eq("id", subscription.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } as { data: { coach_id: string | null } | null; error: null }),
    ]);

    setViewerId(authRes.data?.user?.id ?? null);
    setCoachId(subRes.data?.coach_id ?? null);

    if (directRes.error) {
      console.warn("[SessionsTab] direct sessions:", directRes.error.message);
    }
    setDirect((directRes.data ?? []) as DirectSession[]);

    if (purchasesRes.error) {
      console.warn("[SessionsTab] addon purchases:", purchasesRes.error.message);
    }
    const purchases = purchasesRes.data ?? [];
    const purchaseIds = purchases.map((p) => p.id);

    if (purchaseIds.length === 0) {
      setAddons([]);
      setLoading(false);
      return;
    }

    // Name lookup: resolve addon_service_id -> name once, then decorate logs.
    // CLAUDE.md rule: no nested FK joins on anything fragile -- do it in JS.
    const addonServiceIds = [
      ...new Set(purchases.map((p) => p.addon_service_id)),
    ];
    const [logsRes, servicesRes] = await Promise.all([
      supabase
        .from("addon_session_logs")
        .select("id, addon_purchase_id, session_date, notes")
        .in("addon_purchase_id", purchaseIds)
        .order("session_date", { ascending: false })
        .limit(20),
      supabase
        .from("addon_services")
        .select("id, name")
        .in("id", addonServiceIds),
    ]);

    if (logsRes.error) console.warn("[SessionsTab] addon logs:", logsRes.error.message);
    if (servicesRes.error) {
      console.warn("[SessionsTab] addon services:", servicesRes.error.message);
    }

    const purchaseToService = new Map<string, string>();
    for (const p of purchases) {
      purchaseToService.set(p.id, p.addon_service_id);
    }
    const serviceName = new Map<string, string>();
    for (const s of servicesRes.data ?? []) {
      serviceName.set(s.id, s.name);
    }

    setAddons(
      (logsRes.data ?? []).map((log) => ({
        id: log.id,
        session_date: log.session_date,
        notes: log.notes,
        addon_name:
          serviceName.get(purchaseToService.get(log.addon_purchase_id) ?? "") ??
          null,
      })),
    );
    setLoading(false);
  }, [subscription?.id]);

  useEffect(() => {
    const key = `${clientUserId}:${subscription?.id ?? "none"}`;
    if (hasFetched.current === key) return;
    hasFetched.current = key;
    load(clientUserId).catch((err) => {
      console.error("[SessionsTab] unexpected:", err);
      setLoading(false);
    });
  }, [clientUserId, subscription?.id, load]);

  const isPrimaryCoach = Boolean(viewerId && coachId && viewerId === coachId);
  const isAdmin = viewerRole === "admin";
  const canManageCalendar =
    (isPrimaryCoach || isAdmin) && subscription?.id && viewerId;
  const clientName =
    profile.firstName?.trim() ||
    profile.displayName?.trim() ||
    "this client";

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2
            className="h-5 w-5 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        </CardContent>
      </Card>
    );
  }

  const upcoming = direct.filter((s) => {
    if (s.status === "cancelled") return false;
    try {
      return isFuture(new Date(s.session_date));
    } catch {
      return false;
    }
  });
  const past = direct.filter((s) => !upcoming.includes(s));

  const empty = direct.length === 0 && addons.length === 0;

  return (
    <div className="space-y-6">
      {canManageCalendar && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCalendarOpen((v) => !v)}
            aria-expanded={calendarOpen}
          >
            <CalendarIcon className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
            {calendarOpen ? "Hide calendar" : "Open calendar"}
            {calendarOpen ? (
              <ChevronUp className="h-3.5 w-3.5 ml-1" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 ml-1" aria-hidden="true" />
            )}
          </Button>
        </div>
      )}

      {empty ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <div className="flex justify-center">
              <div className="p-3 rounded-full bg-muted">
                <CalendarClock
                  className="h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
            </div>
            <div className="space-y-1">
              <p className="font-medium">No ad-hoc sessions yet</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Direct calendar sessions a coach schedules outside the recurring
                program, and addon bookings, will appear here once any are
                logged.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {upcoming.length > 0 && (
            <SessionListCard
              icon={<CalendarIcon className="h-4 w-4" aria-hidden="true" />}
              title="Upcoming"
              emphasis
            >
              {upcoming.map((s) => (
                <SessionRow key={s.id} session={s} emphasis />
              ))}
            </SessionListCard>
          )}

          {past.length > 0 && (
            <SessionListCard
              icon={<Clock className="h-4 w-4" aria-hidden="true" />}
              title="Recent sessions"
              subtitle={`Last ${Math.min(past.length, 30)} direct calendar sessions`}
            >
              {past.map((s) => (
                <SessionRow key={s.id} session={s} />
              ))}
            </SessionListCard>
          )}

          {addons.length > 0 && (
            <SessionListCard
              icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
              title="Addon bookings"
              subtitle="Recent addon session logs"
            >
              {addons.map((a) => (
                <AddonRow key={a.id} log={a} />
              ))}
            </SessionListCard>
          )}
        </>
      )}

      {canManageCalendar && calendarOpen && viewerId && subscription?.id && (
        <DirectClientCalendar
          clientUserId={clientUserId}
          coachUserId={viewerId}
          subscriptionId={subscription.id}
          clientName={clientName}
        />
      )}
    </div>
  );
}

function SessionListCard({
  icon,
  title,
  subtitle,
  emphasis,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  emphasis?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex">
          <div
            aria-hidden="true"
            className={cn(
              "w-1 shrink-0",
              emphasis ? "bg-emerald-500" : "bg-muted",
            )}
          />
          <div className="flex-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base md:text-lg flex items-center gap-2">
                <span className="text-muted-foreground">{icon}</span>
                {title}
              </CardTitle>
              {subtitle && (
                <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  {subtitle}
                </p>
              )}
            </CardHeader>
            <div className="divide-y">{children}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SessionRow({
  session,
  emphasis,
}: {
  session: DirectSession;
  emphasis?: boolean;
}) {
  const when = safeFormat(session.session_date, "EEE, MMM d");
  const distance = safeRelative(session.session_date);

  return (
    <div className="px-4 md:px-6 py-3 flex items-start gap-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium truncate">{session.title}</p>
          <StatusBadge status={session.status} />
        </div>
        <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {when}
          {distance && ` | ${distance}`}
          {` | ${formatSnakeCase(session.session_timing)}`}
          {` | ${formatSnakeCase(session.session_type)}`}
        </p>
        {session.notes && (
          <p className="text-xs text-muted-foreground truncate">
            {session.notes}
          </p>
        )}
      </div>
      {emphasis && (
        <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400 pt-0.5">
          Upcoming
        </span>
      )}
    </div>
  );
}

function AddonRow({ log }: { log: AddonLog }) {
  const when = safeFormat(log.session_date, "EEE, MMM d yyyy");
  return (
    <div className="px-4 md:px-6 py-3 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium truncate">
          {log.addon_name ?? "Addon session"}
        </p>
      </div>
      <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
        {when}
      </p>
      {log.notes && (
        <p className="text-xs text-muted-foreground truncate">{log.notes}</p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "scheduled"
      ? "default"
      : status === "completed"
        ? "secondary"
        : status === "cancelled"
          ? "destructive"
          : "outline";
  return (
    <Badge variant={variant} className="text-[10px] uppercase tracking-wide">
      {formatSnakeCase(status)}
    </Badge>
  );
}

function safeFormat(iso: string, pattern: string): string {
  try {
    return format(new Date(iso), pattern);
  } catch {
    return iso;
  }
}

function safeRelative(iso: string): string | null {
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
  } catch {
    return null;
  }
}
