import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/errorLogging";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

/**
 * MacroAlertBanner (P5c) — the coach-facing surface of the loud macro-alert signal, on the
 * food-log panel above the P5a adherence card.
 *
 * Tone is ATTENTION (amber), never RISK (red). Loud ≠ alarming: this is a heads-up worth
 * seeing, not an emergency. And it holds the same honesty gate as the email — it only appears
 * when evaluate_loud_macro_alert actually fires (≥ 4 logged days, past tolerance). On
 * insufficient_data or !fires it renders nothing: a coach must never see a nutrition warning
 * built on two logged days.
 */

interface Evaluation {
  fires: boolean;
  reasons: string[];
  insufficient_data: boolean;
  calorie_deviation_pct: number | null;
  protein_deviation_pct: number | null;
}

const REASON_TEXT: Record<string, (e: Evaluation) => string> = {
  protein_low: (e) =>
    `average protein is about ${Math.abs(e.protein_deviation_pct ?? 0)}% under target`,
  calories_low: (e) => `average calories are about ${Math.abs(e.calorie_deviation_pct ?? 0)}% under target`,
  calories_high: (e) => `average calories are about ${Math.abs(e.calorie_deviation_pct ?? 0)}% over target`,
};

export function MacroAlertBanner({ clientUserId }: { clientUserId: string }) {
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const fetchedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!clientUserId || fetchedFor.current === clientUserId) return;
    fetchedFor.current = clientUserId;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("evaluate_loud_macro_alert", {
          p_client_id: clientUserId,
          p_end_date: format(new Date(), "yyyy-MM-dd"),
        });
        if (error) throw error;
        setEvaluation(data as unknown as Evaluation);
      } catch (e: unknown) {
        // Silent: a failed evaluation is not a reason to alarm the coach. No banner.
        captureException(e, { source: "MacroAlertBanner" });
      }
    })();
  }, [clientUserId]);

  // The honesty gate, restated at the UI: no banner on sparse data or when nothing fires.
  if (!evaluation || evaluation.insufficient_data || !evaluation.fires) return null;

  const parts = evaluation.reasons.map((r) => REASON_TEXT[r]?.(evaluation)).filter(Boolean) as string[];
  if (parts.length === 0) return null;
  const sentence = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(", ") + " and " + parts.slice(-1);

  return (
    <div
      role="status"
      data-macro-alert-banner
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4",
        // ATTENTION tone — amber. Deliberately NOT status-risk / destructive.
        "border-status-attention/40 bg-status-attention/10",
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-attention" aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-medium text-foreground">Worth a nutrition check-in</p>
        <p className="mt-0.5 text-muted-foreground">
          Over the last 7 days, this client's {sentence}. A quick message or a small target tweak
          can help — nothing urgent.
        </p>
      </div>
    </div>
  );
}
