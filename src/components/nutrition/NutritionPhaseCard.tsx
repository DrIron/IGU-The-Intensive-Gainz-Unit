import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, ArrowDown } from "lucide-react";
import { NutritionSummary } from "./NutritionSummary";
import { cn } from "@/lib/utils";
import { differenceInCalendarWeeks } from "date-fns";
import { classifyPhaseStatus, interpretPhaseStatus, toneClasses, type PhaseStatus } from "@/lib/interpret";

/**
 * Hero overview card for a client's nutrition phase. Follows the
 * Planning Board StudioSlotCard vocabulary: one large monospace hero line,
 * a thin status rail, minimal decoration, typography carries the weight.
 *
 * The "status" derives from actual vs expected weekly rate:
 *   - Completed (slate)  phase has ended (is_active === false). Takes
 *                        precedence -- past phases get a neutral badge
 *                        regardless of the underlying rate math.
 *   - On Track  (green)  |deviation| <= 30%
 *   - Ahead     (amber)  overshooting goal (e.g. losing faster than planned)
 *   - Behind    (red)    undershooting goal
 *   - No data            fewer than 2 weeks of weigh-ins
 */
interface NutritionPhaseCardProps {
  phase: {
    id: string;
    phase_name: string;
    goal_type: "fat_loss" | "muscle_gain" | "maintenance" | string;
    start_date: string;
    daily_calories: number;
    protein_grams: number;
    fat_grams: number;
    carb_grams: number;
    weekly_rate_percentage: number;
    target_weight_kg: number | null;
    starting_weight_kg: number;
    // Past-phase signals -- optional so existing callers that pass a partial
    // phase shape still compile. When `is_active === false` the card switches
    // to a "Completed" badge and caps the week counter at completed_at /
    // end_date instead of letting it climb forever.
    is_active?: boolean;
    completed_at?: string | null;
    end_date?: string | null;
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
  fat_loss: "Fat Loss",
  muscle_gain: "Muscle Gain",
  maintenance: "Maintenance",
};

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
      // Cap the week counter at the phase's end for past phases -- otherwise a
      // phase that ended 6 months ago keeps incrementing to "Week 38".
      const upperBoundIso =
        phase.is_active === false ? phase.completed_at ?? phase.end_date ?? null : null;
      const upper = upperBoundIso ? new Date(upperBoundIso) : new Date();
      return Math.max(1, differenceInCalendarWeeks(upper, start) + 1);
    } catch {
      return 1;
    }
  }, [phase.start_date, phase.is_active, phase.completed_at, phase.end_date, weeksElapsed]);

  const goalType = phase.goal_type;
  // Status comes from the single-source classifier in src/lib/interpret.ts
  // (extracted verbatim from this card -- see interpret.ts + NutritionPhaseCard.status.test.ts
  // for the parity proof). Do not re-inline a second copy here.
  const normalizedGoal = goalType as "fat_loss" | "muscle_gain" | "maintenance";
  const status: PhaseStatus = useMemo(
    () =>
      classifyPhaseStatus({
        isActive: phase.is_active !== false,
        latestActualChangePercent: latestActualChangePercent ?? null,
        weeklyRatePercentage: phase.weekly_rate_percentage,
        goalType: normalizedGoal,
      }),
    [phase.is_active, latestActualChangePercent, normalizedGoal, phase.weekly_rate_percentage],
  );

  const interpretation = useMemo(
    () =>
      interpretPhaseStatus({
        status,
        latestActualChangePercent: latestActualChangePercent ?? null,
        weeklyRatePercentage: phase.weekly_rate_percentage,
        goalType: normalizedGoal,
      }),
    [status, latestActualChangePercent, normalizedGoal, phase.weekly_rate_percentage],
  );

  const goalLabel = GOAL_LABELS[goalType] || goalType;
  const expectedLabel = phase.weekly_rate_percentage?.toFixed(2) ?? "0.00";
  const actualLabel = latestActualChangePercent != null ? latestActualChangePercent.toFixed(2) : null;

  // Projected weeks to target at the prescribed weekly rate (planned pace, not
  // actual). Active non-maintenance phases with a target + a known weight only.
  const projectedWeeks = useMemo(() => {
    if (phase.is_active === false || goalType === "maintenance") return null;
    const target = phase.target_weight_kg;
    const current = latestAverageWeight ?? phase.starting_weight_kg ?? null;
    if (target == null || current == null) return null;
    const remaining = Math.abs(current - target);
    if (remaining < 0.3) return null;
    const weeklyKg = (current * (phase.weekly_rate_percentage ?? 0)) / 100;
    if (weeklyKg <= 0) return null;
    return Math.ceil(remaining / weeklyKg);
  }, [phase.is_active, goalType, phase.target_weight_kg, phase.starting_weight_kg, phase.weekly_rate_percentage, latestAverageWeight]);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-0">
        {/* Status rail on the left edge */}
        <div className="flex">
          <div
            aria-hidden
            className={cn(
              "w-1 shrink-0",
              status === "completed" && "bg-status-neutral",
              status === "on_track" && "bg-status-ontrack",
              status === "ahead" && "bg-status-attention",
              status === "behind" && "bg-status-risk",
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
                {/* `avg` and `~N wks` moved OUT of here and INTO the rate strip below — the
                    donut now takes the top row, so the header keeps only the two facts that
                    identify the phase (which week, and what it's aiming at). */}
                <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  Week {weeks}
                  {phase.target_weight_kg != null && ` | target ${phase.target_weight_kg.toFixed(1)} kg`}
                </p>
              </div>
              <StatusBadge status={status} />
            </div>

            {/* CC2 plain-language interpretation of the status (single source: interpret.ts). */}
            {interpretation.sentence && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden
                  className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", toneClasses(interpretation.tone).dot)}
                />
                {interpretation.sentence}
              </p>
            )}

            {/* THE canonical calories+macros display (Part IV).
                This replaces the Bebas kcal hero + the desktop-only "P 165g | F 55g | C 165g"
                line + the ribbon. The donut earns its space here: the ribbon showed the grams
                but never the PERCENTAGES, and the split is the whole point of a macro target.
                No `target` prop — this is the coach's PLAN, not the client's intake. */}
            <NutritionSummary
              size="md"
              centerLabel="kcal · daily target"
              totals={{
                kcal: phase.daily_calories,
                protein: phase.protein_grams,
                fat: phase.fat_grams,
                carbs: phase.carb_grams,
              }}
            />

            {/* Rate comparison strip. `avg` / `~N wks` were folded in from the header meta
                line (the donut took the top row) — they belong here anyway: all three are the
                phase's PACE, and they were previously split across two places in the card.
                Wraps rather than crushing on narrow cards. */}
            {(goalType !== "maintenance" || latestAverageWeight != null) && (
              <div className="flex flex-wrap items-center justify-between font-mono text-[11px] text-muted-foreground tabular-nums gap-x-3 gap-y-1.5 border-t pt-3">
                {goalType !== "maintenance" && (
                  <>
                    <div>
                      <span className="opacity-70">expected</span>{" "}
                      <span className="text-foreground">
                        {goalType === "fat_loss" ? "-" : "+"}
                        {expectedLabel}%
                      </span>
                      <span className="opacity-70"> / {goalType === "muscle_gain" ? "mo" : "wk"}</span>
                    </div>
                    <div>
                      <span className="opacity-70">actual</span>{" "}
                      {actualLabel != null ? (
                        <span className="text-foreground">{Number(actualLabel) > 0 ? "+" : ""}{actualLabel}%</span>
                      ) : (
                        <span className="opacity-70">--</span>
                      )}
                    </div>
                  </>
                )}
                {latestAverageWeight != null && (
                  <div>
                    <span className="opacity-70">avg</span>{" "}
                    <span className="text-foreground">{latestAverageWeight.toFixed(1)} kg</span>
                    {projectedWeeks != null && (
                      <span className="opacity-70">
                        {" "}· ~{projectedWeeks} wk{projectedWeeks === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              {onEditPhase && (
                <Button size="sm" variant="outline" onClick={onEditPhase}>
                  <Pencil className="h-3.5 w-3.5 me-1" />
                  Edit phase
                </Button>
              )}
              {onScrollToAdjustments && (
                <Button size="sm" variant="ghost" onClick={onScrollToAdjustments}>
                  <ArrowDown className="h-3.5 w-3.5 me-1" />
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

function StatusBadge({ status }: { status: PhaseStatus }) {
  const map: Record<PhaseStatus, { label: string; classes: string }> = {
    completed: { label: "Completed", classes: "border-status-neutral/40 bg-status-neutral/10 text-status-neutral" },
    on_track: { label: "On Track", classes: "border-status-ontrack/40 bg-status-ontrack/10 text-status-ontrack" },
    ahead: { label: "Ahead", classes: "border-status-attention/40 bg-status-attention/10 text-status-attention" },
    behind: { label: "Behind", classes: "border-status-risk/40 bg-status-risk/10 text-status-risk" },
    no_data: { label: "No data yet", classes: "border-muted-foreground/30 bg-muted/60 text-muted-foreground" },
  };
  const { label, classes } = map[status];
  return (
    <Badge variant="outline" className={cn("shrink-0 font-medium", classes)}>
      {label}
    </Badge>
  );
}
