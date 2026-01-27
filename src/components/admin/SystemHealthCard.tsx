import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, CreditCard, Clock, CheckCircle } from "lucide-react";
import { subDays } from "date-fns";

interface HealthMetrics {
  paymentFailures7d: number;
  stuckMedicalReview: number;
  stuckCoachApproval: number;
  stuckPendingPayment: number;
}

export function SystemHealthCard() {
  const [metrics, setMetrics] = useState<HealthMetrics>({
    paymentFailures7d: 0,
    stuckMedicalReview: 0,
    stuckCoachApproval: 0,
    stuckPendingPayment: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHealthMetrics();
  }, []);

  const fetchHealthMetrics = async () => {
    try {
      const sevenDaysAgo = subDays(new Date(), 7);
      const threeDaysAgo = subDays(new Date(), 3);
      const fiveDaysAgo = subDays(new Date(), 5);
      const now = new Date();

      // Payment failures in last 7 days
      const { count: paymentFailures } = await supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .not("payment_failed_at", "is", null)
        .gte("payment_failed_at", sevenDaysAgo.toISOString());

      // Stuck in medical review (> 7 days) - use profiles_public for admin counts
      const { count: stuckMedical } = await supabase
        .from("profiles_public")
        .select("*", { count: "exact", head: true })
        .eq("status", "needs_medical_review")
        .lt("updated_at", sevenDaysAgo.toISOString());

      // Stuck in coach approval (> 3 days)
      const { count: stuckCoach } = await supabase
        .from("profiles_public")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending_coach_approval")
        .lt("updated_at", threeDaysAgo.toISOString());

      // Stuck in pending payment (> 5 days) - includes legacy 'approved' status
      const { count: stuckPayment1 } = await supabase
        .from("profiles_public")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending_payment")
        .lt("updated_at", fiveDaysAgo.toISOString());

      const { count: stuckPayment2 } = await supabase
        .from("profiles_public")
        .select("*", { count: "exact", head: true })
        .eq("status", "approved")
        .lt("updated_at", fiveDaysAgo.toISOString());

      setMetrics({
        paymentFailures7d: paymentFailures || 0,
        stuckMedicalReview: stuckMedical || 0,
        stuckCoachApproval: stuckCoach || 0,
        stuckPendingPayment: (stuckPayment1 || 0) + (stuckPayment2 || 0),
      });
    } catch (error) {
      console.error("Error fetching health metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalIssues = 
    metrics.paymentFailures7d + 
    metrics.stuckMedicalReview + 
    metrics.stuckCoachApproval + 
    metrics.stuckPendingPayment;

  const getStatusColor = () => {
    if (totalIssues === 0) return "text-green-600";
    if (totalIssues <= 3) return "text-amber-600";
    return "text-red-600";
  };

  const getStatusBadge = () => {
    if (totalIssues === 0) {
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          <CheckCircle className="h-3 w-3 mr-1" />
          All Clear
        </Badge>
      );
    }
    if (totalIssues <= 3) {
      return (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
          <AlertTriangle className="h-3 w-3 mr-1" />
          {totalIssues} Issue{totalIssues > 1 ? "s" : ""}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
        <AlertTriangle className="h-3 w-3 mr-1" />
        {totalIssues} Issues
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              System Health
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className={`h-5 w-5 ${getStatusColor()}`} />
            System Health
          </CardTitle>
          {getStatusBadge()}
        </div>
        <CardDescription>
          Quick snapshot of potential issues
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <HealthMetricRow
          icon={CreditCard}
          label="Payment failures (7d)"
          value={metrics.paymentFailures7d}
          threshold={0}
        />
        <HealthMetricRow
          icon={Clock}
          label="Stuck in medical review"
          value={metrics.stuckMedicalReview}
          threshold={0}
          sublabel="> 7 days"
        />
        <HealthMetricRow
          icon={Clock}
          label="Stuck waiting for coach"
          value={metrics.stuckCoachApproval}
          threshold={0}
          sublabel="> 3 days"
        />
        <HealthMetricRow
          icon={Clock}
          label="Stuck pending payment"
          value={metrics.stuckPendingPayment}
          threshold={0}
          sublabel="> 5 days"
        />
      </CardContent>
    </Card>
  );
}

function HealthMetricRow({
  icon: Icon,
  label,
  value,
  threshold,
  sublabel,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  threshold: number;
  sublabel?: string;
}) {
  const isOk = value <= threshold;
  
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${isOk ? "text-muted-foreground" : "text-amber-600"}`} />
        <div>
          <span className="text-sm">{label}</span>
          {sublabel && (
            <span className="text-xs text-muted-foreground ml-1">({sublabel})</span>
          )}
        </div>
      </div>
      <Badge 
        variant={isOk ? "secondary" : "destructive"}
        className={isOk ? "bg-green-50 text-green-700" : ""}
      >
        {value}
      </Badge>
    </div>
  );
}
