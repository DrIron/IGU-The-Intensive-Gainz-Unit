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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CalendarClock, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface EndAddonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: string;
  specialistName: string;
  specialty: string;
  nextBillingDate?: string | null;
  onSuccess: () => void;
}

export function EndAddonDialog({
  open,
  onOpenChange,
  assignmentId,
  specialistName,
  specialty,
  nextBillingDate,
  onSuccess,
}: EndAddonDialogProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState("");

  const handleEndAddon = async () => {
    try {
      setSubmitting(true);

      const { data, error } = await supabase.rpc('discharge_care_team_member', {
        p_assignment_id: assignmentId,
        p_reason_code: 'addon_cancelled',
        p_notes: notes.trim() || null,
      });

      if (error) throw error;

      toast({
        title: "Add-on scheduled to end",
        description: `Your ${specialty} specialist will be removed at your next billing date.`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error ending addon:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to end add-on",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const formattedEndDate = nextBillingDate 
    ? format(new Date(nextBillingDate), "MMMM d, yyyy")
    : "your next billing date";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            End Add-on at Renewal
          </DialogTitle>
          <DialogDescription>
            Remove {specialistName} ({specialty}) from your care team at the next billing cycle.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert>
            <CalendarClock className="h-4 w-4" />
            <AlertDescription>
              You'll continue to have access to {specialistName} until <strong>{formattedEndDate}</strong>. 
              This add-on won't be billed in your next cycle.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="client_notes">Reason (optional)</Label>
            <Textarea
              id="client_notes"
              placeholder="Let us know why you're ending this add-on..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Keep Add-on
          </Button>
          <Button onClick={handleEndAddon} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            End at Renewal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
