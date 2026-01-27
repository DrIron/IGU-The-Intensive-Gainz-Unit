import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Users, DollarSign, Clock, MessageSquare } from "lucide-react";

interface AnalyticsData {
  new_signups_week: number;
  active_subscriptions: number;
  total_monthly_revenue: number;
  pending_approvals: number;
  pending_testimonials: number;
}

export function AdminAnalytics() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const { data, error } = await supabase.rpc('get_admin_analytics');
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        setAnalytics(data[0]);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div>Loading analytics...</div>;
  }

  if (!analytics) {
    return <div>No analytics data available</div>;
  }

  const stats = [
    {
      title: "New Signups This Week",
      value: analytics.new_signups_week,
      icon: TrendingUp,
      color: "text-blue-500"
    },
    {
      title: "Active Subscriptions",
      value: analytics.active_subscriptions,
      icon: Users,
      color: "text-green-500"
    },
    {
      title: "Monthly Revenue",
      value: `${analytics.total_monthly_revenue} KWD`,
      icon: DollarSign,
      color: "text-yellow-500"
    },
    {
      title: "Pending Approvals",
      value: analytics.pending_approvals,
      icon: Clock,
      color: "text-orange-500"
    },
    {
      title: "Pending Testimonials",
      value: analytics.pending_testimonials,
      icon: MessageSquare,
      color: "text-purple-500"
    }
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title}>
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
