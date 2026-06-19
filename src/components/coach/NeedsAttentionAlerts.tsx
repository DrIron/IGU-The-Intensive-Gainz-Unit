import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserCheck, Scale, Activity, CreditCard, UserX, ChevronRight, Bell, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { interpretAttention, toneClasses, type Tone } from "@/lib/interpret";
import type { RosterAttention } from "@/hooks/useCoachRosterAttention";

interface NeedsAttentionAlertsProps {
  /** Single roster-attention source (CO1) — shared with the sidebar badge + roster. */
  attention: RosterAttention;
  onNavigate?: (section: string, filter?: string) => void;
}

/**
 * "Needs Your Attention" banner. Headline = the RPC's deduped `total` (so
 * dashboard == sidebar badge == roster), framed broadly via interpretAttention.
 * Chips break the total into the RPC tiles; `client_ids` lets a single-flagged
 * bucket deep-link straight to that client (no second query).
 */
export function NeedsAttentionAlerts({ attention, onNavigate }: NeedsAttentionAlertsProps) {
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  if (attention.total === 0 || dismissed) return null;

  const interp = interpretAttention(attention.total, attention.most_overdue_days);
  const { tiles, client_ids } = attention;

  // Single flagged client → that client's overview/tab; otherwise the filtered roster section.
  const open = (ids: string[], section: string, filter: string | undefined, clientTab?: string) => () => {
    if (ids.length === 1) {
      navigate(clientTab ? `/coach/clients/${ids[0]}?tab=${clientTab}` : `/coach/clients/${ids[0]}`);
      return;
    }
    if (onNavigate) onNavigate(section, filter);
    else navigate(`/coach/${section}`);
  };

  const chips: { count: number; label: string; icon: typeof UserCheck; tone: Tone; onClick: () => void }[] = [
    { count: tiles.pending_approval, label: tiles.pending_approval === 1 ? "Pending Approval" : "Pending Approvals", icon: UserCheck, tone: "attention", onClick: open(client_ids.pending_approval, "clients", "pending") },
    { count: tiles.payment_failed, label: tiles.payment_failed === 1 ? "Payment Failed" : "Payments Failed", icon: CreditCard, tone: "risk", onClick: open(client_ids.payment_failed, "clients", "at-risk") },
    { count: tiles.inactive, label: "Inactive", icon: UserX, tone: "risk", onClick: open(client_ids.inactive, "clients", "at-risk") },
    { count: tiles.check_in_overdue, label: tiles.check_in_overdue === 1 ? "Check-in Overdue" : "Check-ins Overdue", icon: Activity, tone: "risk", onClick: open(client_ids.check_in_overdue, "clients", "at-risk", "nutrition") },
    { count: tiles.adjustments_pending, label: tiles.adjustments_pending === 1 ? "Nutrition Adjustment" : "Nutrition Adjustments", icon: Scale, tone: "attention", onClick: open(client_ids.adjustments_pending, "nutrition", undefined, "nutrition") },
  ].filter((c) => c.count > 0);

  return (
    <Card className="border-status-attention/30 bg-status-attention/5">
      <CardContent className="p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center p-2 rounded-full bg-status-attention/15">
              <Bell className="h-4 w-4 text-status-attention" />
            </div>
            <div className="leading-tight">
              <h3 className="font-semibold text-sm">Needs Your Attention</h3>
              <p className="text-xs text-muted-foreground">{interp.sentence}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 flex-1">
            {chips.map((chip, i) => {
              const tc = toneClasses(chip.tone);
              return (
                <button
                  key={i}
                  onClick={chip.onClick}
                  className={cn("inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-colors hover:bg-background/40", tc.soft, tc.text, `border-status-${chip.tone}/30`)}
                >
                  <chip.icon className="h-4 w-4" />
                  <span className="font-semibold tabular-nums">{chip.count}</span>
                  <span className="text-muted-foreground">{chip.label}</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              );
            })}
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
