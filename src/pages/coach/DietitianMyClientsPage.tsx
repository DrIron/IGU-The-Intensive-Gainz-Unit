import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Salad, Search, AlertCircle, Activity, Inbox, AlertTriangle, MessageSquare, CalendarOff, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useStaffUnreadCounts } from "@/hooks/useStaffUnreadCounts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClickableCard } from "@/components/ui/clickable-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { RoleBreadcrumb } from "@/components/coach/RoleBreadcrumb";

interface DietitianClient {
  id: string;
  displayName: string;
  serviceName: string | null;
  serviceType: string | null;
  subscriptionStatus: string | null;
  assignmentStatus: string;
  assignmentCreatedAt: string;
  phaseId: string | null;
  phaseName: string | null;
  phaseGoalType: string | null;
  phaseIsActive: boolean;
  phaseEndDate: string | null;
  lastWeighInDate: string | null;
  daysSinceLastWeighIn: number | null;
  pendingAdjustments: number;
}

type SectionKey = "action_needed" | "active" | "drifting" | "ended";

// Exported so DietitianDashboardOverview reuses the exact same drift
// threshold -- single source of truth, don't redefine it elsewhere.
// eslint-disable-next-line react-refresh/only-export-components
export const DRIFT_DAYS_THRESHOLD = 7;

/**
 * Renders inside `<CoachDashboardLayout>` (mounted from
 * `CoachDashboardLayout.renderContent()` when activeSection ===
 * "nutrition-clients"). The layout supplies sidebar, Navigation, page
 * header, and the outer container — so this component only renders the
 * roster body (breadcrumb + filters + sections).
 */
export default function DietitianMyClientsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user: sessionUser } = useAuthSession();
  const [clients, setClients] = useState<DietitianClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const hasFetched = useRef<string | null>(null);

  // Unread message badges (shared RPC, RLS-gated to care_team_assignments).
  // `is_care_team_member_for_client` already includes dietitians via the
  // helper's `status='active'` clause, so this is roster-complete.
  const { counts: unreadCounts } = useStaffUnreadCounts();

  // `silent` skips the full-page spinner -- used by the Refresh button so the
  // existing list stays visible while the new data loads (only the button
  // spins). Initial load passes silent=false for the centered spinner.
  const fetchClients = useCallback(async (dietitianId: string, silent = false) => {
    try {
      if (!silent) setLoading(true);

      // 1) Active dietitian assignments for this viewer.
      //
      // Match the RLS opened by is_dietitian_for_client + the dietitian
      // subscriptions/profiles_public policies, which (post-B5-N6) key on
      // `lifecycle_status IN ('active','scheduled_end')`. Mirror that filter
      // here so we don't show rows the user can't actually read downstream.
      const { data: assignments, error: assignmentsError } = await supabase
        .from("care_team_assignments")
        .select("client_id, lifecycle_status, created_at")
        .eq("staff_user_id", dietitianId)
        .eq("specialty", "dietitian")
        .in("lifecycle_status", ["active", "scheduled_end"]);

      if (assignmentsError) throw assignmentsError;

      const assignmentByClient = new Map<string, { status: string; created_at: string }>();
      for (const a of assignments ?? []) {
        const ls = a.lifecycle_status as string;
        // B5-N6 / Sentinel 1: active + scheduled_end both surface as "Active"
        // (no separate "winding down" label).
        const isActive = ls === "active" || ls === "scheduled_end";
        // First assignment wins for duplicate (client_id, dietitian) rows --
        // the partial unique index prevents duplicate ACTIVE rows, so this is a
        // safety guard, not the norm.
        if (!assignmentByClient.has(a.client_id as string)) {
          assignmentByClient.set(a.client_id as string, {
            status: isActive ? "active" : ls,
            created_at: a.created_at as string,
          });
        }
      }

      const clientIds = Array.from(assignmentByClient.keys());
      if (clientIds.length === 0) {
        setClients([]);
        return;
      }

      // 2) Fan out the four lookups in parallel. Nested PostgREST FK joins
      //    on these tables are unreliable (see CLAUDE.md) -- always separate
      //    queries.
      const [profilesRes, subsRes, phasesRes, weightLogsRes] = await Promise.all([
        supabase
          .from("profiles_public")
          .select("id, first_name, display_name, status")
          .in("id", clientIds),
        supabase
          .from("subscriptions")
          .select("id, user_id, status, services!inner(name, type)")
          .in("user_id", clientIds),
        supabase
          .from("nutrition_phases")
          .select("id, user_id, phase_name, goal_type, is_active, end_date, start_date")
          .in("user_id", clientIds)
          .order("start_date", { ascending: false }),
        supabase
          .from("weight_logs")
          .select("user_id, log_date")
          .in("user_id", clientIds)
          .order("log_date", { ascending: false }),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (subsRes.error) throw subsRes.error;
      if (phasesRes.error) throw phasesRes.error;
      if (weightLogsRes.error) throw weightLogsRes.error;

      const profileById = new Map((profilesRes.data ?? []).map(p => [p.id as string, p]));

      // Latest subscription per client (subscriptions can have multiple rows
      // historically; we surface the most-recently-touched one).
      const subByClient = new Map<string, (typeof subsRes.data)[number]>();
      for (const sub of subsRes.data ?? []) {
        const uid = sub.user_id as string;
        if (!subByClient.has(uid)) subByClient.set(uid, sub);
      }

      // Active phase per client. Phases are ordered start_date DESC -- the
      // first row matching `is_active=true` is the current phase.
      const phaseByClient = new Map<string, (typeof phasesRes.data)[number]>();
      for (const phase of phasesRes.data ?? []) {
        const uid = phase.user_id as string;
        if (!phaseByClient.has(uid) && phase.is_active) {
          phaseByClient.set(uid, phase);
        }
      }
      // Fallback: any phase (including ended) so "Ended / paused" can still
      // surface the most recent context.
      const fallbackPhaseByClient = new Map<string, (typeof phasesRes.data)[number]>();
      for (const phase of phasesRes.data ?? []) {
        const uid = phase.user_id as string;
        if (!fallbackPhaseByClient.has(uid)) fallbackPhaseByClient.set(uid, phase);
      }

      const latestWeighIn = new Map<string, string>();
      for (const log of weightLogsRes.data ?? []) {
        const uid = log.user_id as string;
        if (!latestWeighIn.has(uid)) latestWeighIn.set(uid, log.log_date as string);
      }

      // 3) Pending nutrition_adjustments per phase (drives "Action needed").
      const phaseIds = Array.from(phaseByClient.values()).map(p => p.id as string);
      const pendingByClient = new Map<string, number>();
      if (phaseIds.length > 0) {
        const { data: pending, error: pendingErr } = await supabase
          .from("nutrition_adjustments")
          .select("phase_id")
          .in("phase_id", phaseIds)
          .eq("status", "pending");
        if (pendingErr) throw pendingErr;
        const phaseToClient = new Map(
          Array.from(phaseByClient.entries()).map(([uid, p]) => [p.id as string, uid]),
        );
        for (const row of pending ?? []) {
          const uid = phaseToClient.get(row.phase_id as string);
          if (!uid) continue;
          pendingByClient.set(uid, (pendingByClient.get(uid) ?? 0) + 1);
        }
      }

      const now = Date.now();
      const built: DietitianClient[] = clientIds.map(uid => {
        const profile = profileById.get(uid);
        const sub = subByClient.get(uid);
        const phase = phaseByClient.get(uid) ?? fallbackPhaseByClient.get(uid);
        const lastDate = latestWeighIn.get(uid);
        const daysSince = lastDate
          ? Math.floor((now - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        const assignment = assignmentByClient.get(uid)!;

        return {
          id: uid,
          displayName: profile?.display_name || profile?.first_name || "Client",
          serviceName: ((sub?.services as { name?: string } | null) ?? null)?.name ?? null,
          serviceType: ((sub?.services as { type?: string } | null) ?? null)?.type ?? null,
          subscriptionStatus: sub?.status ?? null,
          assignmentStatus: assignment.status,
          assignmentCreatedAt: assignment.created_at,
          phaseId: (phase?.id as string) ?? null,
          phaseName: (phase?.phase_name as string) ?? null,
          phaseGoalType: (phase?.goal_type as string) ?? null,
          phaseIsActive: phase?.is_active ?? false,
          phaseEndDate: (phase?.end_date as string) ?? null,
          lastWeighInDate: lastDate ?? null,
          daysSinceLastWeighIn: daysSince,
          pendingAdjustments: pendingByClient.get(uid) ?? 0,
        };
      });

      setClients(built);
    } catch (err: unknown) {
      console.error("[DietitianMyClientsPage] fetch:", err);
      toast({
        title: "Error",
        description: sanitizeErrorForUser(err),
        variant: "destructive",
      });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [toast]);

  // AuthGuard + RoleProtectedRoute upstream guarantee a coach session by
  // the time this renders, so no auth fallback needed here.
  useEffect(() => {
    if (!sessionUser) return;
    if (hasFetched.current === sessionUser.id) return;
    hasFetched.current = sessionUser.id;
    fetchClients(sessionUser.id);
  }, [sessionUser, fetchClients]);

  const handleRefresh = async () => {
    if (!sessionUser) return;
    setRefreshing(true);
    await fetchClients(sessionUser.id, true);
    setRefreshing(false);
  };

  const matchesFilters = (c: DietitianClient): boolean => {
    if (planFilter !== "all" && c.serviceName !== planFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!c.displayName.toLowerCase().includes(q)) return false;
    }
    return true;
  };

  // Section assignment (mutually exclusive: each client lands in exactly
  // one bucket; the first matching condition wins).
  //
  // "Drifting" only fires for clients with a known weigh-in older than
  // DRIFT_DAYS_THRESHOLD. A freshly-assigned client with no weigh-in yet
  // lands in "Action needed" instead -- the dietitian's first job is to
  // prompt the initial weigh-in, not to react to "drift" that never
  // started.
  const sectionFor = (c: DietitianClient): SectionKey => {
    const isEnded =
      c.subscriptionStatus !== "active" ||
      (!c.phaseIsActive && c.phaseId !== null) ||
      (c.phaseEndDate !== null && new Date(c.phaseEndDate).getTime() < Date.now());
    if (isEnded) return "ended";

    const noWeighInYet = c.daysSinceLastWeighIn === null;
    if (c.pendingAdjustments > 0 || c.phaseId === null || noWeighInYet) {
      return "action_needed";
    }

    if (c.daysSinceLastWeighIn! > DRIFT_DAYS_THRESHOLD) return "drifting";

    return "active";
  };

  const sections: Record<SectionKey, DietitianClient[]> = {
    action_needed: [],
    active: [],
    drifting: [],
    ended: [],
  };
  for (const c of clients) {
    if (!matchesFilters(c)) continue;
    sections[sectionFor(c)].push(c);
  }

  const uniquePlans = Array.from(new Set(clients.map(c => c.serviceName).filter(Boolean) as string[]));

  const openClient = useCallback(
    (clientId: string) => navigate(`/coach/clients/${clientId}?tab=nutrition`),
    [navigate],
  );

  return (
    <div className="space-y-6">
      <RoleBreadcrumb role="coach" currentPage="Nutrition Clients" />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="gap-2 self-start"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </Button>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search clients..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 w-48"
              aria-label="Search clients"
            />
          </div>
          <Select value={planFilter} onValueChange={setPlanFilter}>
            <SelectTrigger className="w-40" aria-label="Filter by plan">
              <SelectValue placeholder="Plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All plans</SelectItem>
              {uniquePlans.map(plan => (
                <SelectItem key={plan} value={plan}>{plan}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : clients.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={Salad}
              title="No nutrition clients yet"
              description="You're not assigned as a dietitian on any client. Once an admin or primary coach adds you to a client's care team, they'll appear here."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <SectionBlock
            title="Action needed"
            icon={AlertCircle}
            variant="amber"
            emptyText="Nothing pending right now."
            clients={sections.action_needed}
            unreadCounts={unreadCounts}
            onRowClick={openClient}
          />
          <SectionBlock
            title="Active phases"
            icon={Activity}
            variant="green"
            emptyText="No clients on an active phase."
            clients={sections.active}
            unreadCounts={unreadCounts}
            onRowClick={openClient}
          />
          <SectionBlock
            title="Drifting"
            icon={AlertTriangle}
            variant="red"
            emptyText="No drifting clients -- everyone's logging on schedule."
            clients={sections.drifting}
            unreadCounts={unreadCounts}
            onRowClick={openClient}
          />
          <SectionBlock
            title="Ended / paused"
            icon={CalendarOff}
            variant="muted"
            emptyText="No ended or paused phases."
            clients={sections.ended}
            unreadCounts={unreadCounts}
            onRowClick={openClient}
          />
        </div>
      )}
    </div>
  );
}

type SectionVariant = "amber" | "green" | "red" | "muted";

interface SectionBlockProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  variant: SectionVariant;
  emptyText: string;
  clients: DietitianClient[];
  unreadCounts: Record<string, number>;
  onRowClick: (clientId: string) => void;
}

function SectionBlock({ title, icon: Icon, variant, emptyText, clients, unreadCounts, onRowClick }: SectionBlockProps) {
  const cardClass = {
    amber: "border-amber-500/20 bg-amber-500/5",
    green: "border-emerald-500/20 bg-emerald-500/5",
    red: "border-red-500/20 bg-red-500/5",
    muted: "",
  }[variant];

  const iconClass = {
    amber: "text-amber-400",
    green: "text-emerald-400",
    red: "text-red-400",
    muted: "text-muted-foreground",
  }[variant];

  const badgeClass = {
    amber: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    red: "bg-red-500/15 text-red-400 border-red-500/20",
    muted: "",
  }[variant];

  return (
    <Card className={cardClass}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${iconClass}`} />
            {title}
          </span>
          <Badge variant="secondary" className={`font-medium ${badgeClass}`}>
            {clients.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {clients.length === 0 ? (
          <EmptyState icon={Inbox} title={emptyText} className="py-6" />
        ) : (
          <div className="space-y-3">
            {clients.map(client => (
              <ClientRow
                key={client.id}
                client={client}
                unread={unreadCounts[client.id] ?? 0}
                onClick={() => onRowClick(client.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const GOAL_LABEL: Record<string, string> = {
  fat_loss: "Fat Loss",
  muscle_gain: "Muscle Gain",
  maintenance: "Maintenance",
};

interface ClientRowProps {
  client: DietitianClient;
  unread: number;
  onClick: () => void;
}

function ClientRow({ client, unread, onClick }: ClientRowProps) {
  const goalLabel = client.phaseGoalType ? GOAL_LABEL[client.phaseGoalType] ?? client.phaseGoalType : null;
  const weighInLabel = formatWeighInHint(client.daysSinceLastWeighIn);

  return (
    <ClickableCard
      ariaLabel={`Open ${client.displayName}'s nutrition surface`}
      onClick={onClick}
      className="flex items-start justify-between p-3 rounded-lg shadow-none"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{client.displayName}</span>
          {client.serviceName && (
            <Badge variant="outline" className="text-xs shrink-0">
              {client.serviceName}
            </Badge>
          )}
          {unread > 0 && (
            <Badge
              variant="destructive"
              className="text-[10px] shrink-0 gap-1 px-1.5 h-5"
              aria-label={`${unread} unread ${unread === 1 ? "message" : "messages"}`}
            >
              <MessageSquare className="h-3 w-3" aria-hidden="true" />
              {unread >= 100 ? "99+" : unread}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
          {client.phaseName ? (
            <span>
              {client.phaseName}
              {goalLabel && ` -- ${goalLabel}`}
            </span>
          ) : (
            <span className="text-amber-500">No active phase</span>
          )}
          {weighInLabel && <span>{weighInLabel}</span>}
          {client.pendingAdjustments > 0 && (
            <Badge variant="secondary" className="text-[10px] gap-1 bg-amber-500/15 text-amber-400 border-amber-500/20">
              {client.pendingAdjustments} pending
            </Badge>
          )}
        </div>
      </div>
    </ClickableCard>
  );
}

function formatWeighInHint(days: number | null): string | null {
  if (days === null) return "No weigh-in logged";
  if (days <= 0) return "Logged today";
  if (days === 1) return "Logged yesterday";
  return `Last weigh-in ${days}d ago`;
}
