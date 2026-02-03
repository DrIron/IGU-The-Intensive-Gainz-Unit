import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { Users, ChevronRight } from "lucide-react";

interface CoachWorkload {
  coachId: string;
  name: string;
  clientCount: number;
  maxCapacity: number;
}

export function CoachWorkloadPanel() {
  const navigate = useNavigate();
  const [coaches, setCoaches] = useState<CoachWorkload[]>([]);
  const [loading, setLoading] = useState(true);

  const loadWorkload = useCallback(async () => {
    try {
      const { data: coachData } = await supabase
        .from("coaches")
        .select("user_id, first_name, last_name, max_onetoone_clients, max_team_clients")
        .eq("status", "active");

      if (!coachData) {
        setLoading(false);
        return;
      }

      const workloads: CoachWorkload[] = [];

      for (const coach of coachData) {
        const { count } = await supabase
          .from("subscriptions")
          .select("*", { count: "exact", head: true })
          .eq("coach_id", coach.user_id)
          .eq("status", "active");

        // Combine max capacities for overall workload view
        const maxCapacity = (coach.max_onetoone_clients || 10) + (coach.max_team_clients || 20);

        workloads.push({
          coachId: coach.user_id,
          name: `${coach.first_name || ""} ${coach.last_name || ""}`.trim() || "Unnamed Coach",
          clientCount: count || 0,
          maxCapacity,
        });
      }

      setCoaches(workloads.sort((a, b) => b.clientCount - a.clientCount));
    } catch (error) {
      console.error("Error loading coach workload:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkload();
  }, [loadWorkload]);

  const totalClients = coaches.reduce((sum, c) => sum + c.clientCount, 0);
  const totalCapacity = coaches.reduce((sum, c) => sum + c.maxCapacity, 0);
  const utilization = totalCapacity > 0 ? Math.round((totalClients / totalCapacity) * 100) : 0;

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getUtilColor = (percent: number) => {
    if (percent >= 90) return "text-red-600";
    if (percent >= 70) return "text-orange-600";
    return "text-green-600";
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-5 w-32 bg-muted rounded" />
            {[1, 2].map(i => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-10 w-10 bg-muted rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 bg-muted rounded" />
                  <div className="h-2 w-full bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Coach Workload
          </CardTitle>
          <span className={`text-sm font-semibold ${getUtilColor(utilization)}`}>
            {utilization}% capacity
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {coaches.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No active coaches
          </p>
        ) : (
          coaches.map((coach) => {
            const percent = coach.maxCapacity > 0
              ? Math.round((coach.clientCount / coach.maxCapacity) * 100)
              : 0;

            return (
              <div key={coach.coachId} className="space-y-2">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {getInitials(coach.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{coach.name}</p>
                      <span className="text-xs text-muted-foreground">
                        {coach.clientCount}/{coach.maxCapacity}
                      </span>
                    </div>
                    <Progress
                      value={percent}
                      className={`h-1.5 mt-1 ${percent >= 90 ? "[&>div]:bg-red-500" : percent >= 70 ? "[&>div]:bg-orange-500" : ""}`}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}

        <button
          onClick={() => navigate("/admin/coaches")}
          className="w-full flex items-center justify-between pt-3 border-t text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Manage coaches
          <ChevronRight className="h-4 w-4" />
        </button>
      </CardContent>
    </Card>
  );
}
