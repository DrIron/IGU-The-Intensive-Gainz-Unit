import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Users, Dumbbell, TrendingUp } from "lucide-react";

interface CoachStatsCardsProps {
  coachId: string;
}

interface CoachStats {
  activeClients: number;
  programsCreated: number;
  workoutsCompletedThisWeek: number;
}

export function CoachStatsCards({ coachId }: CoachStatsCardsProps) {
  const [stats, setStats] = useState<CoachStats>({
    activeClients: 0,
    programsCreated: 0,
    workoutsCompletedThisWeek: 0,
  });
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  const loadStats = useCallback(async () => {
    try {
      // Active clients count
      const { count: activeClients } = await supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("coach_id", coachId)
        .eq("status", "active");

      // Programs created
      const { count: programsCreated } = await supabase
        .from("program_templates")
        .select("*", { count: "exact", head: true })
        .eq("owner_coach_id", coachId);

      // Workouts completed this week by my clients
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);

      const { data: myClients } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("coach_id", coachId)
        .eq("status", "active");

      const clientIds = myClients?.map(c => c.user_id) || [];

      let workoutsCompletedThisWeek = 0;
      if (clientIds.length > 0) {
        const { count } = await supabase
          .from("client_day_modules")
          .select("*, client_program_days!inner(client_programs!inner(user_id))", { count: "exact", head: true })
          .in("client_program_days.client_programs.user_id", clientIds)
          .not("completed_at", "is", null)
          .gte("completed_at", weekStart.toISOString());

        workoutsCompletedThisWeek = count || 0;
      }

      setStats({
        activeClients: activeClients || 0,
        programsCreated: programsCreated || 0,
        workoutsCompletedThisWeek,
      });
    } catch (error) {
      console.error("Error loading coach stats:", error);
    } finally {
      setLoading(false);
    }
  }, [coachId]);

  useEffect(() => {
    if (!coachId || hasFetched.current) return;
    hasFetched.current = true;
    loadStats();
  }, [coachId, loadStats]);

  const statCards = [
    {
      label: "Active Clients",
      value: stats.activeClients,
      icon: Users,
      color: "text-blue-600 bg-blue-100 dark:bg-blue-900/50",
    },
    {
      label: "Programs Created",
      value: stats.programsCreated,
      icon: Dumbbell,
      color: "text-purple-600 bg-purple-100 dark:bg-purple-900/50",
    },
    {
      label: "Workouts This Week",
      value: stats.workoutsCompletedThisWeek,
      icon: TrendingUp,
      color: "text-green-600 bg-green-100 dark:bg-green-900/50",
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="animate-pulse space-y-2">
                <div className="h-8 w-8 bg-muted rounded" />
                <div className="h-6 w-12 bg-muted rounded" />
                <div className="h-4 w-20 bg-muted rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {statCards.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-4">
            <div className={`inline-flex p-2 rounded-lg ${stat.color} mb-3`}>
              <stat.icon className="h-5 w-5" />
            </div>
            <p className="text-2xl font-bold">{stat.value}</p>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
