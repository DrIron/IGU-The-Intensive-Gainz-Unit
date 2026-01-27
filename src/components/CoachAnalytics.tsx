import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Users, Clock, FileCheck, CheckSquare } from "lucide-react";

interface CoachAnalyticsData {
  total_clients: number;
  active_clients: number;
  pending_documents: number;
  pending_requests: number;
  new_clients_week: number;
}

export function CoachAnalytics() {
  const [analytics, setAnalytics] = useState<CoachAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.rpc('get_coach_analytics', {
        coach_user_id: user.id
      });
      
      if (error) throw error;
      
      if (data && Array.isArray(data) && data.length > 0) {
        setAnalytics(data[0]);
      }
    } catch (error) {
      console.error('Error fetching coach analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-muted-foreground">Loading analytics...</div>;
  }

  if (!analytics) {
    return <div className="text-muted-foreground">No analytics data available</div>;
  }

  const stats = [
    {
      title: "Total Clients",
      value: analytics.total_clients,
      icon: Users,
      color: "text-primary"
    },
    {
      title: "Active Clients",
      value: analytics.active_clients,
      icon: Users,
      color: "text-green-500"
    },
    {
      title: "New Clients This Week",
      value: analytics.new_clients_week,
      icon: TrendingUp,
      color: "text-blue-500"
    },
    {
      title: "Pending Documents",
      value: analytics.pending_documents,
      icon: FileCheck,
      color: "text-orange-500"
    },
    {
      title: "Pending Requests",
      value: analytics.pending_requests,
      icon: CheckSquare,
      color: "text-purple-500"
    }
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title} className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <Icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
