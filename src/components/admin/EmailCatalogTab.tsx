import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronDown, ScrollText, Pencil, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { EmailTemplateEditor } from "./EmailTemplateEditor";

interface EmailType {
  id: string;
  category: string;
  label: string;
  description: string | null;
  edge_function: string;
  is_enabled: boolean;
  subject_template: string | null;
  body_sections: any[] | null;
  sort_order: number;
  sent_count?: number;
  last_sent_at?: string;
}

interface EmailCatalogTabProps {
  onViewLogs: (typeId: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  drip_lead_nurture: "Lead Nurture Drip",
  drip_abandoned_onboarding: "Abandoned Onboarding Drip",
  drip_payment_failure: "Payment Failure Drip",
  drip_lifecycle: "Lifecycle Drip",
  admin_alert: "Admin & Coach Alerts",
  transactional: "Transactional",
};

const CATEGORY_ORDER = [
  "drip_lead_nurture",
  "drip_abandoned_onboarding",
  "drip_payment_failure",
  "drip_lifecycle",
  "admin_alert",
  "transactional",
];

export function EmailCatalogTab({ onViewLogs }: EmailCatalogTabProps) {
  const [emailTypes, setEmailTypes] = useState<EmailType[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<EmailType | null>(null);
  const [pendingToggle, setPendingToggle] = useState<{ id: string; label: string } | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(CATEGORY_ORDER)
  );
  const hasFetched = useRef(false);

  const loadEmailTypes = useCallback(async () => {
    try {
      // Fetch email types
      const { data: types, error } = await supabase
        .from("email_types")
        .select("*")
        .order("sort_order");

      if (error) throw error;

      // Fetch sent counts from last 30 days
      const thirtyDaysAgo = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      ).toISOString();
      const { data: counts } = await supabase
        .from("email_notifications")
        .select("notification_type, sent_at")
        .gte("sent_at", thirtyDaysAgo);

      // Count by type + track latest sent_at
      const countMap = new Map<string, number>();
      const lastSentMap = new Map<string, string>();
      if (counts) {
        for (const row of counts) {
          const key = row.notification_type;
          countMap.set(key, (countMap.get(key) || 0) + 1);
          if (row.sent_at && (!lastSentMap.has(key) || row.sent_at > lastSentMap.get(key)!)) {
            lastSentMap.set(key, row.sent_at);
          }
        }
      }

      setEmailTypes(
        (types || []).map((t: any) => ({
          ...t,
          sent_count: countMap.get(t.id) || 0,
          last_sent_at: lastSentMap.get(t.id),
        }))
      );
    } catch (err: unknown) {
      console.error("Error loading email types:", err);
      toast.error("Failed to load email types");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadEmailTypes();
  }, [loadEmailTypes]);

  const handleToggle = async (typeId: string, enabled: boolean) => {
    setTogglingId(typeId);
    try {
      const { error } = await supabase
        .from("email_types")
        .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
        .eq("id", typeId);

      if (error) throw error;

      setEmailTypes((prev) =>
        prev.map((t) => (t.id === typeId ? { ...t, is_enabled: enabled } : t))
      );
      toast.success(`${enabled ? "Enabled" : "Disabled"} email type`);
    } catch (err: unknown) {
      console.error("Error toggling email type:", err);
      toast.error("Failed to update email type");
    } finally {
      setTogglingId(null);
    }
  };

  const handleTemplateSaved = (typeId: string, subject: string | null, bodySections: any[] | null) => {
    setEmailTypes((prev) =>
      prev.map((t) =>
        t.id === typeId ? { ...t, subject_template: subject, body_sections: bodySections } : t
      )
    );
    setEditingType(null);
  };

  const toggleSection = (category: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Group by category
  const grouped = new Map<string, EmailType[]>();
  for (const type of emailTypes) {
    const list = grouped.get(type.category) || [];
    list.push(type);
    grouped.set(type.category, list);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (emailTypes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Mail className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">
          No email types found. Run the migration to seed the email_types table.
        </p>
      </div>
    );
  }

  const isTransactional = (category: string) => category === "transactional";

  return (
    <TooltipProvider>
    <div className="space-y-4">
      {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((category) => {
        const types = grouped.get(category)!;
        const isOpen = openSections.has(category);
        const enabledCount = types.filter((t) => t.is_enabled).length;

        return (
          <Card key={category}>
            <Collapsible open={isOpen} onOpenChange={() => toggleSection(category)}>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-base">
                        {CATEGORY_LABELS[category] || category}
                      </CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {enabledCount}/{types.length} active
                      </Badge>
                      {isTransactional(category) && (
                        <Tooltip delayDuration={0}>
                          <TooltipTrigger asChild>
                            <span
                              className="inline-flex"
                              onClick={(e) => e.stopPropagation()}
                              onPointerDown={(e) => e.stopPropagation()}
                            >
                              <Badge variant="outline" className="text-xs">
                                Read-only
                              </Badge>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            Transactional emails are managed in code and cannot be toggled or edited
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </CardHeader>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <CardContent className="pt-0">
                  <div className="divide-y">
                    {types.map((type) => (
                      <div
                        key={type.id}
                        className="flex items-center justify-between py-3 gap-4"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {!isTransactional(category) && (
                            <Switch
                              checked={type.is_enabled}
                              disabled={togglingId === type.id}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  handleToggle(type.id, true);
                                } else {
                                  setPendingToggle({ id: type.id, label: type.label });
                                }
                              }}
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">
                                {type.label}
                              </span>
                              {type.subject_template && (
                                <Badge variant="outline" className="text-xs shrink-0">
                                  Customized
                                </Badge>
                              )}
                            </div>
                            {type.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                {type.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="secondary" className="text-xs tabular-nums">
                            {type.sent_count ?? 0} sent
                          </Badge>
                          {type.last_sent_at && (
                            <span className="text-xs text-muted-foreground">
                              Last: {formatDistanceToNow(new Date(type.last_sent_at), { addSuffix: true })}
                            </span>
                          )}
                          {!isTransactional(category) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingType(type)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onViewLogs(type.id)}
                          >
                            <ScrollText className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}

      {editingType && (
        <EmailTemplateEditor
          emailType={editingType}
          open={!!editingType}
          onClose={() => setEditingType(null)}
          onSaved={handleTemplateSaved}
        />
      )}

      <AlertDialog open={!!pendingToggle} onOpenChange={(open) => !open && setPendingToggle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable email?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to disable "{pendingToggle?.label}"? This email will stop sending until re-enabled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingToggle) {
                  handleToggle(pendingToggle.id, false);
                }
                setPendingToggle(null);
              }}
            >
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
}
