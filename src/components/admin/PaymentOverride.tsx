import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { DollarSign, AlertTriangle, Loader2, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  SubscriptionStatus, 
  PaymentStatus,
  logPaymentOverride,
  formatCurrency,
} from "@/lib/payments";
import { formatSubscriptionStatus, getSubscriptionStatusVariant } from "@/lib/statusUtils";

interface PaymentOverrideProps {
  subscriptionId: string;
  userId: string;
  currentStatus: SubscriptionStatus | string;
  currentAmount: number;
  clientName: string;
  serviceName: string;
  onSuccess?: () => void;
}

type OverrideAction = "activate" | "mark_paid" | "cancel" | "suspend" | "resume";

const OVERRIDE_ACTIONS: { value: OverrideAction; label: string; description: string; resultStatus: SubscriptionStatus }[] = [
  { 
    value: "activate", 
    label: "Activate (Admin Override)", 
    description: "Activate subscription without payment (e.g., manual/cash payment received)",
    resultStatus: "active",
  },
  { 
    value: "mark_paid", 
    label: "Mark Payment Received", 
    description: "Record a manual payment and activate subscription",
    resultStatus: "active",
  },
  { 
    value: "cancel", 
    label: "Cancel Subscription", 
    description: "Cancel the subscription immediately",
    resultStatus: "cancelled",
  },
  { 
    value: "suspend", 
    label: "Suspend Subscription", 
    description: "Temporarily suspend (non-payment, etc.)",
    resultStatus: "inactive",
  },
  { 
    value: "resume", 
    label: "Resume Subscription", 
    description: "Resume a suspended/inactive subscription",
    resultStatus: "active",
  },
];

/**
 * Admin component to manually override payment/subscription status.
 * 
 * Use cases:
 * - Client paid cash/bank transfer
 * - Payment system error, manual activation needed
 * - Grace period extension
 * - Subscription suspension/resumption
 * 
 * All overrides are logged to security_audit_log for compliance.
 */
export function PaymentOverride({
  subscriptionId,
  userId,
  currentStatus,
  currentAmount,
  clientName,
  serviceName,
  onSuccess,
}: PaymentOverrideProps) {
  const [open, setOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<OverrideAction | "">("");
  const [manualAmount, setManualAmount] = useState(currentAmount.toString());
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState(""); // External reference (bank transfer ID, etc.)
  const [confirmDangerous, setConfirmDangerous] = useState(false);
  const [loading, setLoading] = useState(false);

  const selectedActionData = OVERRIDE_ACTIONS.find(a => a.value === selectedAction);
  const isDangerous = selectedAction === "activate" && currentStatus === "pending";
  const requiresAmount = selectedAction === "mark_paid";

  const handleSubmit = async () => {
    if (!selectedAction || !reason.trim()) {
      toast.error("Please select an action and provide a reason");
      return;
    }

    if (isDangerous && !confirmDangerous) {
      toast.error("Please confirm this override action");
      return;
    }

    if (requiresAmount && (!manualAmount || parseFloat(manualAmount) <= 0)) {
      toast.error("Please enter a valid payment amount");
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const now = new Date();
      const nextBillingDate = new Date();
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

      // Build update payload based on action
      const subscriptionUpdate: Record<string, unknown> = {
        status: selectedActionData?.resultStatus,
        updated_at: now.toISOString(),
      };

      if (selectedAction === "activate" || selectedAction === "mark_paid" || selectedAction === "resume") {
        subscriptionUpdate.start_date = now.toISOString();
        subscriptionUpdate.next_billing_date = nextBillingDate.toISOString();
        subscriptionUpdate.past_due_since = null;
        subscriptionUpdate.payment_failed_at = null;
        // Mark as manually activated
        subscriptionUpdate.last_payment_status = "ADMIN_OVERRIDE";
        subscriptionUpdate.last_payment_verified_at = now.toISOString();
      }

      if (selectedAction === "cancel" || selectedAction === "suspend") {
        subscriptionUpdate.cancelled_at = selectedAction === "cancel" ? now.toISOString() : null;
      }

      // Update subscription
      const { error: subError } = await supabase
        .from("subscriptions")
        .update(subscriptionUpdate)
        .eq("id", subscriptionId);

      if (subError) throw subError;

      // Update profile status to match
      const profileUpdate: Record<string, unknown> = {
        updated_at: now.toISOString(),
      };

      if (selectedActionData?.resultStatus === "active") {
        profileUpdate.status = "active";
        profileUpdate.payment_deadline = null;
        profileUpdate.activation_completed_at = now.toISOString();
      } else if (selectedActionData?.resultStatus === "cancelled") {
        profileUpdate.status = "cancelled";
      } else if (selectedActionData?.resultStatus === "inactive") {
        profileUpdate.status = "suspended";
      }

      await supabase
        .from("profiles_public")
        .update(profileUpdate)
        .eq("id", userId);

      // If marking payment received, create a payment record
      if (selectedAction === "mark_paid") {
        const amount = parseFloat(manualAmount);
        await supabase.from("subscription_payments").insert({
          subscription_id: subscriptionId,
          user_id: userId,
          amount_kwd: amount,
          status: "paid" as PaymentStatus,
          is_renewal: currentStatus === "past_due" || currentStatus === "inactive",
          billing_period_start: now.toISOString().split("T")[0],
          billing_period_end: nextBillingDate.toISOString().split("T")[0],
          paid_at: now.toISOString(),
          metadata: {
            payment_method: "manual_admin_override",
            reference: reference || null,
            override_reason: reason,
            overridden_by: user?.id,
          },
        });
      }

      // Log to security audit
      await supabase.from("security_audit_log").insert({
        event_type: "payment_override",
        user_id: userId,
        details: {
          subscription_id: subscriptionId,
          action: selectedAction,
          from_status: currentStatus,
          to_status: selectedActionData?.resultStatus,
          amount: requiresAmount ? parseFloat(manualAmount) : null,
          reference: reference || null,
          reason: reason.trim(),
          overridden_by: user?.id,
        },
      });

      // Log locally
      logPaymentOverride({
        subscriptionId,
        userId,
        newStatus: selectedActionData?.resultStatus || "active",
        reason: reason.trim(),
        overriddenBy: user?.id || "unknown",
        amount: requiresAmount ? parseFloat(manualAmount) : undefined,
        chargeId: reference || undefined,
        timestamp: now,
      });

      toast.success(`Payment override applied: ${selectedActionData?.label}`);
      onSuccess?.();
      setOpen(false);
      resetForm();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Payment override error:", error);
      toast.error(`Override failed: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedAction("");
    setManualAmount(currentAmount.toString());
    setReason("");
    setReference("");
    setConfirmDangerous(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { setOpen(isOpen); if (!isOpen) resetForm(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <DollarSign className="h-4 w-4 mr-2" />
          Payment Override
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Payment Override
          </DialogTitle>
          <DialogDescription>
            Manually adjust payment status for {clientName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current Status */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">Current Status</p>
              <p className="font-medium">{serviceName}</p>
            </div>
            <Badge variant={getSubscriptionStatusVariant(currentStatus)}>
              {formatSubscriptionStatus(currentStatus)}
            </Badge>
          </div>

          {/* Action Selection */}
          <div className="space-y-2">
            <Label htmlFor="action">Override Action</Label>
            <Select
              value={selectedAction}
              onValueChange={(value) => setSelectedAction(value as OverrideAction)}
            >
              <SelectTrigger id="action">
                <SelectValue placeholder="Select action..." />
              </SelectTrigger>
              <SelectContent>
                {OVERRIDE_ACTIONS.map((action) => (
                  <SelectItem key={action.value} value={action.value}>
                    <div className="flex flex-col">
                      <span>{action.label}</span>
                      <span className="text-xs text-muted-foreground">{action.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount (for mark_paid) */}
          {requiresAmount && (
            <div className="space-y-2">
              <Label htmlFor="amount">Payment Amount (KWD)</Label>
              <Input
                id="amount"
                type="number"
                step="0.001"
                min="0"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                placeholder="Enter amount received"
              />
              <p className="text-xs text-muted-foreground">
                Expected: {formatCurrency(currentAmount)}
              </p>
            </div>
          )}

          {/* External Reference */}
          {requiresAmount && (
            <div className="space-y-2">
              <Label htmlFor="reference">External Reference (optional)</Label>
              <Input
                id="reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Bank transfer ID, receipt number, etc."
              />
            </div>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Override *</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this override is needed..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Required for audit compliance.
            </p>
          </div>

          {/* Dangerous Action Warning */}
          {isDangerous && (
            <Alert className="border-yellow-500/50 bg-yellow-500/10">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">
                    This will activate the subscription without verified payment.
                  </p>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="confirm"
                      checked={confirmDangerous}
                      onCheckedChange={(checked) => setConfirmDangerous(!!checked)}
                    />
                    <label htmlFor="confirm" className="text-sm">
                      I confirm this is intentional and have verified payment separately
                    </label>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading || !selectedAction || !reason.trim() || (isDangerous && !confirmDangerous)}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Apply Override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
