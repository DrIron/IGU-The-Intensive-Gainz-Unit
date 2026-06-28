// src/components/coach/clients/DeloadRequestPanel.tsx
//
// Inline panel that surfaces a client's pending deload request on the
// Client Overview shell. Coach can:
//   - Approve  -> pick preset + which week of the program
//   - Decline  -> optional response message; client sees a 7-day cool-off
//
// Schedule-for-future-week is a planned extension; for MVP, approve writes
// the response and the coach handles the actual deload application via
// their normal program editing tools. The request becomes the audit trail.
//
// Plan: docs/PLANNING_BOARD_WEEKLY_DELTAS_PLAN.md §10.2

import { memo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Snowflake, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { useCoachDeloadRequestForClient } from "@/hooks/useCoachDeloadRequests";

const PRESET_OPTIONS = [
  { id: "volume", label: "Volume (sets -40%, RIR +1)" },
  { id: "intensity", label: "Intensity (load -20%, RIR +2)" },
  { id: "recovery", label: "Recovery (sets -50%, load -30%, RIR +2)" },
  { id: "custom", label: "Custom (I'll apply manually)" },
];

interface DeloadRequestPanelProps {
  clientUserId: string;
  /** Display name for the client header. */
  clientFirstName?: string | null;
}

export const DeloadRequestPanel = memo(function DeloadRequestPanel({
  clientUserId,
  clientFirstName,
}: DeloadRequestPanelProps) {
  const { pending, loading, respond } = useCoachDeloadRequestForClient(clientUserId);
  const [mode, setMode] = useState<"idle" | "approve" | "decline">("idle");
  const [presetId, setPresetId] = useState<string>("volume");
  const [weekOffset, setWeekOffset] = useState<string>("");
  const [responseMessage, setResponseMessage] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  if (loading || !pending) return null;

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      const parsedWeek = weekOffset.trim() ? parseInt(weekOffset, 10) : undefined;
      await respond({
        requestId: pending.id,
        decision: "approved",
        responseMessage: responseMessage || undefined,
        approvedWeekOffset: Number.isFinite(parsedWeek) ? parsedWeek : undefined,
        appliedPresetId: presetId,
      });
      toast.success("Deload approved -- client notified");
      reset();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    setSubmitting(true);
    try {
      await respond({
        requestId: pending.id,
        decision: "declined",
        responseMessage: responseMessage || undefined,
      });
      toast.success("Request declined -- client notified");
      reset();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Decline failed");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setMode("idle");
    setPresetId("volume");
    setWeekOffset("");
    setResponseMessage("");
  };

  return (
    <Card className="border-blue-500/40 bg-blue-500/5">
      <CardContent className="p-4 md:p-5 space-y-3">
        <div className="flex items-start gap-3">
          <Snowflake className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">
              {clientFirstName ?? "Your client"} requested a deload week
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNowStrict(new Date(pending.requestedAt), { addSuffix: true })}
            </p>
            {pending.clientMessage && (
              <p className="mt-2 text-sm italic text-foreground/80 border-l-2 border-blue-500/40 pl-3">
                "{pending.clientMessage}"
              </p>
            )}
          </div>
        </div>

        {/* Action surface */}
        {mode === "idle" && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setMode("approve")}>
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMode("decline")}>
              Decline
            </Button>
          </div>
        )}

        {mode === "approve" && (
          <div className="space-y-2 pt-2 border-t border-blue-500/20">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Preset</Label>
                <Select value={presetId} onValueChange={setPresetId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRESET_OPTIONS.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Week (optional)</Label>
                <Input
                  type="number"
                  min={1}
                  max={52}
                  placeholder="e.g. 4"
                  value={weekOffset}
                  onChange={(e) => setWeekOffset(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Message to client (optional)</Label>
              <Textarea
                value={responseMessage}
                onChange={(e) => setResponseMessage(e.target.value.slice(0, 500))}
                placeholder="Looks like a good idea -- I'll drop the volume for W4 and we'll pick back up after."
                className="min-h-[60px] text-xs"
                maxLength={500}
              />
            </div>
            <div className="text-[10px] text-muted-foreground italic">
              Approving notifies the client and applies the deload to the chosen week of their
              program automatically (defaults to the current week if left blank).
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleApprove} disabled={submitting}>
                {submitting && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Confirm approve
              </Button>
              <Button size="sm" variant="ghost" onClick={reset} disabled={submitting}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {mode === "decline" && (
          <div className="space-y-2 pt-2 border-t border-blue-500/20">
            <Label className="text-[10px] text-muted-foreground">Reason (optional)</Label>
            <Textarea
              value={responseMessage}
              onChange={(e) => setResponseMessage(e.target.value.slice(0, 500))}
              placeholder="Let's give it another week -- you crushed the last block."
              className="min-h-[60px] text-xs"
              maxLength={500}
            />
            <div className="text-[10px] text-muted-foreground italic">
              Client will see a 7-day cool-off before they can request again.
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={handleDecline} disabled={submitting}>
                {submitting && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Confirm decline
              </Button>
              <Button size="sm" variant="ghost" onClick={reset} disabled={submitting}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
