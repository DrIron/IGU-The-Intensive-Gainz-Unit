import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import {
  Dumbbell,
  Scale,
  CheckCircle2,
  Activity
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ClientActivityFeedProps {
  coachId: string;
  limit?: number;
}

interface ActivityItem {
  id: string;
  type: "workout_completed" | "weight_logged" | "checkin_submitted" | "message";
  clientName: string;
  clientId: string;
  description: string;
  timestamp: Date;
}

export function ClientActivityFeed({ coachId, limit = 10 }: ClientActivityFeedProps) {
  const navigate = useNavigate();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  const loadActivities = useCallback(async () => {
    try {
      // Get my clients
      const { data: myClients } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("coach_id", coachId)
        .eq("status", "active");

      if (!myClients || myClients.length === 0) {
        setActivities([]);
        setLoading(false);
        return;
      }

      const clientIds = myClients.map(c => c.user_id);

      // Fetch profiles for client names
      const { data: profiles } = await supabase
        .from("profiles_public")
        .select("id, first_name, display_name")
        .in("id", clientIds);

      const clientMap = new Map(
        profiles?.map(p => [
          p.id,
          p.display_name || p.first_name || "Client"
        ]) || []
      );

      const allActivities: ActivityItem[] = [];

      // Get recent workout completions
      const { data: workouts } = await supabase
        .from("client_day_modules")
        .select(`
          id,
          completed_at,
          title,
          client_program_days!inner(
            client_programs!inner(user_id)
          )
        `)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(20);

      workouts?.forEach(w => {
        const userId = (w.client_program_days as any)?.client_programs?.user_id;
        if (userId && clientIds.includes(userId)) {
          allActivities.push({
            id: `workout-${w.id}`,
            type: "workout_completed",
            clientName: clientMap.get(userId) || "Client",
            clientId: userId,
            description: `Completed ${w.title || "workout"}`,
            timestamp: new Date(w.completed_at!),
          });
        }
      });

      // Get recent weight logs
      const { data: weights } = await supabase
        .from("weight_logs")
        .select("id, user_id, weight_kg, created_at")
        .in("user_id", clientIds)
        .order("created_at", { ascending: false })
        .limit(20);

      weights?.forEach(w => {
        allActivities.push({
          id: `weight-${w.id}`,
          type: "weight_logged",
          clientName: clientMap.get(w.user_id) || "Client",
          clientId: w.user_id,
          description: `Logged weight: ${w.weight_kg}kg`,
          timestamp: new Date(w.created_at),
        });
      });

      // Sort by timestamp and limit
      allActivities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setActivities(allActivities.slice(0, limit));
    } catch (error) {
      console.error("Error loading activities:", error);
    } finally {
      setLoading(false);
    }
  }, [coachId, limit]);

  useEffect(() => {
    if (!coachId || hasFetched.current) return;
    hasFetched.current = true;
    loadActivities();
  }, [coachId, loadActivities]);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "workout_completed":
        return <Dumbbell className="h-4 w-4 text-green-600" />;
      case "weight_logged":
        return <Scale className="h-4 w-4 text-blue-600" />;
      case "checkin_submitted":
        return <CheckCircle2 className="h-4 w-4 text-purple-600" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-8 w-8 bg-muted rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No recent activity from your clients
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {activities.map((activity) => (
          <button
            key={activity.id}
            onClick={() => navigate(`/coach/clients?client=${activity.clientId}`)}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
          >
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                {getInitials(activity.clientName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <span className="font-medium">{activity.clientName}</span>
                {" · "}
                <span className="text-muted-foreground">{activity.description}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {getActivityIcon(activity.type)}
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
