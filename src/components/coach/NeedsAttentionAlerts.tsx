import { useState, useEffect, useCallback } from "react";
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
  // Track the actual user_ids so a single-item alert can deep-link straight
  // to that client's overview instead of dumping the coach on the full list.
  nutritionAdjustmentClientIds: string[];
  inactiveClientIds: string[];
}

export function NeedsAttentionAlerts({ coachUserId, onNavigate }: NeedsAttentionAlertsProps) {
  const [metrics, setMetrics] = useState<AttentionMetrics>({
    pendingApprovals: 0,
    nutritionAdjustmentsPending: 0,
    clientsNoLogThisWeek: 0,
    nutritionAdjustmentClientIds: [],
    inactiveClientIds: [],
  });
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  const fetchAttentionMetrics = useCallback(async () => {
    try {
      // Get pending approvals count
      const { count: pendingCount } = await supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("coach_id", coachUserId)
        .eq("status", "pending");

      // Get pending nutrition adjustments + collect the client user_ids so
      // the alert can deep-link to a single client when only one is pending.
      const { data: pendingAdjustments } = await supabase
        .from("nutrition_adjustments")
        .select(`
          id,
          nutrition_phases!inner(coach_id, user_id)
        `)
        .eq("nutrition_phases.coach_id", coachUserId)
        .eq("status", "pending");

      const adjustmentClientIds = Array.from(
        new Set(
          (pendingAdjustments ?? [])
            // PostgREST FK joins return the related row inline; types can
            // surface it as either a single object or an array depending on
            // the relationship cardinality, so normalise both shapes.
            .map(row => {
              const phase = row.nutrition_phases as { user_id?: string } | { user_id?: string }[] | null;
              if (!phase) return null;
              if (Array.isArray(phase)) return phase[0]?.user_id ?? null;
              return phase.user_id ?? null;
            })
            .filter((id): id is string => !!id),
        ),
      );

      // Get clients with no weight logs this week
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);

      const { data: activePhases } = await supabase
        .from("nutrition_phases")
        .select("id, user_id")
        .eq("coach_id", coachUserId)
        .eq("is_active", true);

      const inactiveIds: string[] = [];
      if (activePhases && activePhases.length > 0) {
        for (const phase of activePhases) {
          const { data: recentLogs } = await supabase
            .from("weight_logs")
            .select("id")
            .eq("phase_id", phase.id)
            .gte("log_date", weekStart.toISOString())
            .limit(1);

          if (!recentLogs || recentLogs.length === 0) {
            inactiveIds.push(phase.user_id);
          }
        }
      }

      setMetrics({
        pendingApprovals: pendingCount || 0,
        nutritionAdjustmentsPending: adjustmentClientIds.length,
        clientsNoLogThisWeek: inactiveIds.length,
        nutritionAdjustmentClientIds: adjustmentClientIds,
        inactiveClientIds: inactiveIds,
      });
    } catch (error) {
      console.error("Error fetching attention metrics:", error);
    } finally {
      setLoading(false);
    }
  }, [coachUserId]);

  useEffect(() => {
    if (coachUserId) {
      fetchAttentionMetrics();
    }
  }, [coachUserId, fetchAttentionMetrics]);

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
      label: metrics.nutritionAdjustmentsPending === 1 ? "Nutrition Adjustment" : "Nutrition Adjustments",
      icon: Scale,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      borderColor: "border-orange-500/30",
      action: () => {
        // Single-client case: open that client's Nutrition tab, which is
        // where the Adjustments review surface lives.
        if (metrics.nutritionAdjustmentClientIds.length === 1) {
          navigate(`/coach/clients/${metrics.nutritionAdjustmentClientIds[0]}?tab=nutrition`);
          return;
        }
        handleNavigate('nutrition');
      },
    },
    {
      count: metrics.clientsNoLogThisWeek,
      label: metrics.clientsNoLogThisWeek === 1 ? "Client Inactive 7+ Days" : "Clients Inactive 7+ Days",
      icon: Activity,
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
      borderColor: "border-yellow-500/30",
      action: () => {
        // Single-client case: open that client's Nutrition tab so the coach
        // immediately sees the missing weigh-in instead of guessing from a
        // generic list (the list page's "at-risk" filter uses a different
        // definition than no-weight-log-this-week, so a query-string filter
        // wouldn't even surface the right person).
        if (metrics.inactiveClientIds.length === 1) {
          navigate(`/coach/clients/${metrics.inactiveClientIds[0]}?tab=nutrition`);
          return;
        }
        handleNavigate('clients', 'inactive');
      },
    },
  ].filter(item => item.count > 0);

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center p-2 rounded-full bg-amber-500/15">
              <Bell className="h-4 w-4 text-amber-500" />
            </div>
            <div className="leading-tight">
              <h3 className="font-semibold text-sm">Needs Your Attention</h3>
              <p className="text-xs text-muted-foreground">
                {totalAttentionItems} {totalAttentionItems === 1 ? 'item' : 'items'} to review
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 flex-1">
            {alertItems.map((item, index) => (
              <button
                key={index}
                onClick={item.action}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-colors hover:bg-background/40 ${item.bgColor} ${item.borderColor}`}
              >
                <item.icon className={`h-4 w-4 ${item.color}`} />
                <span className={`font-semibold ${item.color}`}>{item.count}</span>
                <span className="text-muted-foreground">{item.label}</span>
                <ChevronRight className={`h-3.5 w-3.5 ${item.color}`} />
              </button>
            ))}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground ml-auto"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
