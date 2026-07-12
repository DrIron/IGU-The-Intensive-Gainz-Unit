import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { format, formatDistanceToNowStrict, isFuture } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Calendar as CalendarIcon,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Clock,
  ClipboardCheck,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LoadError } from "@/components/ui/load-error";
import { TabShellSkeleton } from "@/components/ui/loading-skeleton";
import { cn } from "@/lib/utils";
import { formatSnakeCase } from "@/lib/statusUtils";
import { DirectClientCalendar } from "@/components/coach/programs/DirectClientCalendar";
import { LogAddonSessionDialog } from "@/components/client-overview/addons/LogAddonSessionDialog";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useSubrolePermissions } from "@/hooks/useSubrolePermissions";
import { useUnusedAddons, type UnusedAddonRow } from "@/hooks/useUnusedAddons";
import { useAddonSessionLogs } from "@/hooks/useAddonSessionLogs";
import { useSubroleDefinitions } from "@/hooks/useSubroleDefinitions";
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

/**
 * Sessions tab -- three sections:
 *
 *  1. Direct calendar sessions (ad-hoc workouts a coach scheduled on a
 *     specific date)
 *  2. Available add-on packs -- active purchases with sessions left to log
 *     (Phase 4). Per-row "Log session" button; admins always enabled;
 *     eligible-subrole care-team members enabled; wrong-subrole disabled
 *     with tooltip; client viewers don't see the button at all.
 *  3. Past add-on session logs -- read-only digest.
 *
 * Primary coach or admin also gets a collapsible `DirectClientCalendar`
 * below the lists so they can schedule / edit sessions without leaving
 * the tab.
 */
export function SessionsTab({ context }: ClientOverviewTabProps) {
  const { clientUserId, subscription, viewerRole, profile } = context;
  const { t } = useTranslation("addons");
  const { user } = useAuthSession();
  const viewerId = user?.id ?? null;
  const { approvedSlugs, isLoading: subrolesLoading } = useSubrolePermissions(viewerId ?? undefined);
  const subroleDefs = useSubroleDefinitions();

  const [direct, setDirect] = useState<DirectSession[]>([]);
  const [directLoading, setDirectLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [logTarget, setLogTarget] = useState<UnusedAddonRow | null>(null);
  const hasFetched = useRef<string | null>(null);

  const unusedAddons = useUnusedAddons(clientUserId);
  const pastLogs = useAddonSessionLogs(clientUserId);

  const load = useCallback(async (userId: string) => {
    setDirectLoading(true);
    const [directRes, subRes] = await Promise.all([
      supabase
        .from("direct_calendar_sessions")
        .select(
          "id, title, session_type, session_timing, session_date, status, notes",
        )
        .eq("client_user_id", userId)
        .order("session_date", { ascending: false })
        .limit(30),
      subscription?.id
        ? supabase
            .from("subscriptions")
            .select("coach_id")
            .eq("id", subscription.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } as { data: { coach_id: string | null } | null; error: null }),
    ]);

    setCoachId(subRes.data?.coach_id ?? null);
    if (directRes.error) {
      console.warn("[SessionsTab] direct sessions:", directRes.error.message);
    }
    setDirect((directRes.data ?? []) as DirectSession[]);
    setDirectLoading(false);
  }, [subscription?.id]);

  useEffect(() => {
    const key = `${clientUserId}:${subscription?.id ?? "none"}`;
    if (hasFetched.current === key) return;
    hasFetched.current = key;
    load(clientUserId).catch((err) => {
      // CC10: was swallowed -> the tab rendered "no sessions" on a failed fetch.
      console.error("[SessionsTab] unexpected:", err);
      setLoadError(err instanceof Error ? err : new Error(String(err)));
      setDirectLoading(false);
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

  // Is the viewer a professional who can ever log addons? Client viewers
  // (not staff) never see the Log button at all; the button only appears
  // for admins and care-team staff.
  const viewerIsStaff = isAdmin || viewerRole === "coach" || viewerRole === "dietitian";

  const onLogged = useCallback(() => {
    unusedAddons.refetch();
    pastLogs.refetch();
  }, [unusedAddons, pastLogs]);

  if (directLoading) {
    return <TabShellSkeleton cards={2} />;
  }

  if (loadError) {
    return (
      <LoadError
        message="We couldn't load this client's sessions. Check your connection and try again."
        onRetry={() => {
          setLoadError(null);
          setDirectLoading(true);
          hasFetched.current = null;
          void load(clientUserId);
        }}
      />
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

  const availablePacks = unusedAddons.rows;
  const pastAddonLogs = pastLogs.data ?? [];
  const empty =
    direct.length === 0 && availablePacks.length === 0 && pastAddonLogs.length === 0;

  return (
    <TooltipProvider delayDuration={150}>
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
                <div className="inline-flex items-center justify-center p-3 rounded-full bg-muted">
                  <CalendarClock
                    className="h-5 w-5 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <p className="font-medium">No booked sessions yet</p>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Direct calendar sessions a coach schedules outside the recurring
                  program, and add-on bookings, will appear here once any are
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

            {availablePacks.length > 0 && (
              <SessionListCard
                icon={<ClipboardCheck className="h-4 w-4" aria-hidden="true" />}
                title={t("availablePacksTitle")}
                subtitle={t("availablePacksSubtitle")}
              >
                {availablePacks.map((pack) => (
                  <AvailablePackRow
                    key={pack.purchase_id}
                    pack={pack}
                    isAdmin={isAdmin}
                    viewerIsStaff={viewerIsStaff}
                    approvedSlugs={approvedSlugs}
                    subrolesLoading={subrolesLoading}
                    subroleLabels={subroleDefs.data}
                    onLog={() => setLogTarget(pack)}
                  />
                ))}
              </SessionListCard>
            )}

            {pastAddonLogs.length > 0 && (
              <SessionListCard
                icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
                title={t("pastSessionsTitle")}
                subtitle={t("pastSessionsSubtitle")}
              >
                {pastAddonLogs.map((log) => (
                  <AddonLogRow key={log.id} log={log} />
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

        <LogAddonSessionDialog
          purchase={logTarget}
          open={!!logTarget}
          onOpenChange={(open) => { if (!open) setLogTarget(null); }}
          onLogged={onLogged}
        />
      </div>
    </TooltipProvider>
  );
}

function AvailablePackRow({
  pack,
  isAdmin,
  viewerIsStaff,
  approvedSlugs,
  subrolesLoading,
  subroleLabels,
  onLog,
}: {
  pack: UnusedAddonRow;
  isAdmin: boolean;
  viewerIsStaff: boolean;
  approvedSlugs: readonly string[];
  subrolesLoading: boolean;
  subroleLabels: Map<string, string> | undefined;
  onLog: () => void;
}) {
  const { t } = useTranslation("addons");
  const expiresLabel = safeFormat(pack.expires_at, "MMM d, yyyy");
  const requiredSubroleLabel =
    subroleLabels?.get(pack.required_subrole ?? "") ?? pack.required_subrole ?? "";

  // Eligibility: admin always wins; otherwise strict-match against the
  // viewer's approved subroles (matches is_addon_eligible_professional RPC).
  const eligible =
    isAdmin
    || (pack.required_subrole !== null && approvedSlugs.includes(pack.required_subrole));

  return (
    <div className="px-4 md:px-6 py-3 flex items-center gap-3">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium truncate">{pack.service_name}</p>
        <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {t("packRemaining", {
            remaining: pack.sessions_remaining,
            total: pack.sessions_total,
          })}
          {" | "}
          {t("packExpiresIn", { date: expiresLabel })}
        </p>
      </div>

      {viewerIsStaff && (
        eligible ? (
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={onLog}
            disabled={subrolesLoading}
          >
            {t("logSessionCta")}
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Wrapper span so the tooltip still fires on a disabled button */}
              <span tabIndex={0}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled
                  aria-disabled
                >
                  {t("logSessionCta")}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {t("logSessionDisabledTooltip", { role: requiredSubroleLabel })}
            </TooltipContent>
          </Tooltip>
        )
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

function AddonLogRow({ log }: { log: { id: string; session_date: string; notes: string | null; addon_name: string | null } }) {
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
