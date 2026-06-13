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

      // Monthly revenue from active subscriptions.
      // Realized revenue = what was actually charged (subscriptions.client_price_kwd).
      // services.price_kwd is only the public "from"/junior price now, so summing it
      // understates Senior/Lead clients. Legacy rows (null client_price_kwd, pre-dating
      // the column) fall back to the level price tables, then the flat "from" price.
      const { data: activeSubs, error: activeSubsError } = await supabase
        .from("subscriptions")
        .select("service_id, client_price_kwd, coach_id, coach_level_at_purchase")
        .eq("status", "active");
      if (activeSubsError) throw activeSubsError;

      let monthlyRevenue = 0;
      if (activeSubs && activeSubs.length > 0) {
        const legacySubs = activeSubs.filter(s => s.client_price_kwd == null && s.service_id);

        // Resolve fallbacks only for legacy rows.
        const levelPriceById = new Map<string, number>(); // `${service_id}:${level}`
        const flatPriceById = new Map<string, number>();
        const coachLevelById = new Map<string, string>();
        if (legacySubs.length > 0) {
          const serviceIds = Array.from(new Set(legacySubs.map(s => s.service_id as string)));
          const coachIds = Array.from(
            new Set(legacySubs.map(s => s.coach_id).filter((id): id is string => !!id))
          );

          const [{ data: levelPrices }, { data: services }, { data: coaches }] = await Promise.all([
            supabase.from("service_level_pricing").select("service_id, coach_level, price_kwd").in("service_id", serviceIds),
            supabase.from("services").select("id, price_kwd").in("id", serviceIds),
            coachIds.length > 0
              ? supabase.from("coaches_public").select("user_id, coach_level").in("user_id", coachIds)
              : Promise.resolve({ data: [] as { user_id: string; coach_level: string | null }[] }),
          ]);

          for (const lp of levelPrices ?? []) {
            if (lp.price_kwd != null) levelPriceById.set(`${lp.service_id}:${lp.coach_level}`, Number(lp.price_kwd));
          }
          for (const svc of services ?? []) {
            if (svc.price_kwd != null) flatPriceById.set(svc.id, Number(svc.price_kwd));
          }
          for (const c of coaches ?? []) {
            if (c.coach_level) coachLevelById.set(c.user_id, c.coach_level);
          }
        }

        for (const sub of activeSubs) {
          if (sub.client_price_kwd != null) {
            monthlyRevenue += Number(sub.client_price_kwd);
          } else if (sub.service_id) {
            const level = sub.coach_level_at_purchase
              ?? (sub.coach_id ? coachLevelById.get(sub.coach_id) : undefined)
              ?? "junior";
            const price = levelPriceById.get(`${sub.service_id}:${level}`)
              ?? flatPriceById.get(sub.service_id);
            if (price) monthlyRevenue += price;
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
          className="cursor-pointer hover:shadow-md transition-shadow hover:border-primary/30 h-full"
          onClick={card.onClick}
        >
          <CardContent className="h-full p-4 md:p-6 flex items-center gap-4">
            <div className={`inline-flex items-center justify-center p-2.5 rounded-lg ${card.color} shrink-0`}>
              <card.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold leading-tight">{card.value}</p>
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
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
