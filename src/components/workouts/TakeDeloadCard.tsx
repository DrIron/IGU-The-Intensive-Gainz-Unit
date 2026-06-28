/**
 * Deload v2 — "take a deload this week" trigger card. See docs/DELOAD_V2.md.
 *
 * Client variant: self-service "Take a deload this week" → confirm → insert_client_deload (applies
 * immediately, plan extends a week, coach notified). Coach variant: "Insert a deload week" for the
 * client at their current position. Both list already-inserted deloads with a remove control.
 * Renders nothing unless the followed plan offers an on-demand deload or one is already inserted
 * (the hook is inert when board_v2 is off). Mount inside a board_v2-gated parent.
 */
import { useState } from "react";
import { Snowflake, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";
import { useDeloadActions } from "@/hooks/useDeloadActions";

interface TakeDeloadCardProps {
  assignmentId: string | null;
  planId: string | null;
  startDate: string | null;
  clientId: string | null;
  variant: "client" | "coach";
  className?: string;
  /** Fired after a successful insert/remove so a host (e.g. the schedule grid) can refresh. */
  onChange?: () => void;
}

export function TakeDeloadCard({
  assignmentId,
  planId,
  startDate,
  clientId,
  variant,
  className,
  onChange,
}: TakeDeloadCardProps) {
  const isClient = variant === "client";
  const { available, inserts, takeDeload, removeDeload } = useDeloadActions({
    assignmentId,
    planId,
    startDate,
    clientId,
    notifyCoach: isClient,
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Nothing to offer and nothing inserted → render nothing.
  if (!available && inserts.length === 0) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    const ok = await takeDeload();
    setSubmitting(false);
    setConfirmOpen(false);
    if (ok) {
      toast.success(
        isClient ? "Deload added — your plan shifted out by a week." : "Deload week inserted for this client.",
      );
      onChange?.();
    } else {
      toast.error("Couldn't add the deload. Please try again.");
    }
  };

  const handleRemove = async (id: string) => {
    const ok = await removeDeload(id);
    if (ok) {
      toast.success("Deload removed — plan shifted back.");
      onChange?.();
    } else {
      toast.error("Couldn't remove the deload.");
    }
  };

  return (
    <div
      className={
        "rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 space-y-3 " + (className ?? "")
      }
    >
      <div className="flex items-start gap-2">
        <Snowflake className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Recovery week available</p>
          <p className="text-xs text-muted-foreground">
            {isClient
              ? "Feeling beat up? Take a deload — a lighter recovery week. It adds a week and pushes the rest of your plan out."
              : "Insert the plan's on-demand deload at this client's current week (adds a week, shifts the rest out)."}
          </p>
        </div>
      </div>

      {available && (
        <Button
          size="sm"
          variant="outline"
          className="border-amber-500/50 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
          onClick={() => setConfirmOpen(true)}
        >
          <Snowflake className="h-3.5 w-3.5 mr-1.5" />
          {isClient ? "Take a deload this week" : "Insert a deload week"}
        </Button>
      )}

      {inserts.length > 0 && (
        <ul className="space-y-1.5 pt-1">
          {inserts.map((ins) => (
            <li
              key={ins.id}
              className="flex items-center justify-between gap-2 text-xs rounded-md bg-background/60 border border-border/50 px-2 py-1.5"
            >
              <span className="text-muted-foreground">
                Deload inserted at week {ins.position_week_index}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                aria-label="Remove deload"
                onClick={() => handleRemove(ins.id)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add a recovery week?</AlertDialogTitle>
            <AlertDialogDescription>
              {isClient
                ? "This adds a lighter recovery week starting now and pushes the rest of your plan out by a week. Your coach will be notified."
                : "This inserts the on-demand deload at the client's current week and pushes the rest of their plan out by a week."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={submitting}>
              {submitting ? "Adding…" : isClient ? "Take a deload" : "Insert deload"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
