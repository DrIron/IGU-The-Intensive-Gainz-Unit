import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CalendarClock, AlertTriangle, Loader2 } from "lucide-react";
import { format } from "date-fns";

type DischargeReason = 
  | "addon_cancelled"
  | "coach_request"
  | "client_request"
  | "admin_override"
  | "replaced";

interface DischargeSpecialistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: string;
  specialistName: string;
  specialty: string;
  nextBillingDate?: string | null;
  onSuccess: () => void;
}

export function DischargeSpecialistDialog({
  open,
  onOpenChange,
  assignmentId,
  specialistName,
  specialty,
  nextBillingDate,
  onSuccess,
}: DischargeSpecialistDialogProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState<DischargeReason>("addon_cancelled");
  const [notes, setNotes] = useState("");

  const handleDischarge = async () => {
    try {
      setSubmitting(true);

      const { data, error } = await supabase.rpc('discharge_care_team_member', {
        p_assignment_id: assignmentId,
        p_reason_code: reason,
        p_notes: notes.trim() || null,
      });

      if (error) throw error;

      toast({
        title: "Specialist scheduled for discharge",
        description: `${specialistName} will be removed from the care team at the next billing cycle.`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error discharging specialist:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to discharge specialist",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const formattedEndDate = nextBillingDate 
    ? format(new Date(nextBillingDate), "MMMM d, yyyy")
    : "the next billing date";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            End Specialist Assignment
          </DialogTitle>
          <DialogDescription>
            Schedule {specialistName}'s {specialty} assignment to end at the next billing cycle.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert>
            <CalendarClock className="h-4 w-4" />
            <AlertDescription>
              The specialist will retain access until <strong>{formattedEndDate}</strong>, 
              then be automatically removed. No pro-rated billing.
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <Label>Reason for ending:</Label>
            <RadioGroup value={reason} onValueChange={(v) => setReason(v as DischargeReason)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="addon_cancelled" id="addon_cancelled" />
                <Label htmlFor="addon_cancelled" className="font-normal cursor-pointer">
                  Add-on cancelled by client
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="coach_request" id="coach_request" />
                <Label htmlFor="coach_request" className="font-normal cursor-pointer">
                  Coach/team restructuring
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="client_request" id="client_request" />
                <Label htmlFor="client_request" className="font-normal cursor-pointer">
                  Client request
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="replaced" id="replaced" />
                <Label htmlFor="replaced" className="font-normal cursor-pointer">
                  Being replaced by another specialist
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any additional context..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleDischarge} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Schedule End
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TerminateSpecialistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: string;
  specialistName: string;
  specialty: string;
  onSuccess: () => void;
}

type TerminateReason = 
  | "for_cause_performance"
  | "for_cause_conduct"
  | "for_cause_other";

export function TerminateSpecialistDialog({
  open,
  onOpenChange,
  assignmentId,
  specialistName,
  specialty,
  onSuccess,
}: TerminateSpecialistDialogProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState<TerminateReason>("for_cause_performance");
  const [notes, setNotes] = useState("");

  const handleTerminate = async () => {
    if (!notes.trim()) {
      toast({
        title: "Notes required",
        description: "You must provide notes explaining the reason for termination.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSubmitting(true);

      const { data, error } = await supabase.rpc('terminate_care_team_member', {
        p_assignment_id: assignmentId,
        p_reason_code: reason,
        p_notes: notes.trim(),
      });

      if (error) throw error;

      toast({
        title: "Specialist terminated",
        description: `${specialistName} has been immediately removed from the care team.`,
        variant: "destructive",
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error terminating specialist:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to terminate specialist",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            For-Cause Termination
          </DialogTitle>
          <DialogDescription>
            Immediately terminate {specialistName}'s access. This action is logged and requires admin review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This will <strong>immediately revoke access</strong>. Use only for serious issues requiring urgent action.
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <Label>Reason for termination:</Label>
            <RadioGroup value={reason} onValueChange={(v) => setReason(v as TerminateReason)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="for_cause_performance" id="for_cause_performance" />
                <Label htmlFor="for_cause_performance" className="font-normal cursor-pointer">
                  Performance issues
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="for_cause_conduct" id="for_cause_conduct" />
                <Label htmlFor="for_cause_conduct" className="font-normal cursor-pointer">
                  Conduct violation
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="for_cause_other" id="for_cause_other" />
                <Label htmlFor="for_cause_other" className="font-normal cursor-pointer">
                  Other serious concern
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="terminate_notes">
              Notes <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="terminate_notes"
              placeholder="Describe the reason for immediate termination..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              required
            />
            <p className="text-xs text-muted-foreground">
              Required for audit purposes. Be specific about the incident or concern.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleTerminate} 
            disabled={submitting || !notes.trim()}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Terminate Immediately
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
