import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Users, UserCheck, CreditCard, AlertTriangle } from "lucide-react";

interface AdminMetrics {
  activeClients: number;
  activeCoaches: number;
  pendingApprovals: number;
  monthlyRevenue: number;
  newClientsThisMonth: number;
}

export function AdminMetricsCards() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<AdminMetrics>({
    activeClients: 0,
    activeCoaches: 0,
    pendingApprovals: 0,
    monthlyRevenue: 0,
    newClientsThisMonth: 0,
  });
  const [loading, setLoading] = useState(true);

  const loadMetrics = useCallback(async () => {
    try {
      // Active clients (active subscriptions)
      const { count: activeClients } = await supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("status", "active");

      // Active coaches
      const { count: activeCoaches } = await supabase
        .from("coaches")
        .select("*", { count: "exact", head: true })
        .eq("status", "active");

      // Pending approvals (clients awaiting coach approval or payment)
      const { count: pendingApprovals } = await supabase
        .from("profiles_public")
        .select("*", { count: "exact", head: true })
        .in("status", ["pending_coach_approval", "pending_payment", "needs_medical_review"]);

      // Monthly revenue from active subscriptions
      const { data: activeSubs } = await supabase
        .from("subscriptions")
        .select("service_id, services(name, price_kwd)")
        .eq("status", "active");

      let monthlyRevenue = 0;
      if (activeSubs) {
        for (const sub of activeSubs) {
          const service = sub.services as { name: string; price_kwd: number } | null;
          if (service?.price_kwd) {
            monthlyRevenue += service.price_kwd;
          }
        }
      }

      // New clients this month
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const { count: newClientsThisMonth } = await supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .gte("created_at", monthStart.toISOString());

      setMetrics({
        activeClients: activeClients || 0,
        activeCoaches: activeCoaches || 0,
        pendingApprovals: pendingApprovals || 0,
        monthlyRevenue,
        newClientsThisMonth: newClientsThisMonth || 0,
      });
    } catch (error) {
      console.error("Error loading admin metrics:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  const cards = [
    {
      label: "Active Clients",
      value: metrics.activeClients,
      subtitle: metrics.newClientsThisMonth > 0 ? `+${metrics.newClientsThisMonth} this month` : undefined,
      icon: Users,
      color: "text-blue-600 bg-blue-100 dark:bg-blue-900/50",
      onClick: () => navigate("/admin/clients"),
    },
    {
      label: "Active Coaches",
      value: metrics.activeCoaches,
      icon: UserCheck,
      color: "text-green-600 bg-green-100 dark:bg-green-900/50",
      onClick: () => navigate("/admin/coaches"),
    },
    {
      label: "Monthly Revenue",
      value: `${metrics.monthlyRevenue} KWD`,
      icon: CreditCard,
      color: "text-purple-600 bg-purple-100 dark:bg-purple-900/50",
      onClick: () => navigate("/admin/billing"),
    },
    {
      label: "Pending Approvals",
      value: metrics.pendingApprovals,
      subtitle: metrics.pendingApprovals > 0 ? "Action needed" : "All clear",
      icon: AlertTriangle,
      color: metrics.pendingApprovals > 0
        ? "text-red-600 bg-red-100 dark:bg-red-900/50"
        : "text-green-600 bg-green-100 dark:bg-green-900/50",
      onClick: () => navigate("/admin/clients?filter=pending"),
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="animate-pulse space-y-3">
                <div className="h-8 w-8 bg-muted rounded" />
                <div className="h-7 w-16 bg-muted rounded" />
                <div className="h-4 w-24 bg-muted rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card
          key={card.label}
          className="cursor-pointer hover:shadow-md transition-shadow hover:border-primary/30"
          onClick={card.onClick}
        >
          <CardContent className="p-4">
            <div className={`inline-flex p-2 rounded-lg ${card.color} mb-3`}>
              <card.icon className="h-5 w-5" />
            </div>
            <p className="text-2xl font-bold">{card.value}</p>
            <p className="text-sm text-muted-foreground">{card.label}</p>
            {card.subtitle && (
              <p className={`text-xs mt-1 ${
                card.label === "Pending Approvals" && metrics.pendingApprovals > 0
                  ? "text-red-600 dark:text-red-400 font-medium"
                  : "text-muted-foreground"
              }`}>
                {card.subtitle}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
