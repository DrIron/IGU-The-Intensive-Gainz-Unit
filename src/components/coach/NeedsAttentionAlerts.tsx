import { useState, useEffect } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, UserCheck, Scale, Activity, ChevronRight, Bell, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";

interface NeedsAttentionAlertsProps {
  coachUserId: string;
  onNavigate?: (section: string, filter?: string) => void;
}

interface AttentionMetrics {
  pendingApprovals: number;
  nutritionAdjustmentsPending: number;
  clientsNoLogThisWeek: number;
}

export function NeedsAttentionAlerts({ coachUserId, onNavigate }: NeedsAttentionAlertsProps) {
  const [metrics, setMetrics] = useState<AttentionMetrics>({
    pendingApprovals: 0,
    nutritionAdjustmentsPending: 0,
    clientsNoLogThisWeek: 0,
  });
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (coachUserId) {
      fetchAttentionMetrics();
    }
  }, [coachUserId]);

  const fetchAttentionMetrics = async () => {
    try {
      // Get pending approvals count
      const { count: pendingCount } = await supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("coach_id", coachUserId)
        .eq("status", "pending");

      // Get pending nutrition adjustments
      const { count: nutritionCount } = await supabase
        .from("nutrition_adjustments")
        .select(`
          id,
          nutrition_phases!inner(coach_id)
        `, { count: "exact", head: true })
        .eq("nutrition_phases.coach_id", coachUserId)
        .eq("status", "pending");

      // Get clients with no weight logs this week
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);

      const { data: activePhases } = await supabase
        .from("nutrition_phases")
        .select("id, user_id")
        .eq("coach_id", coachUserId)
        .eq("is_active", true);

      let noLogCount = 0;
      if (activePhases && activePhases.length > 0) {
        for (const phase of activePhases) {
          const { data: recentLogs } = await supabase
            .from("weight_logs")
            .select("id")
            .eq("phase_id", phase.id)
            .gte("log_date", weekStart.toISOString())
            .limit(1);

          if (!recentLogs || recentLogs.length === 0) {
            noLogCount++;
          }
        }
      }

      setMetrics({
        pendingApprovals: pendingCount || 0,
        nutritionAdjustmentsPending: nutritionCount || 0,
        clientsNoLogThisWeek: noLogCount,
      });
    } catch (error) {
      console.error("Error fetching attention metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (section: string, filter?: string) => {
    if (onNavigate) {
      onNavigate(section, filter);
    } else {
      // Fallback navigation
      if (section === 'clients' && filter === 'pending') {
        navigate('/coach/clients?filter=pending');
      } else if (section === 'nutrition') {
        navigate('/coach/nutrition');
      } else {
        navigate(`/coach/${section}`);
      }
    }
  };

  const totalAttentionItems = metrics.pendingApprovals + metrics.nutritionAdjustmentsPending + metrics.clientsNoLogThisWeek;

  if (loading) {
    return <Skeleton className="h-24 w-full" />;
  }

  // Nothing needs attention
  if (totalAttentionItems === 0 || dismissed) {
    return null;
  }

  const alertItems = [
    {
      count: metrics.pendingApprovals,
      label: "Pending Approvals",
      icon: UserCheck,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/30",
      action: () => handleNavigate('clients', 'pending'),
    },
    {
      count: metrics.nutritionAdjustmentsPending,
      label: "Nutrition Adjustments",
      icon: Scale,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      borderColor: "border-orange-500/30",
      action: () => handleNavigate('nutrition'),
    },
    {
      count: metrics.clientsNoLogThisWeek,
      label: "Clients Inactive 7+ Days",
      icon: Activity,
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
      borderColor: "border-yellow-500/30",
      action: () => handleNavigate('clients', 'inactive'),
    },
  ].filter(item => item.count > 0);

  return (
    <Card className="border-2 border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-background">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-amber-500/20">
              <Bell className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                Needs Your Attention
                <Badge variant="secondary" className="bg-amber-500/20 text-amber-600">
                  {totalAttentionItems} {totalAttentionItems === 1 ? 'item' : 'items'}
                </Badge>
              </h3>
              <p className="text-sm text-muted-foreground">
                Review these items to keep your clients on track
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => setDismissed(true)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 mt-4">
          {alertItems.map((item, index) => (
            <button
              key={index}
              onClick={item.action}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all hover:scale-[1.02] ${item.bgColor} ${item.borderColor}`}
            >
              <div className={`p-1.5 rounded-full ${item.bgColor}`}>
                <item.icon className={`h-4 w-4 ${item.color}`} />
              </div>
              <div className="text-left">
                <p className={`text-2xl font-bold ${item.color}`}>{item.count}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
              <ChevronRight className={`h-4 w-4 ${item.color} ml-2`} />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
