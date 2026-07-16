import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/errorLogging";
import { format } from "date-fns";
import { Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ClientMacroNudge (P5c-client) — a gentle, client-facing note when their week's logging drifts
 * on an ADDITIVE reason. The most tone-sensitive copy in the whole arc: an automated message to
 * a client about their own eating.
 *
 * ── The wellbeing decision (deliberate deviation from "mirror the coach nudge") ──────────────
 * The client nudge fires ONLY on additive reasons — protein_low and calories_low, both of which
 * point somewhere kind ("add a protein source", "fuel enough"). calories_HIGH is SUPPRESSED for
 * the client: the coach still receives it (P5c email), but a person never gets an automated "you
 * ate too much". Telling someone by machine that they overate is exactly the kind of message
 * that damages a relationship with food, and it is the one this component refuses to send.
 *
 * Tone is supportive, not a warning: a soft brand wash + a friendly icon, NOT the coach-side
 * amber/attention alert, NOT red/destructive, NOT a warning triangle. It should read as an
 * encouraging note from a coach who's got your back — support available, not surveillance.
 */

interface Evaluation {
  fires: boolean;
  reasons: string[];
  insufficient_data: boolean;
}

const CLIENT_REASONS = ["protein_low", "calories_low"] as const;
type ClientReason = (typeof CLIENT_REASONS)[number];

const REASON_COPY: Record<ClientReason, string> = {
  protein_low:
    "Your protein's landed a little under target this past week. Adding a protein source to a couple of meals is an easy way to get there.",
  calories_low:
    "You've been eating a bit under your target this week — make sure you're fueling enough to feel and perform your best.",
};

const dismissKey = (clientUserId: string, date: string, reasons: ClientReason[]) =>
  `igu_macro_nudge_dismissed:${clientUserId}:${date}:${[...reasons].sort().join("-")}`;

export function ClientMacroNudge({ clientUserId }: { clientUserId: string }) {
  const [reasons, setReasons] = useState<ClientReason[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const today = format(new Date(), "yyyy-MM-dd");
  const fetchedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!clientUserId || fetchedFor.current === clientUserId) return;
    fetchedFor.current = clientUserId;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("evaluate_loud_macro_alert", {
          p_client_id: clientUserId,
          p_end_date: today,
        });
        if (error) throw error;
        const e = data as unknown as Evaluation | null;
        if (!e || e.insufficient_data || !e.fires) return;

        // Additive reasons only. A calories_high-only fire yields an empty list → no nudge.
        const clientReasons = e.reasons.filter((r): r is ClientReason =>
          (CLIENT_REASONS as readonly string[]).includes(r),
        );
        if (clientReasons.length === 0) return;

        // Respect a same-day, same-reason dismissal so it doesn't re-nag on every page load.
        try {
          if (localStorage.getItem(dismissKey(clientUserId, today, clientReasons))) {
            setDismissed(true);
          }
        } catch {
          /* localStorage unavailable (private mode) — just show it; a soft note is harmless. */
        }
        setReasons(clientReasons);
      } catch (err: unknown) {
        // Silent: a failed evaluation is not a reason to worry a client. No nudge.
        captureException(err, { source: "ClientMacroNudge" });
      }
    })();
  }, [clientUserId, today]);

  if (reasons.length === 0 || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(dismissKey(clientUserId, today, reasons), "1");
    } catch {
      /* best-effort persistence */
    }
  };

  // protein line leads when both fire.
  const ordered = [...reasons].sort((a, b) => (a === "protein_low" ? -1 : b === "protein_low" ? 1 : 0));

  return (
    <div
      data-client-macro-nudge
      className={cn(
        // Soft brand wash — warm, not an alarm. Deliberately NOT status-attention / destructive.
        "relative flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4",
      )}
    >
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 pr-6 text-sm">
        <p className="font-medium text-foreground">A small note on this week</p>
        {ordered.map((r) => (
          <p key={r} className="mt-1 text-muted-foreground">
            {REASON_COPY[r]}
          </p>
        ))}
        <p className="mt-2 text-muted-foreground">Your coach can help you dial it in if you'd like.</p>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss this note"
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
