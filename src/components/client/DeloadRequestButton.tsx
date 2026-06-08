// src/components/client/DeloadRequestButton.tsx
//
// Client-side surface for the "Need a deload" workflow.
//
// States the button cycles through:
//   - Idle  → enabled, opens the confirm dialog
//   - Pending → disabled, shows "Pending review" + cancel
//   - Cool-off (just declined) → disabled with "Available in N days"
//   - Loading → small spinner
//
// Mount on the client dashboard's active program card.
//
// Plan: docs/PLANNING_BOARD_WEEKLY_DELTAS_PLAN.md §10.1

import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Snowflake, Clock, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDeloadRequests } from "@/hooks/useDeloadRequests";
import { cn } from "@/lib/utils";

interface DeloadRequestButtonProps {
  clientUserId: string;
  subscriptionId: string | null;
  /** Render hint — defaults to "default", "inline" tightens spacing for in-card use. */
  variant?: "default" | "inline";
}

const MAX_MESSAGE_LENGTH = 500;

export const DeloadRequestButton = memo(function DeloadRequestButton({
  clientUserId,
  subscriptionId,
  variant = "default",
}: DeloadRequestButtonProps) {
  const { status, loading, submit, cancelPending, coolOffDaysRemaining } = useDeloadRequests(clientUserId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <Button variant="outline" size="sm" disabled className={cn(variant === "inline" && "h-7 text-xs")}>
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        Checking...
      </Button>
    );
  }

  // Pending — show status pill + cancel.
  if (status.pending) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400 text-xs">
          <Clock className="h-3 w-3" />
          Deload request pending review
        </span>
        <Button
          variant="ghost"
          size="sm"
          className={cn("text-xs", variant === "inline" && "h-7")}
          onClick={async () => {
            try {
              await cancelPending();
              toast.success("Request cancelled");
            } catch (e: unknown) {
              toast.error(e instanceof Error ? e.message : "Cancel failed");
            }
          }}
        >
          <X className="h-3 w-3 mr-1" />
          Cancel
        </Button>
      </div>
    );
  }

  // Cool-off — disabled until N days pass.
  if (coolOffDaysRemaining > 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        title={
          status.lastDeclined?.responseMessage
            ? `Your coach said: "${status.lastDeclined.responseMessage}"`
            : "Coach recently declined a deload request"
        }
        className={cn(variant === "inline" && "h-7 text-xs")}
      >
        <Snowflake className="h-3 w-3 mr-1" />
        Deload available in {coolOffDaysRemaining}d
      </Button>
    );
  }

  // No active subscription → can't request.
  if (!subscriptionId) {
    return null;
  }

  // Idle — show the button + dialog.
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setDialogOpen(true)}
        className={cn("border-blue-500/40 text-blue-700 dark:text-blue-400 hover:bg-blue-500/5", variant === "inline" && "h-7 text-xs")}
      >
        <Snowflake className="h-3 w-3 mr-1" />
        Need a deload
      </Button>

      <Dialog open={dialogOpen} onOpenChange={(o) => !submitting && setDialogOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Snowflake className="h-4 w-4 text-blue-500" />
              Request a deload week
            </DialogTitle>
            <DialogDescription>
              Your coach will be notified and respond shortly. Add a quick note if it helps -- how you've been feeling, why you need it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="deload-message" className="text-xs">Optional note</Label>
            <Textarea
              id="deload-message"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
              placeholder="e.g. sleep has been rough, joints feeling beat up, big work week ahead..."
              className="min-h-[100px] text-sm"
              maxLength={MAX_MESSAGE_LENGTH}
            />
            <div className="text-[10px] text-muted-foreground text-right">
              {message.length} / {MAX_MESSAGE_LENGTH}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setSubmitting(true);
                try {
                  await submit({ subscriptionId, message: message || undefined });
                  toast.success("Deload request sent");
                  setMessage("");
                  setDialogOpen(false);
                } catch (e: unknown) {
                  toast.error(e instanceof Error ? e.message : "Submit failed");
                } finally {
                  setSubmitting(false);
                }
              }}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});
