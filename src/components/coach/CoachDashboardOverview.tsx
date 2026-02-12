import { useState, useEffect, useCallback, useRef, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Users2, BookOpen, ChevronRight } from "lucide-react";
import { startOfWeek, endOfWeek } from "date-fns";

import { CoachKPIRow } from "./CoachKPIRow";
import { CoachActivityFeed, ActivityItem } from "./CoachActivityFeed";
import { EnhancedCapacityCard } from "./EnhancedCapacityCard";
import { CoachTodaysTasks } from "./CoachTodaysTasks";
import { CoachQuickActions } from "./CoachQuickActions";
import { NeedsAttentionAlerts } from "./NeedsAttentionAlerts";
import { CoachStatsCards } from "./CoachStatsCards";
import { ClientActivityFeed } from "./ClientActivityFeed";
import { CoachCompensationCard } from "./CoachCompensationCard";

interface CoachDashboardOverviewProps {
  coachUserId: string;
  onNavigate?: (section: string, filter?: string) => void;
}

interface DashboardMetrics {
  totalClients: number;
  activeClients: number;
  pendingApprovals: number;
  checkInsDue: number;
  capacityUsedPercent: number | null;
  checkInsDueToday: number;
  inactiveFor14Days: number;
  recentActivity: ActivityItem[];
}

export function CoachDashboardOverview({ coachUserId, onNavigate }: CoachDashboardOverviewProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalClients: 0,
    activeClients: 0,
    pendingApprovals: 0,
    checkInsDue: 0,
    capacityUsedPercent: null,
    checkInsDueToday: 0,
    inactiveFor14Days: 0,
    recentActivity: [],
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

      // Build recent activity feed
      const recentActivity: ActivityItem[] = [];
      const weekStart = startOfWeek(new Date());
      const weekEnd = endOfWeek(new Date());

      // Add pending client approvals
      const { data: pendingSubs } = await supabase
        .from("subscriptions")
        .select(`
          id,
          user_id,
          created_at,
          services!inner(name)
        `)
        .eq("coach_id", coachUserId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5);

      // Fetch profile names separately
      for (const sub of pendingSubs || []) {
        const { data: profile } = await supabase
          .from("profiles_public")
          .select("first_name, display_name")
          .eq("id", sub.user_id)
          .single();
        
        const clientName = profile?.display_name || profile?.first_name || 'Unknown';
        
        recentActivity.push({
          id: sub.id,
          type: 'approval',
          clientName,
          timestamp: sub.created_at,
          description: `Awaiting approval for ${(sub.services as any)?.name || 'service'}`,
        });
      }

      // Add new clients from this week using subscriptionsWithProfiles
      for (const sub of subscriptionsWithProfiles) {
        const createdDate = new Date(sub.created_at);
        if (createdDate >= weekStart && createdDate <= weekEnd && sub.status === 'active') {
          const clientName = sub.profile?.display_name || sub.profile?.first_name || 'Unknown';
          
          recentActivity.push({
            id: `new-${sub.id}`,
            type: 'new_client',
            clientName,
            timestamp: sub.created_at,
            description: 'New client assigned',
          });
        }
      }

      // Get recent nutrition adjustments
      const { data: recentAdjustments } = await supabase
        .from("nutrition_adjustments")
        .select(`
          id,
          created_at,
          status,
          nutrition_phases!inner(
            id,
            user_id,
            coach_id
          )
        `)
        .eq("nutrition_phases.coach_id", coachUserId)
        .order("created_at", { ascending: false })
        .limit(5);

      for (const adj of recentAdjustments || []) {
        const userId = (adj.nutrition_phases as any)?.user_id;
        let clientName = 'Unknown';
        if (userId) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("first_name, last_name, full_name")
            .eq("id", userId)
            .maybeSingle();
          clientName = profile?.full_name ||
            (profile?.first_name && profile?.last_name
              ? `${profile.first_name} ${profile.last_name}`
              : 'Unknown');
        }
        recentActivity.push({
          id: adj.id,
          type: 'nutrition_update',
          clientName,
          timestamp: adj.created_at,
          description: `Nutrition adjustment ${adj.status}`,
        });
      }

      // Sort by timestamp
      recentActivity.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setMetrics({
        totalClients,
        activeClients,
        pendingApprovals,
        checkInsDue,
        capacityUsedPercent: null, // Will be set by EnhancedCapacityCard
        checkInsDueToday,
        inactiveFor14Days,
        recentActivity: recentActivity.slice(0, 10),
      });

    } catch (error: any) {
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
    if (coachUserId) {
      fetchDashboardMetrics();
    }
  }, [coachUserId, fetchDashboardMetrics]);

  const handleCapacityMetricsLoaded = (totalActive: number, totalCapacity: number | null, loadPercent: number | null) => {
    setMetrics(prev => ({
      ...prev,
      capacityUsedPercent: loadPercent,
    }));
  };

  const handleNavigate = (section: string, filter?: string) => {
    if (onNavigate) {
      onNavigate(section, filter);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-full overflow-hidden">
      {/* Needs Attention Alerts - Top Priority */}
      <NeedsAttentionAlerts
        coachUserId={coachUserId}
        onNavigate={handleNavigate}
      />

      {/* Stats Cards */}
      <CoachStatsCards coachId={coachUserId} />

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          <CoachQuickActions
            pendingCount={metrics.pendingApprovals}
            activeCount={metrics.activeClients}
            checkInsCount={metrics.checkInsDue}
          />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <ClientActivityFeed coachId={coachUserId} limit={8} />
        </div>
      </div>

      {/* KPI Row - Horizontal scroll on mobile with snap */}
      <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 md:overflow-visible">
        <div className="min-w-max md:min-w-0 snap-x snap-mandatory">
          <CoachKPIRow
            metrics={{
              totalClients: metrics.totalClients,
              activeClients: metrics.activeClients,
              pendingApprovals: metrics.pendingApprovals,
              checkInsDue: metrics.checkInsDue,
              capacityUsedPercent: metrics.capacityUsedPercent,
            }}
            onNavigate={handleNavigate}
          />
        </div>
      </div>

      {/* Legacy Activity Feed */}
      <CoachActivityFeed
        activities={metrics.recentActivity}
        maxItems={5}
      />

      {/* Two Column Layout for Capacity & Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EnhancedCapacityCard
          coachUserId={coachUserId}
          onNavigate={handleNavigate}
          onMetricsLoaded={handleCapacityMetricsLoaded}
        />

        <CoachTodaysTasks
          checkInsDueToday={metrics.checkInsDueToday}
          inactiveFor14Days={metrics.inactiveFor14Days}
          pendingApprovals={metrics.pendingApprovals}
          onNavigate={handleNavigate}
        />
      </div>

      {/* Compensation Card */}
      <CoachCompensationCard coachUserId={coachUserId} />

      {/* Teams Summary Card (head coaches only) */}
      <CoachTeamsSummaryCard coachUserId={coachUserId} onNavigate={handleNavigate} />
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
        .select("id, service_id")
        .eq("coach_id", coachUserId)
        .eq("is_active", true);

      setTeamCount(teams?.length || 0);

      // Count total members across all team services
      if (teams && teams.length > 0) {
        const serviceIds = [...new Set(teams.map((t) => t.service_id))];
        const { count } = await supabase
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("coach_id", coachUserId)
          .in("service_id", serviceIds)
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
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onNavigate("teams")}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users2 className="h-4 w-4" />
            My Teams
          </CardTitle>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
        <CardDescription>Team plan management</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          <div>
            <p className="text-2xl font-bold">{teamCount}</p>
            <p className="text-xs text-muted-foreground">Teams</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{totalMembers}</p>
            <p className="text-xs text-muted-foreground">Total Members</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
