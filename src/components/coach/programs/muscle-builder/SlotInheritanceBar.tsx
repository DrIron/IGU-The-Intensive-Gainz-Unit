// src/components/coach/programs/muscle-builder/SlotInheritanceBar.tsx
//
// Phase 4 polish. On W2+ MuscleSlotCard popovers, surfaces which fields are
// auto-derived from a W1 rule and which the coach has manually overridden.
// Override chips include a clear-X that reverts to the rule-derived value.
//
// Spec: docs/PLANNING_BOARD_WEEKLY_DELTAS_PLAN.md §4.3

import { memo } from "react";
import { cn } from "@/lib/utils";
import { Wand2, X } from "lucide-react";
import type { DeltaTarget } from "./weeklyDeltaEngine";

const TARGET_SHORT_LABELS: Record<DeltaTarget, string> = {
  sets: "Sets",
  repMin: "Rep min",
  repMax: "Rep max",
  tempo: "Tempo",
  rir: "RIR",
  rpe: "RPE",
  instructions: "Notes",
};

interface SlotInheritanceBarProps {
  /** DeltaTargets the W1 sibling has rules on. */
  w1RuleTargets: DeltaTarget[];
  /** Current overrides on this slot. */
  manualOverrides: DeltaTarget[];
  /** Coach clicks the override chip's X to revert to rule-derived. */
  onClearOverride: (target: DeltaTarget) => void;
}

export const SlotInheritanceBar = memo(function SlotInheritanceBar({
  w1RuleTargets,
  manualOverrides,
  onClearOverride,
}: SlotInheritanceBarProps) {
  if (w1RuleTargets.length === 0) return null;

  const overrideSet = new Set(manualOverrides);

  return (
    <div className="rounded-md border border-border/40 bg-muted/10 p-2 space-y-1">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Wand2 className="h-2.5 w-2.5" />
        <span>Inherited from W1 rules</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {w1RuleTargets.map((target) => {
          const isOverride = overrideSet.has(target);
          return (
            <span
              key={target}
              className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-medium",
                isOverride
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  : "border-primary/30 bg-primary/10 text-primary",
              )}
              title={
                isOverride
                  ? "You've hand-edited this field. Rule recompute will skip it. Click X to revert."
                  : "Auto-derived from W1 rule. Editing this field will mark it as a manual override."
              }
            >
              {TARGET_SHORT_LABELS[target]}
              <span className="text-[9px] opacity-70">{isOverride ? "override" : "auto"}</span>
              {isOverride && (
                <button
                  type="button"
                  onClick={() => onClearOverride(target)}
                  className="ml-0.5 hover:text-amber-900 dark:hover:text-amber-200"
                  aria-label={`Revert ${TARGET_SHORT_LABELS[target]} override`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
});
