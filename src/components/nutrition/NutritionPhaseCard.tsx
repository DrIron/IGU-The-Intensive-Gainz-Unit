import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, ArrowDown } from "lucide-react";
import { MacroDistributionRibbon } from "./MacroDistributionRibbon";
import { cn } from "@/lib/utils";
import { differenceInCalendarWeeks } from "date-fns";

/**
 * Hero overview card for a client's active nutrition phase. Follows the
 * Planning Board StudioSlotCard vocabulary: one large monospace hero line,
 * a thin status rail, minimal decoration, typography carries the weight.
 *
 * The "status" derives from actual vs expected weekly rate:
 *   - On Track  (green)  |deviation| <= 30%
 *   - Ahead     (amber)  overshooting goal (e.g. losing faster than planned)
 *   - Behind    (red)    undershooting goal
 *   - No data            fewer than 2 weeks of weigh-ins
 */
interface NutritionPhaseCardProps {
  phase: {
    id: string;
    phase_name: string;
    goal_type: "loss" | "gain" | "maintenance" | string;
    start_date: string;
    daily_calories: number;
    protein_grams: number;
    fat_grams: number;
    carb_grams: number;
    weekly_rate_percentage: number;
    target_weight_kg: number | null;
    starting_weight_kg: number;
  };
  /** Average weight from the most recent week with weigh-ins (null if none). */
  latestAverageWeight?: number | null;
  /** Actual weekly rate % from the most recent week vs the previous week. */
  latestActualChangePercent?: number | null;
  /** Weeks elapsed since phase start_date. */
  weeksElapsed?: number;
  onEditPhase?: () => void;
  onScrollToAdjustments?: () => void;
  className?: string;
}

const GOAL_LABELS: Record<string, string> = {
  loss: "Fat Loss",
  gain: "Muscle Gain",
  maintenance: "Maintenance",
};

type Status = "on_track" | "ahead" | "behind" | "no_data";

export function NutritionPhaseCard({
  phase,
  latestAverageWeight,
  latestActualChangePercent,
  weeksElapsed,
  onEditPhase,
  onScrollToAdjustments,
  className,
}: NutritionPhaseCardProps) {
  const weeks = useMemo(() => {
    if (weeksElapsed != null) return weeksElapsed;
    try {
      const start = new Date(phase.start_date);
      return Math.max(1, differenceInCalendarWeeks(new Date(), start) + 1);
    } catch {
      return 1;
    }
  }, [phase.start_date, weeksElapsed]);

  const status: Status = useMemo(() => {
    if (latestActualChangePercent == null) return "no_data";
    const expected = phase.weekly_rate_percentage;
    // Maintenance: "on track" if actual stayed within +-0.25% of zero.
    if (phase.goal_type === "maintenance") {
      return Math.abs(latestActualChangePercent) <= 0.25 ? "on_track" : "behind";
    }
    // For loss/gain, sign matters: overshooting = "ahead", undershooting = "behind".
    const signedExpected = phase.goal_type === "loss" ? -expected : expected;
    if (signedExpected === 0) return "on_track";
    const deviation = ((latestActualChangePercent - signedExpected) / Math.abs(signedExpected)) * 100;
    if (Math.abs(deviation) <= 30) return "on_track";
    if (phase.goal_type === "loss") {
      return latestActualChangePercent < signedExpected ? "ahead" : "behind";
    }
    return latestActualChangePercent > signedExpected ? "ahead" : "behind";
  }, [latestActualChangePercent, phase.goal_type, phase.weekly_rate_percentage]);

  const goalLabel = GOAL_LABELS[phase.goal_type] || phase.goal_type;
  const expectedLabel = phase.weekly_rate_percentage?.toFixed(2) ?? "0.00";
  const actualLabel = latestActualChangePercent != null ? latestActualChangePercent.toFixed(2) : null;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-0">
        {/* Status rail on the left edge */}
        <div className="flex">
          <div
            aria-hidden
            className={cn(
              "w-1 shrink-0",
              status === "on_track" && "bg-emerald-500",
              status === "ahead" && "bg-amber-500",
              status === "behind" && "bg-destructive",
              status === "no_data" && "bg-muted",
            )}
          />

          <div className="flex-1 p-5 md:p-6 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h2 className="font-semibold text-lg md:text-xl truncate">{phase.phase_name}</h2>
                  <Badge variant="secondary" className="shrink-0">{goalLabel}</Badge>
                </div>
                <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  Week {weeks}
                  {phase.target_weight_kg != null && ` | target ${phase.target_weight_kg.toFixed(1)} kg`}
                  {latestAverageWeight != null && ` | avg ${latestAverageWeight.toFixed(1)} kg`}
                </p>
              </div>
              <StatusBadge status={status} />
            </div>

            {/* Hero numbers */}
            <div className="flex items-baseline gap-4 font-mono tabular-nums">
              <div>
                <span className="text-3xl md:text-4xl font-display leading-none">
                  {Math.round(phase.daily_calories)}
                </span>
                <span className="text-[11px] text-muted-foreground ml-1">kcal</span>
              </div>
              <div className="text-[11px] text-muted-foreground hidden md:block">
                P {Math.round(phase.protein_grams)}g &nbsp;|&nbsp;
                F {Math.round(phase.fat_grams)}g &nbsp;|&nbsp;
                C {Math.round(phase.carb_grams)}g
              </div>
            </div>

            <MacroDistributionRibbon
              protein={phase.protein_grams}
              fat={phase.fat_grams}
              carbs={phase.carb_grams}
            />

            {/* Rate comparison strip */}
            {phase.goal_type !== "maintenance" && (
              <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground tabular-nums gap-3 border-t pt-3">
                <div>
                  <span className="opacity-70">expected</span>{" "}
                  <span className="text-foreground">
                    {phase.goal_type === "loss" ? "-" : "+"}
                    {expectedLabel}%
                  </span>
                  <span className="opacity-70"> / {phase.goal_type === "gain" ? "mo" : "wk"}</span>
                </div>
                <div>
                  <span className="opacity-70">actual</span>{" "}
                  {actualLabel != null ? (
                    <span className="text-foreground">{Number(actualLabel) > 0 ? "+" : ""}{actualLabel}%</span>
                  ) : (
                    <span className="opacity-70">--</span>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              {onEditPhase && (
                <Button size="sm" variant="outline" onClick={onEditPhase}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Edit phase
                </Button>
              )}
              {onScrollToAdjustments && (
                <Button size="sm" variant="ghost" onClick={onScrollToAdjustments}>
                  <ArrowDown className="h-3.5 w-3.5 mr-1" />
                  Review weeks
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; classes: string }> = {
    on_track: { label: "On Track", classes: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
    ahead: { label: "Ahead", classes: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
    behind: { label: "Behind", classes: "border-destructive/40 bg-destructive/10 text-destructive" },
    no_data: { label: "No data yet", classes: "border-muted-foreground/30 bg-muted/60 text-muted-foreground" },
  };
  const { label, classes } = map[status];
  return (
    <Badge variant="outline" className={cn("shrink-0 font-medium", classes)}>
      {label}
    </Badge>
  );
}
