import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, ChevronRight } from "lucide-react";

interface ServiceCount {
  serviceName: string;
  serviceType: string;
  count: number;
}

export function SubscriptionBreakdown() {
  const navigate = useNavigate();
  const [breakdown, setBreakdown] = useState<ServiceCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const loadBreakdown = useCallback(async () => {
    try {
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("service_id, services(name, type)")
        .eq("status", "active");

      if (subs) {
        const counts = new Map<string, ServiceCount>();

        for (const sub of subs) {
          const service = sub.services as { name: string; type: string } | null;
          const name = service?.name || "Unknown";
          const existing = counts.get(name);

          if (existing) {
            existing.count++;
          } else {
            counts.set(name, {
              serviceName: name,
              serviceType: service?.type || "unknown",
              count: 1,
            });
          }
        }

        const result = Array.from(counts.values()).sort((a, b) => b.count - a.count);
        setBreakdown(result);
        setTotal(subs.length);
      }
    } catch (error) {
      console.error("Error loading subscription breakdown:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBreakdown();
  }, [loadBreakdown]);

  const getBarColor = (index: number) => {
    const colors = [
      "bg-blue-500",
      "bg-green-500",
      "bg-purple-500",
      "bg-orange-500",
      "bg-pink-500",
    ];
    return colors[index % colors.length];
  };

  const getTypeLabel = (type: string) => {
    return type === "team" ? "Team" : "1:1";
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-5 w-40 bg-muted rounded" />
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-32 bg-muted rounded" />
                <div className="h-3 w-full bg-muted rounded" />
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
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Subscriptions
          <span className="text-muted-foreground font-normal">({total} active)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {breakdown.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No active subscriptions found
          </p>
        ) : (
          breakdown.map((service, index) => (
            <div key={service.serviceName}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{service.serviceName}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {getTypeLabel(service.serviceType)}
                  </span>
                </div>
                <span className="text-sm font-semibold">{service.count}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${getBarColor(index)}`}
                  style={{ width: total > 0 ? `${(service.count / total) * 100}%` : "0%" }}
                />
              </div>
            </div>
          ))
        )}

        <button
          onClick={() => navigate("/admin/clients")}
          className="w-full flex items-center justify-between pt-3 border-t text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          View all clients
          <ChevronRight className="h-4 w-4" />
        </button>
      </CardContent>
    </Card>
  );
}
