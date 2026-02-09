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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Settings, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { 
  ClientStatus, 
  CLIENT_STATUS_TRANSITIONS, 
  isValidTransition,
  logStatusChange 
} from "@/auth/onboarding";
import { formatProfileStatus, getProfileStatusVariant } from "@/lib/statusUtils";

interface ClientStatusOverrideProps {
  clientId: string;
  currentStatus: ClientStatus | string;
  clientName: string;
  onStatusChange?: (newStatus: string) => void;
}

const ALL_STATUSES: ClientStatus[] = [
  "new",
  "pending",
  "needs_medical_review",
  "pending_coach_approval",
  "pending_payment",
  "active",
  "inactive",
  "suspended",
  "cancelled",
  "expired",
];

/**
 * Admin component to manually override a client's account status.
 * Includes validation, warnings, and audit logging.
 */
export function ClientStatusOverride({
  clientId,
  currentStatus,
  clientName,
  onStatusChange,
}: ClientStatusOverrideProps) {
  const [open, setOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<ClientStatus | "">("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  // Get valid transitions from current status
  const validTransitions = CLIENT_STATUS_TRANSITIONS[currentStatus as ClientStatus] || [];
  
  // Check if selected transition is outside normal flow
  const isNonStandardTransition = selectedStatus && !validTransitions.includes(selectedStatus);

  const handleSubmit = async () => {
    if (!selectedStatus) {
      toast.error("Please select a status");
      return;
    }

    if (!reason.trim()) {
      toast.error("Please provide a reason for the status change");
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Update the profile status
      const { error } = await supabase
        .from("profiles_public")
        .update({ 
          status: selectedStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", clientId);

      if (error) throw error;

      // Log the status change
      logStatusChange({
        userId: clientId,
        fromStatus: currentStatus,
        toStatus: selectedStatus,
        changedBy: user?.id || "unknown",
        reason: reason.trim(),
        timestamp: new Date(),
      });

      // Also log to database
      await supabase.from("security_audit_log").insert({
        event_type: "status_change",
        user_id: clientId,
        details: {
          from_status: currentStatus,
          to_status: selectedStatus,
          reason: reason.trim(),
          changed_by: user?.id,
        },
      });

      toast.success(`Status updated to ${formatProfileStatus(selectedStatus)}`);
      onStatusChange?.(selectedStatus);
      setOpen(false);
      setSelectedStatus("");
      setReason("");
    } catch (error: any) {
      console.error("Error updating status:", error);
      toast.error(sanitizeErrorForUser(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="h-4 w-4 mr-2" />
          Override Status
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Override Client Status</DialogTitle>
          <DialogDescription>
            Manually change the account status for {clientName}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Current status */}
          <div className="space-y-2">
            <Label>Current Status</Label>
            <Badge variant={getProfileStatusVariant(currentStatus)}>
              {formatProfileStatus(currentStatus)}
            </Badge>
          </div>

          {/* New status selection */}
          <div className="space-y-2">
            <Label htmlFor="new-status">New Status</Label>
            <Select
              value={selectedStatus}
              onValueChange={(value) => setSelectedStatus(value as ClientStatus)}
            >
              <SelectTrigger id="new-status">
                <SelectValue placeholder="Select new status" />
              </SelectTrigger>
              <SelectContent>
                {ALL_STATUSES.filter(s => s !== currentStatus).map((status) => (
                  <SelectItem key={status} value={status}>
                    <div className="flex items-center gap-2">
                      <Badge variant={getProfileStatusVariant(status)} className="text-xs">
                        {formatProfileStatus(status)}
                      </Badge>
                      {!validTransitions.includes(status) && (
                        <span className="text-xs text-muted-foreground">(non-standard)</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Warning for non-standard transitions */}
          {isNonStandardTransition && (
            <Alert className="border-yellow-500/50 bg-yellow-500/10">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription>
                This is a non-standard status transition. The normal flow is: 
                {validTransitions.map(s => formatProfileStatus(s)).join(" → ")}
              </AlertDescription>
            </Alert>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Change *</Label>
            <Textarea
              id="reason"
              placeholder="Explain why this status change is being made..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              This will be logged for audit purposes.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !selectedStatus || !reason.trim()}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Update Status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
