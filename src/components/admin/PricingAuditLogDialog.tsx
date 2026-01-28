import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, History, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";

interface AuditEntry {
  id: string;
  admin_user_id: string;
  action_type: string;
  target_type: string;
  target_id: string | null;
  details: any;
  before_json: any;
  after_json: any;
  created_at: string;
  admin_name?: string;
}

interface PricingAuditLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TARGET_TYPE_LABELS: Record<string, string> = {
  service_pricing: "Service Pricing",
  payout_rules: "Payout Rule",
  addon_pricing: "Add-on Pricing",
  addon_payout_rules: "Add-on Payout Rule",
  addon_catalog: "Add-on Catalog",
};

const ACTION_TYPE_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pricing_update: "default",
  payout_rule_update: "secondary",
  addon_catalog_update: "outline",
  create: "default",
};

export function PricingAuditLogDialog({ open, onOpenChange }: PricingAuditLogDialogProps) {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      loadAuditLog();
    }
  }, [open]);

  const loadAuditLog = async () => {
    try {
      setLoading(true);
      
      // Filter for pricing-related audit entries
      const { data, error } = await supabase
        .from("admin_audit_log")
        .select("*")
        .in("target_type", [
          "service_pricing",
          "payout_rules",
          "addon_pricing",
          "addon_payout_rules",
          "addon_catalog",
        ])
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      // Get admin names
      const adminIds = [...new Set((data || []).map(d => d.admin_user_id))];
      const adminNames: Record<string, string> = {};
      
      if (adminIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles_public")
          .select("id, display_name, first_name")
          .in("id", adminIds);
        
        profiles?.forEach(p => {
          adminNames[p.id] = p.display_name || p.first_name || "Unknown";
        });
      }

      const enriched: AuditEntry[] = (data || []).map(entry => ({
        ...entry,
        admin_name: adminNames[entry.admin_user_id] || "Unknown",
      }));

      setEntries(enriched);
    } catch (error) {
      console.error("Error loading audit log:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const formatAction = (action: string) => {
    return action
      .split("_")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Pricing & Payouts Audit Log
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No audit entries found for pricing changes.
          </div>
        ) : (
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-3">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="border rounded-lg p-3 bg-card"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={ACTION_TYPE_COLORS[entry.action_type] || "outline"}>
                          {formatAction(entry.action_type)}
                        </Badge>
                        <Badge variant="secondary">
                          {TARGET_TYPE_LABELS[entry.target_type] || entry.target_type}
                        </Badge>
                        {entry.details?.entity_name && (
                          <span className="text-sm font-medium">
                            {entry.details.entity_name}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        by {entry.admin_name} • {format(new Date(entry.created_at), "MMM d, yyyy 'at' h:mm a")}
                      </div>
                    </div>
                    
                    {(entry.before_json || entry.after_json) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpand(entry.id)}
                      >
                        {expandedId === entry.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>

                  {expandedId === entry.id && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      {entry.before_json && (
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">Before:</div>
                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                            {JSON.stringify(entry.before_json, null, 2)}
                          </pre>
                        </div>
                      )}
                      {entry.after_json && (
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">After:</div>
                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                            {JSON.stringify(entry.after_json, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
