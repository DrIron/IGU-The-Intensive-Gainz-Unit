import { useState, useEffect, useCallback, useRef, memo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClickableCard } from "@/components/ui/clickable-card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Bell,
  ChevronRight,
  Activity,
  Scale,
  AlertTriangle,
  ClipboardList,
  ArrowRight,
  Salad,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DRIFT_DAYS_THRESHOLD } from "@/pages/coach/DietitianMyClientsPage";

interface DietitianDashboardOverviewProps {
  userId: string;
  onNavigate?: (section: string, filter?: string) => void;
}

interface RecentWeighIn {
  clientId: string;
  displayName: string;
  logDate: string;
  weightKg: number;
}

interface DietitianMetrics {
  rosterSize: number;
  /**
   * Distinct roster clients with at least one is_active=true phase. This is a
   * POPULATION metric ("how many of my clients are on an active phase") -- it
   * is intentionally NOT the roster's green/"active" section count, which is
   * a health subset (active phase AND recent weigh-in AND no pending work).
   */
  activePhases: number;
  /** Distinct roster clients with >=1 pending adjustment on their active phase. */
  clientsWithPendingAdjustments: number;
  /**
   * Roster clients whose last weigh-in is >DRIFT_DAYS_THRESHOLD days old.
   * Excludes never-logged clients -- a client who never weighed in isn't
   * "drifting", they're awaiting a first weigh-in. This matches the roster's
   * `sectionFor()` which routes null-weigh-in clients to `action_needed`, so
   * this count == the roster's drifting-section count exactly.
   */
  driftingCount: number;
  /** Roster clients with no is_active phase. */
  noPhaseCount: number;
  recentWeighIns: RecentWeighIn[];
}

const EMPTY_METRICS: DietitianMetrics = {
  rosterSize: 0,
  activePhases: 0,
  clientsWithPendingAdjustments: 0,
  driftingCount: 0,
  noPhaseCount: 0,
  recentWeighIns: [],
};

/**
 * Dietitian-scoped variant of the /coach overview slot. Mirrors
 * CoachDashboardOverview's structure (needs-attention banner, 3-stat row,
 * two-column tasks + feed) but every metric is keyed off the viewer's
 * active `care_team_assignments` (specialty='dietitian'), not
 * `subscriptions.coach_id`.
 *
 * Rendered by CoachDashboardLayout's "overview" case when the viewer is a
 * pure dietitian (`isDietitian && !approvedSlugs.includes("coach")`).
 * Dual-credentialed coach+dietitian users stay on CoachDashboardOverview --
 * its signals are a superset for them.
 *
 * Data fetch mirrors DietitianMyClientsPage.tsx: one care_team_assignments
 * query for the roster, then parallel lookups. No nested PostgREST FK joins
 * on profiles_public (see CLAUDE.md).
 */
export default function DietitianDashboardOverview({
  userId,
  onNavigate,
}: DietitianDashboardOverviewProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<DietitianMetrics>(EMPTY_METRICS);
  const hasFetched = useRef(false);

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);

      // 1) Active dietitian assignments -> roster. Filters on `status='active'`
      //    to match the `is_dietitian_for_client` RLS helper (see
      //    DietitianMyClientsPage.tsx for the column-ambiguity note).
      const { data: assignments, error: assignmentsError } = await supabase
        .from("care_team_assignments")
        .select("client_id")
        .eq("staff_user_id", userId)
        .eq("specialty", "dietitian")
        .eq("status", "active");

      if (assignmentsError) throw assignmentsError;

      const clientIds = Array.from(
        new Set((assignments ?? []).map((a) => a.client_id as string)),
      );

      if (clientIds.length === 0) {
        setMetrics(EMPTY_METRICS);
        return;
      }

      // 2) Three parallel roster lookups. Separate queries -- nested FK joins
      //    on profiles_public are unreliable per CLAUDE.md.
      const [profilesRes, phasesRes, weightLogsRes] = await Promise.all([
        supabase
          .from("profiles_public")
          .select("id, first_name, display_name")
          .in("id", clientIds),
        supabase
          .from("nutrition_phases")
          .select("id, user_id, is_active, start_date")
          .in("user_id", clientIds)
          .order("start_date", { ascending: false }),
        supabase
          .from("weight_logs")
          .select("user_id, log_date, weight_kg")
          .in("user_id", clientIds)
          .order("log_date", { ascending: false }),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (phasesRes.error) throw phasesRes.error;
      if (weightLogsRes.error) throw weightLogsRes.error;

      const displayNameById = new Map<string, string>();
      for (const p of profilesRes.data ?? []) {
        displayNameById.set(
          p.id as string,
          (p.display_name as string) || (p.first_name as string) || "Client",
        );
      }

      // First is_active phase per client (phases ordered start_date DESC) --
      // same selection rule as the roster page.
      const activePhaseByClient = new Map<string, string>();
      for (const phase of phasesRes.data ?? []) {
        const uid = phase.user_id as string;
        if (!activePhaseByClient.has(uid) && phase.is_active) {
          activePhaseByClient.set(uid, phase.id as string);
        }
      }

      // Latest weigh-in date per client + the top-8 feed, both derived from
      // the single date-DESC weight_logs query.
      const latestWeighInByClient = new Map<string, string>();
      const recentWeighIns: RecentWeighIn[] = [];
      for (const log of weightLogsRes.data ?? []) {
        const uid = log.user_id as string;
        if (!latestWeighInByClient.has(uid)) {
          latestWeighInByClient.set(uid, log.log_date as string);
        }
        if (recentWeighIns.length < 8) {
          recentWeighIns.push({
            clientId: uid,
            displayName: displayNameById.get(uid) ?? "Client",
            logDate: log.log_date as string,
            weightKg: Number(log.weight_kg),
          });
        }
      }

      // 3) Pending adjustments scoped to the chosen active phases.
      const activePhaseIds = Array.from(activePhaseByClient.values());
      const clientsWithPending = new Set<string>();
      if (activePhaseIds.length > 0) {
        const { data: pending, error: pendingErr } = await supabase
          .from("nutrition_adjustments")
          .select("phase_id")
          .in("phase_id", activePhaseIds)
          .eq("status", "pending");
        if (pendingErr) throw pendingErr;

        const clientByPhaseId = new Map(
          Array.from(activePhaseByClient.entries()).map(([uid, pid]) => [pid, uid]),
        );
        for (const row of pending ?? []) {
          const uid = clientByPhaseId.get(row.phase_id as string);
          if (uid) clientsWithPending.add(uid);
        }
      }

      // Per-client classification -- mirrors DietitianMyClientsPage's
      // `daysSinceLastWeighIn` math and DRIFT_DAYS_THRESHOLD.
      //
      // Drifting EXCLUDES never-logged clients (daysSince === null): they're
      // awaiting a first weigh-in, not drifting. The roster's sectionFor()
      // routes them to action_needed for the same reason, so this keeps the
      // tile == roster drifting-section count.
      const now = Date.now();
      let driftingCount = 0;
      let noPhaseCount = 0;
      for (const uid of clientIds) {
        const lastDate = latestWeighInByClient.get(uid);
        const daysSince = lastDate
          ? Math.floor((now - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        if (daysSince !== null && daysSince > DRIFT_DAYS_THRESHOLD) driftingCount++;
        if (!activePhaseByClient.has(uid)) noPhaseCount++;
      }

      setMetrics({
        rosterSize: clientIds.length,
        activePhases: activePhaseByClient.size,
        clientsWithPendingAdjustments: clientsWithPending.size,
        driftingCount,
        noPhaseCount,
        recentWeighIns,
      });
    } catch (error: unknown) {
      console.error("[DietitianDashboardOverview] fetch:", error);
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [userId, toast]);

  useEffect(() => {
    if (!userId || hasFetched.current) return;
    hasFetched.current = true;
    fetchMetrics();
  }, [userId, fetchMetrics]);

  const goToRoster = useCallback(() => {
    if (onNavigate) onNavigate("nutrition-clients");
    else navigate("/coach/nutrition-clients");
  }, [onNavigate, navigate]);

  const openClientNutrition = useCallback(
    (clientId: string) => navigate(`/coach/clients/${clientId}?tab=nutrition`),
    [navigate],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (metrics.rosterSize === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center space-y-3">
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-muted">
              <Salad className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="font-medium">No nutrition clients yet</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              You're not assigned as a dietitian on any client yet. Once an admin
              or primary coach adds you to a client's care team, they'll show up
              here.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-full overflow-hidden">
      <DietitianNeedsAttention
        pendingAdjustments={metrics.clientsWithPendingAdjustments}
        driftingCount={metrics.driftingCount}
        onGoToRoster={goToRoster}
      />

      <DietitianStatsRow metrics={metrics} onGoToRoster={goToRoster} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DietitianTodaysTasks metrics={metrics} onGoToRoster={goToRoster} />
        <DietitianRecentWeighIns
          weighIns={metrics.recentWeighIns}
          onOpenClient={openClientNutrition}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Needs-attention banner -- matches NeedsAttentionAlerts visual vocabulary
// (amber card shell, Bell badge, pill buttons with per-item colour). Each
// pill links to the roster; the roster's section layout already separates
// pending vs drifting, so no deep filter is passed.
// ---------------------------------------------------------------------------
interface DietitianNeedsAttentionProps {
  pendingAdjustments: number;
  driftingCount: number;
  onGoToRoster: () => void;
}

const DietitianNeedsAttention = memo(function DietitianNeedsAttention({
  pendingAdjustments,
  driftingCount,
  onGoToRoster,
}: DietitianNeedsAttentionProps) {
  const items = [
    {
      count: pendingAdjustments,
      label:
        pendingAdjustments === 1
          ? "Client with a pending adjustment"
          : "Clients with pending adjustments",
      icon: Scale,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      borderColor: "border-orange-500/30",
    },
    {
      count: driftingCount,
      label: driftingCount === 1 ? "Client drifting on check-ins" : "Clients drifting on check-ins",
      icon: Activity,
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
      borderColor: "border-yellow-500/30",
    },
  ].filter((item) => item.count > 0);

  if (items.length === 0) return null;

  const totalItems = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardContent className="p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center p-2 rounded-full bg-amber-500/15">
              <Bell className="h-4 w-4 text-amber-500" />
            </div>
            <div className="leading-tight">
              <h3 className="font-semibold text-sm">Needs Your Attention</h3>
              <p className="text-xs text-muted-foreground">
                {totalItems} {totalItems === 1 ? "item" : "items"} to review
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 flex-1">
            {items.map((item, index) => (
              <button
                key={index}
                onClick={onGoToRoster}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-colors hover:bg-background/40",
                  item.bgColor,
                  item.borderColor,
                )}
              >
                <item.icon className={cn("h-4 w-4", item.color)} />
                <span className={cn("font-semibold", item.color)}>{item.count}</span>
                <span className="text-muted-foreground">{item.label}</span>
                <ChevronRight className={cn("h-3.5 w-3.5", item.color)} />
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

// ---------------------------------------------------------------------------
// Stats row -- 3 ClickableCard tiles, same grid as CoachOverviewStats.
// ---------------------------------------------------------------------------
interface DietitianStatsRowProps {
  metrics: DietitianMetrics;
  onGoToRoster: () => void;
}

const DietitianStatsRow = memo(function DietitianStatsRow({
  metrics,
  onGoToRoster,
}: DietitianStatsRowProps) {
  const stats = [
    {
      label: "Active Phases",
      value: metrics.activePhases,
      icon: Activity,
      color: "text-green-600 bg-green-100 dark:bg-green-900/50",
    },
    {
      label: "Pending Adjustments",
      value: metrics.clientsWithPendingAdjustments,
      icon: Scale,
      color: "text-orange-600 bg-orange-100 dark:bg-orange-900/50",
    },
    {
      label: "Drifting Clients",
      value: metrics.driftingCount,
      icon: AlertTriangle,
      color: "text-red-600 bg-red-100 dark:bg-red-900/50",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {stats.map((stat) => (
        <ClickableCard
          key={stat.label}
          ariaLabel={`${stat.label}: ${stat.value}`}
          onClick={onGoToRoster}
          className="h-full"
        >
          <CardContent className="h-full p-4 md:p-6 flex items-center gap-4">
            <div
              className={cn(
                "inline-flex items-center justify-center p-2.5 rounded-lg shrink-0",
                stat.color,
              )}
            >
              <stat.icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold tabular-nums leading-tight">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          </CardContent>
        </ClickableCard>
      ))}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Today's Tasks -- actionable counts, same pattern as CoachTodaysTasks.
// Every row navigates to the roster.
//
// TODO (follow-up): a client with an active phase but zero weigh-ins logged
// isn't surfaced by any task here -- they're not "drifting" (never logged)
// and they're not "no active phase". The roster still catches them under
// action_needed. Consider adding an "X clients on active phase, no weigh-in
// logged yet" bullet in a later PR. Out of scope for this one.
// ---------------------------------------------------------------------------
interface DietitianTodaysTasksProps {
  metrics: DietitianMetrics;
  onGoToRoster: () => void;
}

const DietitianTodaysTasks = memo(function DietitianTodaysTasks({
  metrics,
  onGoToRoster,
}: DietitianTodaysTasksProps) {
  const tasks = [
    {
      count: metrics.clientsWithPendingAdjustments,
      label:
        metrics.clientsWithPendingAdjustments === 1
          ? "client has pending adjustments"
          : "clients have pending adjustments",
      icon: Scale,
    },
    {
      count: metrics.driftingCount,
      label:
        metrics.driftingCount === 1
          ? "client hasn't logged a weigh-in in 7+ days"
          : "clients haven't logged a weigh-in in 7+ days",
      icon: Activity,
    },
    {
      count: metrics.noPhaseCount,
      label:
        metrics.noPhaseCount === 1
          ? "client has no active phase yet"
          : "clients have no active phase yet",
      icon: Salad,
    },
  ];

  const hasAnyTasks = tasks.some((t) => t.count > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ClipboardList className="h-5 w-5" />
          Today's Tasks
        </CardTitle>
        <CardDescription className="text-sm">
          Action items that need your attention
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasAnyTasks ? (
          <div className="text-center py-6 text-muted-foreground">
            <ClipboardList className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">All caught up! No pending tasks.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((task, index) => {
              const Icon = task.icon;
              const isActive = task.count > 0;
              return (
                <Button
                  key={index}
                  variant="ghost"
                  className={cn(
                    "w-full justify-between h-auto py-3 px-3 min-h-[48px]",
                    isActive
                      ? "hover:bg-muted"
                      : "opacity-50 cursor-default hover:bg-transparent",
                  )}
                  onClick={() => isActive && onGoToRoster()}
                  disabled={!isActive}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "inline-flex items-center justify-center p-2 rounded-full",
                        isActive ? "bg-destructive/10" : "bg-muted",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4",
                          isActive ? "text-destructive" : "text-muted-foreground",
                        )}
                      />
                    </div>
                    <div className="text-left">
                      <span
                        className={cn(
                          "text-xl font-bold",
                          isActive ? "text-destructive" : "",
                        )}
                      >
                        {task.count}
                      </span>
                      <span className="text-sm text-muted-foreground ml-2">{task.label}</span>
                    </div>
                  </div>
                  {isActive && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
                </Button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// ---------------------------------------------------------------------------
// Recent weigh-ins -- top 8 across the roster, click opens that client's
// nutrition tab in the Client Overview shell.
// ---------------------------------------------------------------------------
interface DietitianRecentWeighInsProps {
  weighIns: RecentWeighIn[];
  onOpenClient: (clientId: string) => void;
}

const DietitianRecentWeighIns = memo(function DietitianRecentWeighIns({
  weighIns,
  onOpenClient,
}: DietitianRecentWeighInsProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Scale className="h-5 w-5" />
          Recent Weigh-Ins
        </CardTitle>
        <CardDescription className="text-sm">
          Latest check-ins across your roster
        </CardDescription>
      </CardHeader>
      <CardContent>
        {weighIns.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Scale className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No weigh-ins logged yet.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {weighIns.map((entry, index) => (
              <ClickableCard
                key={`${entry.clientId}-${entry.logDate}-${index}`}
                ariaLabel={`Open ${entry.displayName}'s nutrition -- weighed ${entry.weightKg} kg ${formatRelativeDate(entry.logDate)}`}
                onClick={() => onOpenClient(entry.clientId)}
                className="flex items-center justify-between p-3 rounded-lg shadow-none"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{entry.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatRelativeDate(entry.logDate)}
                  </p>
                </div>
                <span className="font-mono tabular-nums text-sm shrink-0 ml-3">
                  {entry.weightKg} kg
                </span>
              </ClickableCard>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

function formatRelativeDate(dateStr: string): string {
  const days = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString();
}
