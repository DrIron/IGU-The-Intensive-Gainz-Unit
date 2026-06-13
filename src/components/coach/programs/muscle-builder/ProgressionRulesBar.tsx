// src/components/coach/programs/muscle-builder/ProgressionRulesBar.tsx
//
// Compact trigger rendered under the WeekTabStrip. Surfaces the count + a
// one-line summary of the mesocycle's progression (delta) rules and opens
// ProgressionRulesSheet for aggregated authoring. Hidden for single-week plans
// (no "following weeks" to progress into).
//
// Plan: docs/PLANNING_BOARD_UX_REVISIONS_PLAN.md §3

import { memo, useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WeekData } from "@/types/muscle-builder";
import type { WeeklyDeltaRule } from "./weeklyDeltaEngine";
import {
  ProgressionRulesSheet,
  describeRule,
  isStrengthSlot,
} from "./ProgressionRulesSheet";

interface ProgressionRulesBarProps {
  /** Full mesocycle. Rules live on weeks[0] (W1) strength slots. */
  weeks: WeekData[];
  /** Whether any W1 slot carries a rule — drives the active/empty styling. */
  planHasRules: boolean;
  /** Persist a slot's rules (same callback the per-slot popover uses). */
  onSetSlotDeltaRules: (slotId: string, rules: WeeklyDeltaRule[]) => void;
}

export const ProgressionRulesBar = memo(function ProgressionRulesBar({
  weeks,
  planHasRules,
  onSetSlotDeltaRules,
}: ProgressionRulesBarProps) {
  const [open, setOpen] = useState(false);

  // Distinct rule labels (e.g. "Sets +1", "RIR -1") across all W1 strength
  // slots, plus how many slots carry at least one rule. Computed before any
  // early return to keep hook order stable.
  const { ruleCount, summary } = useMemo(() => {
    const strength = (weeks[0]?.slots ?? []).filter(isStrengthSlot);
    const labels: string[] = [];
    const seen = new Set<string>();
    let slotsWithRules = 0;
    for (const slot of strength) {
      const rules = slot.deltaRules ?? [];
      if (rules.length > 0) slotsWithRules += 1;
      for (const rule of rules) {
        const label = describeRule(rule);
        if (!seen.has(label)) {
          seen.add(label);
          labels.push(label);
        }
      }
    }
    if (labels.length === 0) {
      return { ruleCount: 0, summary: "No rules yet — add one to auto-progress weeks" };
    }
    return {
      ruleCount: labels.length,
      summary: `${labels.join(", ")} · ${slotsWithRules} slot${slotsWithRules === 1 ? "" : "s"}`,
    };
  }, [weeks]);

  // Nothing to progress into on a single-week plan.
  if (weeks.length <= 1) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2 min-h-[44px] text-left transition-colors touch-manipulation",
          planHasRules
            ? "border-primary/30 bg-primary/5 hover:bg-primary/10"
            : "border-dashed border-border/60 hover:bg-muted/40",
        )}
        aria-label="Edit progression rules"
      >
        <span className="flex items-center gap-2 min-w-0">
          <TrendingUp className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium shrink-0">
            Progression rules ({ruleCount})
          </span>
          <span className="text-xs text-muted-foreground truncate hidden sm:inline">
            {summary}
          </span>
        </span>
        <span className="text-xs text-primary font-medium shrink-0">Edit</span>
      </button>

      <ProgressionRulesSheet
        open={open}
        onOpenChange={setOpen}
        weeks={weeks}
        onSetSlotDeltaRules={onSetSlotDeltaRules}
      />
    </>
  );
});
