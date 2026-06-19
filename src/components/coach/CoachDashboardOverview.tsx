import { useState, useEffect, useCallback, useRef, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ClickableCard } from "@/components/ui/clickable-card";
import { Loader2, Users2, ChevronRight, Award, Dumbbell, TrendingUp, ClipboardCheck, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { startOfIguWeek } from "@/lib/weekUtils";
import { cn } from "@/lib/utils";
import { MetricCard } from "@/components/ui/metric-card";
import { interpretCheckIns, type Interpretation, type Tone } from "@/lib/interpret";
import { useCoachRosterAttention, type RosterAttention } from "@/hooks/useCoachRosterAttention";

import { EnhancedCapacityCard } from "./EnhancedCapacityCard";
import { CoachTodaysTasks } from "./CoachTodaysTasks";
import { NeedsAttentionAlerts } from "./NeedsAttentionAlerts";
import { ClientActivityFeed } from "./ClientActivityFeed";
import { LEVEL_LABELS, type ProfessionalLevel } from "@/auth/roles";

interface CoachDashboardOverviewProps {
  coachUserId: string;
  onNavigate?: (section: string, filter?: string) => void;
}

interface DashboardMetrics {
  totalClients: number;
  activeClients: number;
  pendingApprovals: number;
  checkInsDue: number;
  checkInsDueToday: number;
  /** Worst overdue gap (days) across due check-ins; drives the risk tone. */
  mostOverdueCheckInDays: number;
  inactiveFor14Days: number;
  programsCreated: number;
  workoutsThisWeek: number;
}

export function CoachDashboardOverview({ coachUserId, onNavigate }: CoachDashboardOverviewProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);
  // CO1: single roster-attention source — the banner headline + the Check-ins
  // Due card both read THIS (deduped server-side, same number as the sidebar
  // badge + roster). Fetched once here, threaded down as a prop.
  const { attention } = useCoachRosterAttention();
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalClients: 0,
    activeClients: 0,
    pendingApprovals: 0,
    checkInsDue: 0,
    checkInsDueToday: 0,
    mostOverdueCheckInDays: 0,
    inactiveFor14Days: 0,
    programsCreated: 0,
    workoutsThisWeek: 0,
  });

  const fetchDashboardMetrics = useCallback(async () => {
    try {
      setLoading(true);

      // Get team IDs owned by this coach so we can include team-plan subscribers
      // (team-plan subs set `team_id` and leave `coach_id` NULL).
      const { data: ownedTeams } = await supabase
        .from("coach_teams")
        .select("id")
        .eq("coach_id", coachUserId);
      const coachTeamIds = (ownedTeams || []).map(t => t.id);

      // Pull subs via two parallel queries (coach_id match OR team_id match), then merge + dedupe.
      const [
        { data: coachSubs, error: coachSubsError },
        { data: teamSubs, error: teamSubsError }
      ] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("id, user_id, status, created_at")
          .eq("coach_id", coachUserId),
        coachTeamIds.length > 0
          ? supabase
              .from("subscriptions")
              .select("id, user_id, status, created_at")
              .in("team_id", coachTeamIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (coachSubsError) throw coachSubsError;
      if (teamSubsError) throw teamSubsError;

      const seenSubIds = new Set<string>();
      const allSubscriptions: NonNullable<typeof coachSubs> = [];
      for (const sub of [...(coachSubs || []), ...(teamSubs || [])]) {
        if (!seenSubIds.has(sub.id)) {
          seenSubIds.add(sub.id);
          allSubscriptions.push(sub);
        }
      }

      // Batch-fetch profiles_public for all assigned clients in one query.
      // RLS allows coaches to read profiles of clients they're assigned to.
      const clientUserIds = Array.from(new Set(allSubscriptions.map(s => s.user_id)));
      const profilesById = new Map<string, { id: string; first_name: string | null; display_name: string | null; status: string | null }>();
      if (clientUserIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles_public")
          .select("id, first_name, display_name, status")
          .in("id", clientUserIds);
        if (profilesError) throw profilesError;
        for (const p of profiles ?? []) profilesById.set(p.id, p);
      }
      const subscriptionsWithProfiles = allSubscriptions.map(sub => ({
        ...sub,
        profile: profilesById.get(sub.user_id) ?? null,
      }));

      const totalClients = subscriptionsWithProfiles.length;
      
      // Active clients - must have both subscription.status = 'active' AND profile.status = 'active'
      const activeClients = subscriptionsWithProfiles.filter(s => 
        s.status === 'active' && s.profile?.status === 'active'
      ).length;

      // Pending approvals - match status criteria
      const pendingApprovals = subscriptionsWithProfiles.filter(s =>
        s.status === 'pending' && s.profile?.status === 'pending_coach_approval'
      ).length;

      // Get nutrition phases that need check-ins (active phases with no recent weight logs)
      const { data: nutritionPhases } = await supabase
        .from("nutrition_phases")
        .select(`
          id,
          user_id,
          updated_at
        `)
        .eq("coach_id", coachUserId)
        .eq("is_active", true);

      // Batch-fetch most recent weight log per phase in ONE query, then compute
      // 7d / today-due / 14d counters in memory. Replaces N+1 loops that fired
      // up to 3 queries per phase (worst case for an active coach: dozens).
      let checkInsDue = 0;
      let checkInsDueToday = 0;
      let inactiveFor14Days = 0;
      let mostOverdueCheckInDays = 0;

      if (nutritionPhases && nutritionPhases.length > 0) {
        const phaseIds = nutritionPhases.map(p => p.id);
        const { data: phaseLogs, error: phaseLogsError } = await supabase
          .from("weight_logs")
          .select("phase_id, log_date")
          .in("phase_id", phaseIds)
          .order("log_date", { ascending: false });
        if (phaseLogsError) throw phaseLogsError;

        const latestLogByPhase = new Map<string, string>();
        for (const log of phaseLogs ?? []) {
          if (!latestLogByPhase.has(log.phase_id)) {
            latestLogByPhase.set(log.phase_id, log.log_date);
          }
        }

        const now = Date.now();
        for (const phase of nutritionPhases) {
          const latest = latestLogByPhase.get(phase.id);
          if (!latest) {
            // Never-logged active phase: counts as due (unchanged). Use updated_at
            // as the overdue proxy for the display number only -- doesn't affect counts.
            checkInsDue++;
            inactiveFor14Days++;
            const proxyDays = phase.updated_at
              ? Math.floor((now - new Date(phase.updated_at).getTime()) / 86_400_000)
              : 0;
            mostOverdueCheckInDays = Math.max(mostOverdueCheckInDays, proxyDays);
            continue;
          }
          const daysSinceLog = Math.floor((now - new Date(latest).getTime()) / 86_400_000);
          if (daysSinceLog >= 7) {
            checkInsDue++;
            if (daysSinceLog === 7) checkInsDueToday++;
            mostOverdueCheckInDays = Math.max(mostOverdueCheckInDays, daysSinceLog);
          }
          if (daysSinceLog >= 14) inactiveFor14Days++;
        }
      }

      // Programs created count
      const { count: programsCreated, error: programsError } = await supabase
        .from("program_templates")
        .select("*", { count: "exact", head: true })
        .eq("owner_coach_id", coachUserId);
      if (programsError) throw programsError;

      // Workouts completed this week by my clients.
      // Avoid nested PostgREST FK joins (unreliable per CLAUDE.md):
      // 3 separate queries — client_programs → client_program_days → count client_day_modules
      // IGU adherence week — see weekUtils.ts
      const weekStart = startOfIguWeek();
      const clientIds = subscriptionsWithProfiles
        .filter(s => s.status === 'active')
        .map(s => s.user_id);

      let workoutsThisWeek = 0;
      if (clientIds.length > 0) {
        const { data: programRows, error: programsErr } = await supabase
          .from("client_programs")
          .select("id")
          .in("user_id", clientIds)
          .eq("status", "active");
        if (programsErr) throw programsErr;

        const programIds = (programRows || []).map(p => p.id);
        if (programIds.length > 0) {
          const { data: dayRows, error: daysErr } = await supabase
            .from("client_program_days")
            .select("id")
            .in("client_program_id", programIds);
          if (daysErr) throw daysErr;

          const dayIds = (dayRows || []).map(d => d.id);
          if (dayIds.length > 0) {
            const { count, error: countErr } = await supabase
              .from("client_day_modules")
              .select("*", { count: "exact", head: true })
              .in("client_program_day_id", dayIds)
              .not("completed_at", "is", null)
              .gte("completed_at", weekStart.toISOString());
            if (countErr) throw countErr;
            workoutsThisWeek = count || 0;
          }
        }
      }

      setMetrics({
        totalClients,
        activeClients,
        pendingApprovals,
        checkInsDue,
        checkInsDueToday,
        mostOverdueCheckInDays,
        inactiveFor14Days,
        programsCreated: programsCreated || 0,
        workoutsThisWeek,
      });

    } catch (error: unknown) {
      console.error("Error fetching dashboard metrics:", error);
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [coachUserId, toast]);

  useEffect(() => {
    if (!coachUserId || hasFetched.current) return;
    hasFetched.current = true;
    fetchDashboardMetrics();
  }, [coachUserId, fetchDashboardMetrics]);

  const handleNavigate = useCallback((section: string, filter?: string) => {
    if (onNavigate) {
      onNavigate(section, filter);
    }
  }, [onNavigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-full overflow-hidden">
      {/* 1. Needs Attention Alerts - Top Priority */}
      <NeedsAttentionAlerts
        attention={attention}
        onNavigate={handleNavigate}
      />

      {/* 2. Stats Row — compact, non-redundant KPIs */}
      <CoachOverviewStats metrics={metrics} attention={attention} onNavigate={handleNavigate} />

      {/* 3. Two Column: Today's Tasks + Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CoachTodaysTasks
          checkInsDueToday={metrics.checkInsDueToday}
          inactiveFor14Days={metrics.inactiveFor14Days}
          pendingApprovals={metrics.pendingApprovals}
          onNavigate={handleNavigate}
        />

        <ClientActivityFeed coachId={coachUserId} limit={8} />
      </div>

      {/* 4. Two Column: Capacity + Teams (head coaches) or Compensation summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EnhancedCapacityCard
          coachUserId={coachUserId}
          onNavigate={handleNavigate}
        />

        <div className="space-y-6">
          <CoachTeamsSummaryCard coachUserId={coachUserId} onNavigate={handleNavigate} />
          <CoachCompensationSummary coachUserId={coachUserId} />
        </div>
      </div>
    </div>
  );
}

// Teams summary card — only renders for head coaches
interface CoachTeamsSummaryCardProps {
  coachUserId: string;
  onNavigate: (section: string) => void;
}

const CoachTeamsSummaryCard = memo(function CoachTeamsSummaryCard({
  coachUserId,
  onNavigate,
}: CoachTeamsSummaryCardProps) {
  const [isHeadCoach, setIsHeadCoach] = useState(false);
  const [teamCount, setTeamCount] = useState(0);
  const [totalMembers, setTotalMembers] = useState(0);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  const loadData = useCallback(async () => {
    try {
      const { data: coachProfile } = await supabase
        .from("coaches_public")
        .select("is_head_coach")
        .eq("user_id", coachUserId)
        .maybeSingle();

      if (!coachProfile?.is_head_coach) {
        setIsHeadCoach(false);
        setLoading(false);
        return;
      }

      setIsHeadCoach(true);

      const { data: teams } = await supabase
        .from("coach_teams")
        .select("id")
        .eq("coach_id", coachUserId)
        .eq("is_active", true);

      setTeamCount(teams?.length || 0);

      // Count total members across all teams via subscriptions.team_id
      if (teams && teams.length > 0) {
        const teamIds = teams.map((t) => t.id);
        const { count } = await supabase
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
          .in("team_id", teamIds)
          .in("status", ["pending", "active"]);

        setTotalMembers(count || 0);
      }
    } catch {
      // Silently fail — card is supplementary
    } finally {
      setLoading(false);
    }
  }, [coachUserId]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadData();
  }, [loadData]);

  if (!isHeadCoach || loading) return null;

  return (
    <ClickableCard
      ariaLabel={`Manage my teams: ${teamCount} team${teamCount !== 1 ? "s" : ""}, ${totalMembers} total members`}
      onClick={() => onNavigate("teams")}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users2 className="h-4 w-4" aria-hidden="true" />
            My Teams
          </CardTitle>
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
        <CardDescription>Team plan management</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center gap-8 text-center">
          <div>
            <p className="text-2xl font-bold tabular-nums">{teamCount}</p>
            <p className="text-xs text-muted-foreground">Teams</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{totalMembers}</p>
            <p className="text-xs text-muted-foreground">Total Members</p>
          </div>
        </div>
      </CardContent>
    </ClickableCard>
  );
});

// Compact stats row — replaces redundant StatsCards + KPIRow
interface CoachOverviewStatsProps {
  metrics: DashboardMetrics;
  attention: RosterAttention;
  onNavigate: (section: string, filter?: string) => void;
}

// Tone severity for CO1: float the most urgent interpreted metric to the top.
const TONE_SEVERITY: Record<Tone, number> = { risk: 3, attention: 2, on_track: 1, neutral: 0 };

const CoachOverviewStats = memo(function CoachOverviewStats({ metrics, attention, onNavigate }: CoachOverviewStatsProps) {
  // Each metric carries a CC2 interpretation. Sentences are derived from the
  // real counts (no fabricated week-over-week deltas -- there is no historical
  // snapshot to compare against, so no DeltaChip here).
  const cards: Array<{
    key: string;
    label: string;
    value: number;
    icon: LucideIcon;
    interpretation: Interpretation;
    onClick: () => void;
  }> = [
    {
      // CO1: check-in-specific slice of the roster-attention RPC (same source as
      // the sidebar badge + roster), so this card never disagrees with the banner.
      key: "checkins",
      label: "Check-ins Due",
      value: attention.tiles.check_in_overdue,
      icon: ClipboardCheck,
      interpretation: interpretCheckIns(attention.tiles.check_in_overdue, attention.most_overdue_days || null),
      onClick: () => onNavigate("clients"),
    },
    {
      key: "active",
      label: "Active Clients",
      value: metrics.activeClients,
      icon: Users2,
      interpretation:
        metrics.activeClients > 0
          ? {
              tone: "on_track",
              label: "",
              sentence: `${metrics.activeClients} of ${metrics.totalClients} client${metrics.totalClients !== 1 ? "s" : ""} active.`,
            }
          : {
              tone: "neutral",
              label: "",
              sentence: metrics.totalClients > 0 ? `No active clients yet (${metrics.totalClients} assigned).` : "No clients assigned yet.",
            },
      onClick: () => onNavigate("clients", "active"),
    },
    {
      key: "workouts",
      label: "Workouts This Week",
      value: metrics.workoutsThisWeek,
      icon: TrendingUp,
      interpretation:
        metrics.workoutsThisWeek > 0
          ? { tone: "on_track", label: "", sentence: "Sessions completed across your roster this week." }
          : { tone: "neutral", label: "", sentence: "No sessions logged yet this week." },
      onClick: () => onNavigate("clients"),
    },
    {
      key: "programs",
      label: "Programs Created",
      value: metrics.programsCreated,
      icon: Dumbbell,
      interpretation: {
        tone: "neutral",
        label: "",
        sentence: `${metrics.programsCreated} program template${metrics.programsCreated !== 1 ? "s" : ""} in your library.`,
      },
      onClick: () => onNavigate("programs"),
    },
  ];

  // CO1: sort is stable, so equal-tone cards keep their declared order while the
  // highest-tone (most urgent) card floats to the front.
  const ordered = [...cards].sort(
    (a, b) => TONE_SEVERITY[b.interpretation.tone] - TONE_SEVERITY[a.interpretation.tone],
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {ordered.map((c) => (
        <MetricCard
          key={c.key}
          label={c.label}
          value={c.value}
          icon={c.icon}
          interpretation={c.interpretation}
          onClick={c.onClick}
          ariaLabel={`${c.label}: ${c.value}. ${c.interpretation.sentence}`}
          className="h-full"
        />
      ))}
    </div>
  );
});

// Slim compensation summary — shows total + level badge, links to full view
interface CoachCompensationSummaryProps {
  coachUserId: string;
}

const CoachCompensationSummary = memo(function CoachCompensationSummary({ coachUserId }: CoachCompensationSummaryProps) {
  const hasFetched = useRef(false);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<ProfessionalLevel>("junior");
  const [isHeadCoach, setIsHeadCoach] = useState(false);
  const [totalPayout, setTotalPayout] = useState(0);
  const [clientCount, setClientCount] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const { data: coachProfile } = await supabase
        .from("coaches_public")
        .select("coach_level, is_head_coach")
        .eq("user_id", coachUserId)
        .maybeSingle();

      if (coachProfile) {
        setLevel((coachProfile.coach_level as ProfessionalLevel) || "junior");
        setIsHeadCoach(coachProfile.is_head_coach || false);
      }

      // Active subs for compensation — include both direct coach assignments and team-plan members.
      const { data: compTeams } = await supabase
        .from("coach_teams")
        .select("id")
        .eq("coach_id", coachUserId);
      const compTeamIds = (compTeams || []).map(t => t.id);

      const [
        { data: directSubs, error: directSubsError },
        { data: teamSubsForComp, error: teamSubsForCompError }
      ] = await Promise.all([
        supabase.from("subscriptions").select("id").eq("coach_id", coachUserId).eq("status", "active"),
        compTeamIds.length > 0
          ? supabase.from("subscriptions").select("id").in("team_id", compTeamIds).eq("status", "active")
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (directSubsError) throw directSubsError;
      if (teamSubsForCompError) throw teamSubsForCompError;

      const seenCompIds = new Set<string>();
      const subs: { id: string }[] = [];
      for (const s of [...(directSubs || []), ...(teamSubsForComp || [])]) {
        if (!seenCompIds.has(s.id)) {
          seenCompIds.add(s.id);
          subs.push(s);
        }
      }

      if (subs.length === 0) {
        setLoading(false);
        return;
      }

      setClientCount(subs.length);

      // Parallelize RPC calls — one round-trip per sub was O(N); now 1x latency.
      // Future: collapse into a single batch RPC if this becomes a hot path.
      const payoutResults = await Promise.all(
        subs.map(async (sub) => {
          try {
            const { data } = await supabase.rpc("calculate_subscription_payout", {
              p_subscription_id: sub.id,
              p_discount_percentage: 0,
            });
            return data as { coach_payout?: number; blocked?: boolean } | null;
          } catch (error) {
            console.error("Payout calc failed for subscription", sub.id, error);
            return null;
          }
        })
      );

      const total = payoutResults.reduce((sum, result) => {
        if (!result || result.blocked) return sum;
        return sum + (result.coach_payout || 0);
      }, 0);

      setTotalPayout(total);
    } catch (error) {
      console.error("Error loading compensation summary:", error);
    } finally {
      setLoading(false);
    }
  }, [coachUserId]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" aria-hidden="true" />
            Compensation
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Badge className={cn(
              "text-xs",
              level === "lead" && "bg-amber-500/20 text-amber-400 border-amber-500/30",
              level === "senior" && "bg-blue-500/20 text-blue-400 border-blue-500/30",
              level === "junior" && "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
            )}>
              {LEVEL_LABELS[level]}
            </Badge>
            {isHeadCoach && (
              <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20">
                Head Coach
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline justify-center gap-2">
          <span className="text-2xl font-bold tracking-tight tabular-nums">{totalPayout} KWD</span>
          <span className="text-sm text-muted-foreground">/ month</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1 text-center">
          {clientCount} active client{clientCount !== 1 ? "s" : ""}
        </p>
      </CardContent>
    </Card>
  );
});
