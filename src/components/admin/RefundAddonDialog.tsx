import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { captureException } from "@/lib/errorLogging";
import { toast } from "sonner";

export interface RefundablePurchase {
  id: string;
  status: string;
  total_paid_kwd: number;
  payment_id: string | null;
  expires_at: string | null;
  sessions_total: number;
  sessions_consumed: number;
  service_name: string;
  client_name?: string;
}

interface RefundAddonDialogProps {
  purchase: RefundablePurchase | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires after a successful refund so the parent can refetch the purchases query. */
  onRefunded?: () => void;
}

type RefundMode = "full" | "partial_unused";

const REASON_MIN = 3;
const REASON_MAX = 500;

/**
 * Computes the refund amount the RPC will produce, exactly:
 *   full           -> total_paid_kwd
 *   partial_unused -> ROUND(total * (remaining/total), 2)
 *
 * Kept locally in this file so the preview is the single source of truth
 * for the dialog's UI. RPC re-runs the same math server-side and is
 * authoritative.
 */
function computeRefund(mode: RefundMode, purchase: RefundablePurchase): number {
  if (mode === "full") return purchase.total_paid_kwd;
  const remaining = Math.max(0, purchase.sessions_total - purchase.sessions_consumed);
  const raw = (purchase.total_paid_kwd * remaining) / purchase.sessions_total;
  return Math.round(raw * 100) / 100;
}

export function RefundAddonDialog({
  purchase,
  open,
  onOpenChange,
  onRefunded,
}: RefundAddonDialogProps) {
  const [tapChargeId, setTapChargeId] = useState<string | null>(null);
  const [chargeLookupDone, setChargeLookupDone] = useState(false);
  const [mode, setMode] = useState<RefundMode>("partial_unused");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset state every time the dialog opens for a (potentially different) purchase
  useEffect(() => {
    if (!open || !purchase) return;
    setReason("");
    setSubmitError(null);
    setTapChargeId(null);
    setChargeLookupDone(false);

    // Default mode -- prefer partial when available, else full
    const fullAvailable = purchase.sessions_consumed === 0;
    const expiresAt = purchase.expires_at ? new Date(purchase.expires_at) : null;
    const partialAvailable =
      purchase.status === "active"
      && !!expiresAt
      && expiresAt.getTime() > Date.now()
      && purchase.sessions_consumed < purchase.sessions_total;

    if (partialAvailable) setMode("partial_unused");
    else if (fullAvailable) setMode("full");
    else setMode("partial_unused");

    // Lazily look up the tap_charge_id from addon_payments for the disclaimer
    if (purchase.payment_id) {
      supabase
        .from("addon_payments")
        .select("tap_charge_id")
        .eq("id", purchase.payment_id)
        .maybeSingle()
        .then(({ data }) => {
          setTapChargeId((data?.tap_charge_id as string | null) ?? null);
          setChargeLookupDone(true);
        });
    } else {
      setChargeLookupDone(true);
    }
  }, [open, purchase]);

  // Compute mode availability + tooltips
  const { fullEnabled, partialEnabled, fullDisabledReason, partialDisabledReason, bothBlocked } =
    useMemo(() => {
      if (!purchase) {
        return {
          fullEnabled: false,
          partialEnabled: false,
          fullDisabledReason: "",
          partialDisabledReason: "",
          bothBlocked: true,
        };
      }
      const statusAllowed =
        purchase.status === "active" || purchase.status === "pending_payment";

      const fullEnabled = statusAllowed && purchase.sessions_consumed === 0;
      const fullDisabledReason = !statusAllowed
        ? `Purchase status '${purchase.status}' cannot be refunded`
        : `Full refund requires zero consumed sessions (${purchase.sessions_consumed} consumed)`;

      const expiresAt = purchase.expires_at ? new Date(purchase.expires_at) : null;
      const expired = expiresAt ? expiresAt.getTime() <= Date.now() : false;
      const allConsumed = purchase.sessions_consumed >= purchase.sessions_total;

      let partialDisabledReason = "";
      if (!statusAllowed) {
        partialDisabledReason = `Purchase status '${purchase.status}' cannot be refunded`;
      } else if (expired) {
        partialDisabledReason = "Cannot partial-refund an expired purchase";
      } else if (allConsumed) {
        partialDisabledReason = "All sessions consumed -- nothing to refund";
      }
      const partialEnabled =
        statusAllowed && !expired && !allConsumed;

      return {
        fullEnabled,
        partialEnabled,
        fullDisabledReason,
        partialDisabledReason,
        bothBlocked: !fullEnabled && !partialEnabled,
      };
    }, [purchase]);

  if (!purchase) return null;

  const remaining = Math.max(0, purchase.sessions_total - purchase.sessions_consumed);
  const unitPrice = purchase.sessions_total > 0
    ? Math.round((purchase.total_paid_kwd / purchase.sessions_total) * 100) / 100
    : purchase.total_paid_kwd;
  const refundAmount = computeRefund(mode, purchase);
  const reasonTrimmed = reason.trim();
  const reasonValid = reasonTrimmed.length >= REASON_MIN;
  const modeEnabled = mode === "full" ? fullEnabled : partialEnabled;
  const hasPaymentId = !!purchase.payment_id;
  const canSubmit =
    !isSubmitting && hasPaymentId && reasonValid && modeEnabled && !bothBlocked;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const { data, error } = await supabase.rpc("refund_addon_purchase", {
        p_purchase_id: purchase.id,
        p_reason: reasonTrimmed,
        p_mode: mode,
      });
      if (error) throw error;
      const result = (data ?? {}) as { refund_amount_kwd?: number };
      const amount = result.refund_amount_kwd ?? refundAmount;
      toast.success(`Refunded ${amount.toFixed(2)} KWD`, {
        description: `${purchase.service_name} -- IGU-side state flipped to refunded.`,
      });
      onRefunded?.();
      onOpenChange(false);
    } catch (err) {
      captureException(err, { source: "refund_addon_purchase" });
      const msg = sanitizeErrorForUser(err) || "Refund failed. Please try again.";
      setSubmitError(msg);
      toast.error("Refund failed", { description: msg });
      setIsSubmitting(false);
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
        <ResponsiveDialogContent
          title={`Refund -- ${purchase.service_name}`}
          description={
            purchase.client_name
              ? `Client: ${purchase.client_name}`
              : undefined
          }
        >
          <div className="space-y-5 py-4">
            {!hasPaymentId && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Purchase has no payment_id (legacy Phase-0 row). Issue
                  the refund manually via Tap and adjust state in SQL.
                </AlertDescription>
              </Alert>
            )}

            {bothBlocked && hasPaymentId && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Status &quot;{purchase.status}&quot; cannot be refunded via this dialog.
                  Eligible statuses: active, pending_payment.
                </AlertDescription>
              </Alert>
            )}

            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total paid</span>
                <span className="font-semibold tabular-nums">
                  {purchase.total_paid_kwd.toFixed(2)} KWD
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sessions</span>
                <span className="tabular-nums">
                  {purchase.sessions_consumed} consumed / {purchase.sessions_total} total
                  {" "}({remaining} remaining)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span>{purchase.status}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Mode</Label>
              <RadioGroup
                value={mode}
                onValueChange={(v) => setMode(v as RefundMode)}
                disabled={isSubmitting || bothBlocked}
                className="space-y-2"
              >
                <ModeOption
                  value="full"
                  label="Full refund"
                  description={`Refunds ${purchase.total_paid_kwd.toFixed(2)} KWD. Requires zero consumed sessions.`}
                  enabled={fullEnabled}
                  disabledReason={fullDisabledReason}
                />
                <ModeOption
                  value="partial_unused"
                  label="Partial refund (unused sessions)"
                  description={`Refunds the prorated value of remaining sessions. Available pre-expiry only.`}
                  enabled={partialEnabled}
                  disabledReason={partialDisabledReason}
                />
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="refund-reason" className="text-sm font-medium">
                Reason
                <span className="text-muted-foreground font-normal ml-1">
                  (min {REASON_MIN} chars, required)
                </span>
              </Label>
              <Textarea
                id="refund-reason"
                value={reason}
                maxLength={REASON_MAX}
                onChange={(e) => setReason(e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. client requested cancellation, duplicate purchase, service unavailable..."
                rows={3}
              />
              <p className="text-[11px] text-muted-foreground text-right tabular-nums">
                {reason.length} / {REASON_MAX}
              </p>
            </div>

            <div className="rounded-md border-l-4 border-primary bg-primary/5 p-3 space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">You will refund</span>
                <span className="text-2xl font-bold tabular-nums">
                  {refundAmount.toFixed(2)} KWD
                </span>
              </div>
              {mode === "partial_unused" && purchase.sessions_total > 0 && (
                <p className="text-xs text-muted-foreground">
                  {remaining}/{purchase.sessions_total} sessions unused at {unitPrice.toFixed(2)} KWD each
                </p>
              )}
              {mode === "full" && (
                <p className="text-xs text-muted-foreground">
                  Full refund of the original charge.
                </p>
              )}
            </div>

            <p className="text-xs italic text-muted-foreground">
              After confirming, you must also issue the Tap-side refund via the Tap dashboard
              {tapChargeId ? ` for charge ${tapChargeId}` : ""}
              {!tapChargeId && chargeLookupDone ? " (charge id not on file -- look up via payment_id in SQL)" : ""}
              {!chargeLookupDone ? " (looking up charge id...)" : ""}
              {" "}-- this dialog only records the IGU-side state flip.
            </p>

            {submitError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}
          </div>

          <ResponsiveDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirm}
              disabled={!canSubmit}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Refunding...
                </>
              ) : (
                `Confirm refund (${refundAmount.toFixed(2)} KWD)`
              )}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </TooltipProvider>
  );
}

function ModeOption({
  value,
  label,
  description,
  enabled,
  disabledReason,
}: {
  value: RefundMode;
  label: string;
  description: string;
  enabled: boolean;
  disabledReason: string;
}) {
  const row = (
    <div className={`flex items-start gap-3 rounded-md border p-3 ${enabled ? "" : "opacity-50"}`}>
      <RadioGroupItem value={value} id={`refund-mode-${value}`} disabled={!enabled} className="mt-0.5" />
      <div className="space-y-0.5 flex-1">
        <Label htmlFor={`refund-mode-${value}`} className="text-sm font-medium leading-none">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );

  if (enabled) return row;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="block">{row}</span>
      </TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  );
}
