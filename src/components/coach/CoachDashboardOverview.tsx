import { useState, useEffect, useCallback, useRef, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ClickableCard } from "@/components/ui/clickable-card";
import { Loader2, Users2, ChevronRight, Award, Dumbbell, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { startOfWeek, endOfWeek } from "date-fns";
import { cn } from "@/lib/utils";

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
  inactiveFor14Days: number;
  programsCreated: number;
  workoutsThisWeek: number;
}

export function CoachDashboardOverview({ coachUserId, onNavigate }: CoachDashboardOverviewProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalClients: 0,
    activeClients: 0,
    pendingApprovals: 0,
    checkInsDue: 0,
    checkInsDueToday: 0,
    inactiveFor14Days: 0,
    programsCreated: 0,
    workoutsThisWeek: 0,
  });

  const fetchDashboardMetrics = useCallback(async () => {
    try {
      setLoading(true);

      // Get all subscriptions for this coach
      // Use separate queries to avoid view FK issues
      const { data: allSubscriptions, error: allSubsError } = await supabase
        .from("subscriptions")
        .select(`
          id,
          user_id,
          status,
          created_at
        `)
        .eq("coach_id", coachUserId);

      if (allSubsError) throw allSubsError;

      // Fetch profiles_public separately for each assigned client
      // RLS allows coaches to read profiles of clients they're assigned to
      const subscriptionsWithProfiles = await Promise.all(
        (allSubscriptions || []).map(async (sub) => {
          const { data: profile } = await supabase
            .from("profiles_public")
            .select("id, first_name, display_name, status")
            .eq("id", sub.user_id)
            .maybeSingle();
          return { ...sub, profile };
        })
      );

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

      // Count clients who haven't logged weight in the last 7 days
      let checkInsDue = 0;
      let checkInsDueToday = 0;
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      if (nutritionPhases && nutritionPhases.length > 0) {
        for (const phase of nutritionPhases) {
          const { data: recentLogs } = await supabase
            .from("weight_logs")
            .select("id, log_date")
            .eq("phase_id", phase.id)
            .gte("log_date", sevenDaysAgo.toISOString())
            .order("log_date", { ascending: false })
            .limit(1);

          if (!recentLogs || recentLogs.length === 0) {
            checkInsDue++;
            // Check if last log was exactly 7 days ago (due today)
            const { data: lastLog } = await supabase
              .from("weight_logs")
              .select("log_date")
              .eq("phase_id", phase.id)
              .order("log_date", { ascending: false })
              .limit(1);
            
            if (lastLog && lastLog.length > 0) {
              const lastLogDate = new Date(lastLog[0].log_date);
              const daysSinceLog = Math.floor((Date.now() - lastLogDate.getTime()) / (1000 * 60 * 60 * 24));
              if (daysSinceLog === 7) {
                checkInsDueToday++;
              }
            }
          }
        }
      }

      // Count clients inactive for 14+ days
      let inactiveFor14Days = 0;
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      if (nutritionPhases && nutritionPhases.length > 0) {
        for (const phase of nutritionPhases) {
          const { data: recentLogs } = await supabase
            .from("weight_logs")
            .select("id")
            .eq("phase_id", phase.id)
            .gte("log_date", fourteenDaysAgo.toISOString())
            .limit(1);

          if (!recentLogs || recentLogs.length === 0) {
            inactiveFor14Days++;
          }
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
      const weekStart = startOfWeek(new Date());
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
        coachUserId={coachUserId}
        onNavigate={handleNavigate}
      />

      {/* 2. Stats Row — compact, non-redundant KPIs */}
      <CoachOverviewStats metrics={metrics} onNavigate={handleNavigate} />

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
        <div className="flex items-center gap-6">
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
  onNavigate: (section: string, filter?: string) => void;
}

const CoachOverviewStats = memo(function CoachOverviewStats({ metrics, onNavigate }: CoachOverviewStatsProps) {
  const stats = [
    {
      label: "Active Clients",
      value: metrics.activeClients,
      icon: Users2,
      color: "text-blue-600 bg-blue-100 dark:bg-blue-900/50",
      onClick: () => onNavigate("clients", "active"),
    },
    {
      label: "Programs Created",
      value: metrics.programsCreated,
      icon: Dumbbell,
      color: "text-purple-600 bg-purple-100 dark:bg-purple-900/50",
      onClick: () => onNavigate("programs"),
    },
    {
      label: "Workouts This Week",
      value: metrics.workoutsThisWeek,
      icon: TrendingUp,
      color: "text-green-600 bg-green-100 dark:bg-green-900/50",
      onClick: () => onNavigate("clients"),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {stats.map((stat) => (
        <ClickableCard
          key={stat.label}
          ariaLabel={`${stat.label}: ${stat.value}`}
          onClick={stat.onClick}
        >
          <CardContent className="p-4">
            <div className={`inline-flex p-2 rounded-lg ${stat.color} mb-3`}>
              <stat.icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-2xl font-bold tabular-nums">{stat.value}</p>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
          </CardContent>
        </ClickableCard>
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

      const { data: subs, error: subsError } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("coach_id", coachUserId)
        .eq("status", "active");
      if (subsError) throw subsError;

      if (!subs || subs.length === 0) {
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
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight tabular-nums">{totalPayout} KWD</span>
          <span className="text-sm text-muted-foreground">/ month</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {clientCount} active client{clientCount !== 1 ? "s" : ""}
        </p>
      </CardContent>
    </Card>
  );
});
