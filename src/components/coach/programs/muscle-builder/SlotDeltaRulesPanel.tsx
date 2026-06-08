// src/components/coach/programs/muscle-builder/SlotDeltaRulesPanel.tsx
//
// Collapsible "Change per week" section inside the W1 MuscleSlotCard popover.
// Renders the list of WeeklyDeltaRule entries the coach has authored for this
// slot, plus the + Add rule picker.
//
// Single-rule-per-field rule (D12 — forbid stacking). The Add menu filters
// out targets that already have a rule on the slot.
//
// Plan: docs/PLANNING_BOARD_WEEKLY_DELTAS_PLAN.md §4.2

import { memo, useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, ChevronRight, Plus, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SlotDeltaRuleEditor } from "./SlotDeltaRuleEditor";
import {
  createDefaultRule,
  type WeeklyDeltaRule,
  type DeltaTarget,
  type SetScope,
} from "./weeklyDeltaEngine";
import type { SetPrescription } from "@/types/workout-builder";

interface SlotDeltaRulesPanelProps {
  /** Current rules attached to the slot. */
  rules: WeeklyDeltaRule[];
  /** Total weeks in the mesocycle — drives the preview range. */
  totalWeeks: number;
  /** Per-week deload flags (length === totalWeeks). */
  isDeloadByWeek: boolean[];
  /** W1 base values per target — used to compute the live preview. */
  baseValues: Partial<Record<DeltaTarget, number | string | undefined>>;
  /**
   * Slot's per-set prescription. When a rir/rpe rule's scope targets a
   * specific set (first / last / index), the preview reads the base value
   * from setsDetail[N] instead of the slot-level field — otherwise W1
   * shows "—" on slots that only carry per-set values.
   */
  setsDetail?: SetPrescription[];
  /** Whether the slot has at least one exercise assigned — gates 'instructions' rule. */
  hasExercise: boolean;
  /** Coach edits / removes / adds rules. */
  onChange: (rules: WeeklyDeltaRule[]) => void;
}

const ALL_TARGETS: DeltaTarget[] = [
  "sets",
  "repMin",
  "repMax",
  "tempo",
  "rir",
  "rpe",
  "instructions",
];

const TARGET_PICKER_LABELS: Record<DeltaTarget, string> = {
  sets: "Sets",
  repMin: "Rep range — min",
  repMax: "Rep range — max",
  tempo: "Tempo digit",
  rir: "RIR",
  rpe: "RPE",
  instructions: "Instructions (append)",
};

/**
 * Derive the right base value for a rule's preview. For rir/rpe rules with a
 * per-set scope (last / first / index N), reads from setsDetail. Falls back
 * to the slot-level value otherwise. For non-rir/rpe rules and instructions,
 * the slot-level value is the only one that matters.
 */
function resolveBaseForRule(
  rule: WeeklyDeltaRule,
  baseValues: Partial<Record<DeltaTarget, number | string | undefined>>,
  setsDetail: SetPrescription[] | undefined,
): number | string | undefined {
  if (rule.target !== "rir" && rule.target !== "rpe") {
    return baseValues[rule.target];
  }
  const scope: SetScope = rule.scope;
  if (scope.kind === "all") {
    // Prefer slot-level when set. Fall back to setsDetail[0] when slot-level is
    // missing so the preview shows SOMETHING instead of "—". The engine's
    // fan-out path handles the actual application across all sets.
    const slotVal = baseValues[rule.target];
    if (slotVal !== undefined) return slotVal;
    return setsDetail?.[0]?.[rule.target];
  }
  if (!setsDetail || setsDetail.length === 0) {
    // No per-set data — fall back to slot-level (the rule will be inert at run
    // time and the editor surfaces a warning, but the preview shouldn't crash).
    return baseValues[rule.target];
  }
  const idx =
    scope.kind === "first" ? 0 :
    scope.kind === "last" ? setsDetail.length - 1 :
    scope.setNumber - 1;
  if (idx < 0 || idx >= setsDetail.length) return undefined;
  return setsDetail[idx]?.[rule.target];
}

export const SlotDeltaRulesPanel = memo(function SlotDeltaRulesPanel({
  rules,
  totalWeeks,
  isDeloadByWeek,
  baseValues,
  setsDetail,
  hasExercise,
  onChange,
}: SlotDeltaRulesPanelProps) {
  // Collapsed by default — coach opens deliberately. Empty state nudges them
  // to add a rule. Auto-open when rules already exist on first render so the
  // coach immediately sees them.
  const [isOpen, setIsOpen] = useState(rules.length > 0);

  // Targets already covered by a rule — disabled in the Add menu per D12.
  const takenTargets = useMemo(() => new Set(rules.map((r) => r.target)), [rules]);

  const handleAddTarget = useCallback(
    (target: DeltaTarget) => {
      if (takenTargets.has(target)) return; // belt-and-suspenders against D12 violation
      const next = createDefaultRule(target);
      onChange([...rules, next]);
      setIsOpen(true);
    },
    [rules, takenTargets, onChange],
  );

  const handleUpdateRule = useCallback(
    (updated: WeeklyDeltaRule) => {
      onChange(rules.map((r) => (r.id === updated.id ? updated : r)));
    },
    [rules, onChange],
  );

  const handleRemoveRule = useCallback(
    (id: string) => {
      onChange(rules.filter((r) => r.id !== id));
    },
    [rules, onChange],
  );

  const hasAnyRule = rules.length > 0;

  return (
    <div className="space-y-2 pt-2 border-t border-border/30">
      {/* Header — clickable to toggle */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left group"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-1.5">
          {isOpen ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
          <Wand2 className="h-3 w-3 text-primary" />
          <span className="text-xs font-medium">Change per week</span>
          {hasAnyRule && (
            <span className="text-[10px] text-muted-foreground">
              ({rules.length} rule{rules.length === 1 ? "" : "s"})
            </span>
          )}
        </div>
        {!hasAnyRule && (
          <span className="text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">
            Auto-progress this slot
          </span>
        )}
      </button>

      {/* Body */}
      <div className={cn("space-y-2", !isOpen && "hidden")}>
        {!hasAnyRule && (
          <div className="text-[10px] text-muted-foreground italic px-1">
            Add a rule to auto-progress this slot's prescription across following weeks.
            Coach overrides on any week still win.
          </div>
        )}

        {rules.map((rule) => (
          <SlotDeltaRuleEditor
            key={rule.id}
            rule={rule}
            baseValue={resolveBaseForRule(rule, baseValues, setsDetail)}
            totalWeeks={totalWeeks}
            isDeloadByWeek={isDeloadByWeek}
            onChange={handleUpdateRule}
            onRemove={() => handleRemoveRule(rule.id)}
          />
        ))}

        {/* Add rule picker. Explicit neutral colors override any
            destructive-tinted button styling the popover parent applies via
            cascade (sibling "Apply slot to remaining weeks" is text-primary,
            and the shared popover container was bleeding primary onto every
            child button). */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs border-border/50 bg-background hover:bg-muted/50 text-foreground"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add rule
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {ALL_TARGETS.map((target) => {
              const isTaken = takenTargets.has(target);
              const isInstructionsGated = target === "instructions" && !hasExercise;
              const disabled = isTaken || isInstructionsGated;
              return (
                <DropdownMenuItem
                  key={target}
                  onClick={() => handleAddTarget(target)}
                  disabled={disabled}
                  className="text-xs"
                >
                  <span className="flex-1">{TARGET_PICKER_LABELS[target]}</span>
                  {isTaken && (
                    <span className="text-[10px] text-muted-foreground ml-2">added</span>
                  )}
                  {!isTaken && isInstructionsGated && (
                    <span className="text-[10px] text-muted-foreground ml-2">
                      assign exercise first
                    </span>
                  )}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
});
