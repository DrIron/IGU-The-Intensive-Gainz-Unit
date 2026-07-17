import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ChevronRight } from "lucide-react";
import { ClickableCard } from "@/components/ui/clickable-card";
import { CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadError } from "@/components/ui/load-error";
import { NutritionSummary } from "../NutritionSummary";
import { useFoodLog } from "./useFoodLog";

/**
 * TodayFoodCard — the compact entry point into the food diary.
 *
 * Lives on the /nutrition landings (1:1 + team), the client dashboard, and links into the
 * dedicated /nutrition-diary sub-page. It shows today's running total using the SAME
 * NutritionSummary primitive the full diary uses, so the number on the card and the number
 * inside the diary are literally the same visual — tap-through never surprises.
 *
 * ── Honesty (mirrors useFoodLog's own contract) ─────────────────────────────
 * A failed read is NOT an empty day. On loadError this renders a LoadError with a retry,
 * never a 0-kcal "nothing logged" summary — asserting an absence we can't stand behind is
 * the exact bug LoadError exists to prevent. No target → NutritionSummary already drops the
 * "of N" and the progress bar; nothing is fabricated.
 */
export function TodayFoodCard({ clientUserId }: { clientUserId: string }) {
  const navigate = useNavigate();
  const { totals, target, loading, loadError, reload } = useFoodLog(
    clientUserId,
    format(new Date(), "yyyy-MM-dd"),
  );

  return (
    <ClickableCard onClick={() => navigate("/nutrition-diary")} ariaLabel="Open your food diary">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            Today's food
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
            Open diary
            <ChevronRight className="h-4 w-4" aria-hidden />
          </span>
        </div>

        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : loadError ? (
          // Stop propagation so Retry only retries — without this the button click bubbles
          // to the card and also navigates away (double action).
          <div onClick={(e) => e.stopPropagation()}>
            <LoadError message="We couldn't load today's food." onRetry={reload} size="sm" />
          </div>
        ) : (
          <NutritionSummary totals={totals} target={target} size="sm" />
        )}
      </CardContent>
    </ClickableCard>
  );
}
