// src/components/nutrition/NutritionDecisionCard.tsx
//
// Decision-first hero for the coach Nutrition tab (redesign B2 --
// docs/COACH_CLIENT_REDESIGN.md "Nutrition (decision-first)"). Promotes the
// current week's adjustment decision above the phase hero so the 1:1 coaching
// loop is the first thing the coach sees, not buried in a sub-tab.
//
// States (in priority order):
//   pending adjustment  -> macro delta + Approve / Reject
//   recommendation due  -> "Approve -225 kcal" + Adjust (custom) + Diet break
//   < 3 weigh-ins       -> calm waiting line
//   on track / done     -> calm "no change suggested" line
//
// All numbers come from the shared recommendWeeklyAdjustment() engine; actions
// reuse CoachNutritionProgress's handlers (no forked write logic).

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Bolt,
  ArrowUp,
  ArrowDown,
  Coffee,
  Check,
  X,
  Clock,
  CircleCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdjustmentRecommendation } from "@/utils/nutritionCalculations";
import type { WeekSnapshot } from "./NutritionAdjustmentWeekCard";

interface NutritionDecisionCardProps {
  weekNumber: number;
  recommendation: AdjustmentRecommendation;
  /** weeks[0].adjustment -- when present, drives the pending/applied state. */
  existingAdjustment: WeekSnapshot["adjustment"];
  averageWeight: number;
  weighInCount: number;
  actualChange: number | null;
  signedExpectedChange: number;
  currentCalories: number;
  loading?: boolean;
  isReadOnly?: boolean;
  /** One-click apply (create + approve) at the recommended or custom amount. */
  onApply: (weekNumber: number, amount: number, notes?: string) => void;
  /** Diet-break creation -- reuses the existing pending flow. */
  onDietBreak: (weekNumber: number) => void;
  onApprove?: (weekNumber: number) => void;
  onReject?: (weekNumber: number) => void;
}

export function NutritionDecisionCard({
  weekNumber,
  recommendation,
  existingAdjustment,
  averageWeight,
  weighInCount,
  actualChange,
  signedExpectedChange,
  currentCalories,
  loading,
  isReadOnly = false,
  onApply,
  onDietBreak,
  onApprove,
  onReject,
}: NutritionDecisionCardProps) {
  const adj = existingAdjustment;

  // --- Pending: the only state with an outstanding decision on an existing row.
  if (adj && adj.status === "pending") {
    const delta = adj.approved_calorie_adjustment;
    return (
      <DecisionShell tone="warning" weekNumber={weekNumber} badge="Pending review">
        <DeviationStrip
          actualChange={actualChange}
          signedExpectedChange={signedExpectedChange}
        />
        <div className="flex items-center gap-2 text-sm">
          {adj.is_diet_break_week ? (
            <>
              <Coffee className="h-4 w-4 text-amber-500" aria-hidden="true" />
              <span>Diet break week</span>
            </>
          ) : delta >= 0 ? (
            <>
              <ArrowUp className="h-4 w-4 text-emerald-500" aria-hidden="true" />
              <span>+{Math.round(delta)} kcal</span>
            </>
          ) : (
            <>
              <ArrowDown className="h-4 w-4 text-destructive" aria-hidden="true" />
              <span>{Math.round(delta)} kcal</span>
            </>
          )}
        </div>
        <MacroRow
          calories={adj.new_daily_calories}
          protein={adj.new_protein_grams}
          fat={adj.new_fat_grams}
          carbs={adj.new_carb_grams}
        />
        {!isReadOnly && onApprove && onReject && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onApprove(weekNumber)} disabled={loading} className="flex-1">
              <Check className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => onReject(weekNumber)} disabled={loading} className="flex-1">
              <X className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Reject
            </Button>
          </div>
        )}
      </DecisionShell>
    );
  }

  // --- Already settled this week (approved / diet break / delayed): calm confirm.
  if (adj) {
    return (
      <CalmLine
        weekNumber={weekNumber}
        icon={<CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />}
        text={
          adj.is_diet_break_week
            ? "Diet break in place this week."
            : adj.is_delayed
              ? "Week delayed -- macros held."
              : "Macros set for this week."
        }
      />
    );
  }

  // --- Recommendation due: the headline decision.
  if (recommendation.isDue && !isReadOnly) {
    const cut = recommendation.suggestedKcal < 0;
    return (
      <DecisionShell tone="warning" weekNumber={weekNumber} badge="Adjustment recommended">
        <DeviationStrip
          actualChange={actualChange}
          signedExpectedChange={signedExpectedChange}
          deviationPct={recommendation.deviationPct}
        />
        <p className="text-sm text-muted-foreground">{recommendation.reason}</p>
        <div className="flex items-center gap-2 text-sm">
          {cut ? (
            <ArrowDown className="h-4 w-4 text-destructive" aria-hidden="true" />
          ) : (
            <ArrowUp className="h-4 w-4 text-emerald-500" aria-hidden="true" />
          )}
          <span className="font-mono tabular-nums">
            {recommendation.suggestedKcal > 0 ? "+" : ""}
            {recommendation.suggestedKcal} kcal
          </span>
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {Math.round(currentCalories)} → {Math.round(recommendation.newCalories)}
          </span>
        </div>
        <MacroRow
          calories={recommendation.newCalories}
          protein={recommendation.newProtein}
          fat={recommendation.newFat}
          carbs={recommendation.newCarbs}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => onApply(weekNumber, recommendation.suggestedKcal)}
            disabled={loading}
          >
            <Check className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
            Approve {recommendation.suggestedKcal > 0 ? "+" : ""}
            {recommendation.suggestedKcal} kcal
          </Button>
          <AdjustPopover
            defaultAmount={recommendation.suggestedKcal}
            loading={loading}
            onApply={(amount, notes) => onApply(weekNumber, amount, notes)}
          />
          <Button size="sm" variant="outline" onClick={() => onDietBreak(weekNumber)} disabled={loading}>
            <Coffee className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
            Diet break
          </Button>
        </div>
      </DecisionShell>
    );
  }

  // --- Not due: waiting for weigh-ins, or on track.
  const waiting = weighInCount < 3;
  return (
    <CalmLine
      weekNumber={weekNumber}
      icon={
        waiting ? (
          <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        ) : (
          <CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        )
      }
      text={recommendation.reason}
    />
  );
}

// ──────────────────────────────────────────────────────────────────────────────

function DecisionShell({
  tone,
  weekNumber,
  badge,
  children,
}: {
  tone: "warning";
  weekNumber: number;
  badge: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("overflow-hidden border-amber-500/30 bg-amber-500/5")}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
            <Bolt className="h-4 w-4" aria-hidden="true" />
            This week's decision · Week {weekNumber}
          </span>
          <Badge
            variant="outline"
            className="shrink-0 text-[10px] border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          >
            {badge}
          </Badge>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function CalmLine({
  weekNumber,
  icon,
  text,
}: {
  weekNumber: number;
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-2.5">
        {icon}
        <span className="text-sm">
          <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider mr-2">
            Week {weekNumber}
          </span>
          {text}
        </span>
      </CardContent>
    </Card>
  );
}

function DeviationStrip({
  actualChange,
  signedExpectedChange,
  deviationPct,
}: {
  actualChange: number | null;
  signedExpectedChange: number;
  deviationPct?: number | null;
}) {
  if (actualChange == null) return null;
  return (
    <div className="font-mono text-[11px] tabular-nums text-muted-foreground flex items-center gap-2">
      <span className="text-foreground">
        {actualChange > 0 ? "+" : ""}
        {actualChange.toFixed(2)}%
      </span>
      <span className="opacity-60">vs</span>
      <span>
        {signedExpectedChange > 0 ? "+" : ""}
        {signedExpectedChange.toFixed(2)}% expected
      </span>
      {deviationPct != null && (
        <span className="ml-auto text-amber-600 dark:text-amber-400">
          {deviationPct > 0 ? "+" : ""}
          {Math.round(deviationPct)}% dev
        </span>
      )}
    </div>
  );
}

function MacroRow({
  calories,
  protein,
  fat,
  carbs,
}: {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}) {
  return (
    <div className="grid grid-cols-4 gap-2 font-mono text-[11px] tabular-nums">
      <MacroCell label="kcal" value={Math.round(calories)} />
      <MacroCell label="P" value={`${Math.round(protein)}g`} />
      <MacroCell label="F" value={`${Math.round(fat)}g`} />
      <MacroCell label="C" value={`${Math.round(carbs)}g`} />
    </div>
  );
}

function MacroCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded bg-background/60 px-2 py-1">
      <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-[12px] font-medium">{value}</div>
    </div>
  );
}

function AdjustPopover({
  defaultAmount,
  loading,
  onApply,
}: {
  defaultAmount: number;
  loading?: boolean;
  onApply: (amount: number, notes?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(defaultAmount));
  const [notes, setNotes] = useState("");

  const submit = () => {
    const raw = parseInt(amount, 10);
    if (!Number.isFinite(raw) || Math.abs(raw) < 50) return;
    onApply(raw, notes || undefined);
    setOpen(false);
    setNotes("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={loading}>
          Adjust
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Amount (kcal, +/-)</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-8"
          />
          <p className="text-[10px] text-muted-foreground">
            Minimum ±50 kcal; macros scaled to preserve ratios.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="text-xs"
            placeholder="Why this change..."
          />
        </div>
        <Button size="sm" onClick={submit} disabled={loading} className="w-full">
          Apply {parseInt(amount, 10) > 0 ? "+" : ""}
          {amount || 0} kcal
        </Button>
      </PopoverContent>
    </Popover>
  );
}
