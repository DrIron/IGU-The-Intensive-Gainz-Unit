import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  UserCheck,
  CreditCard,
  FileWarning,
  AlertCircle,
  ChevronRight,
  CheckCircle2
} from "lucide-react";

interface AttentionItem {
  id: string;
  type: string;
  title: string;
  description: string;
  count: number;
  priority: "high" | "medium" | "low";
  action: () => void;
  icon: typeof AlertCircle;
}

export function AdminRequiresAttention() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadItems = useCallback(async () => {
    try {
      const attentionItems: AttentionItem[] = [];

      // Pending coach approval
      const { count: pendingCoach } = await supabase
        .from("profiles_public")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending_coach_approval");

      if (pendingCoach && pendingCoach > 0) {
        attentionItems.push({
          id: "pending_coach",
          type: "pending_coach",
          title: "Pending Coach Approval",
          description: `${pendingCoach} client${pendingCoach > 1 ? "s" : ""} awaiting coach assignment`,
          count: pendingCoach,
          priority: "high",
          action: () => navigate("/admin/clients?filter=pending"),
          icon: UserCheck,
        });
      }

      // Medical review needed
      const { count: medicalReview } = await supabase
        .from("profiles_public")
        .select("*", { count: "exact", head: true })
        .eq("status", "needs_medical_review");

      if (medicalReview && medicalReview > 0) {
        attentionItems.push({
          id: "medical_review",
          type: "medical_review",
          title: "Medical Review Required",
          description: `${medicalReview} client${medicalReview > 1 ? "s" : ""} flagged by PAR-Q`,
          count: medicalReview,
          priority: "high",
          action: () => navigate("/admin/clients?filter=medical"),
          icon: FileWarning,
        });
      }

      // Failed or overdue payments
      const { count: paymentIssues } = await supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .in("status", ["past_due", "payment_failed"]);

      if (paymentIssues && paymentIssues > 0) {
        attentionItems.push({
          id: "payment_issues",
          type: "payment_issues",
          title: "Payment Issues",
          description: `${paymentIssues} subscription${paymentIssues > 1 ? "s" : ""} with payment problems`,
          count: paymentIssues,
          priority: "medium",
          action: () => navigate("/admin/billing"),
          icon: CreditCard,
        });
      }

      setItems(attentionItems.sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.priority] - order[b.priority];
      }));
    } catch (error) {
      console.error("Error loading attention items:", error);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  if (loading) {
    return (
      <div className="animate-pulse h-16 bg-muted rounded-lg" />
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
        <div className="p-2 bg-green-100 dark:bg-green-900/50 rounded-full">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
        </div>
        <p className="text-sm text-green-700 dark:text-green-300">
          Everything looks good! No items require your attention.
        </p>
      </div>
    );
  }

  const getPriorityStyles = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800";
      case "medium":
        return "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800";
      default:
        return "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold">Requires Attention</h3>
        <Badge variant="secondary">{items.length}</Badge>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={item.action}
            className={`w-full flex items-center justify-between p-4 rounded-lg border transition-colors hover:opacity-90 ${getPriorityStyles(item.priority)}`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${
                item.priority === "high"
                  ? "bg-red-100 dark:bg-red-900/50 text-red-600"
                  : "bg-orange-100 dark:bg-orange-900/50 text-orange-600"
              }`}>
                <item.icon className="h-4 w-4" />
              </div>
              <div className="text-left">
                <p className="font-medium">{item.title}</p>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}
