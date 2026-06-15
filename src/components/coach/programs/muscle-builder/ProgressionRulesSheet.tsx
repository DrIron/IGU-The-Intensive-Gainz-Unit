// src/components/coach/programs/muscle-builder/ProgressionRulesSheet.tsx
//
// Aggregating editor for weekly progression (delta) rules. Surfaces the rules
// that otherwise live buried in each W1 slot card's "Change per week" panel so a
// coach can author/review them in one place.
//
// This is a NEW view over the SAME data (MuscleSlotData.deltaRules). It does NOT
// touch weeklyDeltaEngine.ts — it reuses SlotDeltaRulesPanel (which itself
// renders SlotDeltaRuleEditor rows and enforces the single-rule-per-target D12
// constraint) for each W1 strength slot, plus a blanket-authoring header that
// fans createDefaultRule(target) out to every eligible slot.
//
// Plan: docs/PLANNING_BOARD_UX_REVISIONS_PLAN.md §3

import { memo, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerScrollArea,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Plus, Wand2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { DAYS_OF_WEEK, getMuscleDisplay } from "@/types/muscle-builder";
import type { MuscleSlotData, WeekData } from "@/types/muscle-builder";
import { SlotDeltaRulesPanel } from "./SlotDeltaRulesPanel";
import {
  createDefaultRule,
  type DeltaTarget,
  type WeeklyDeltaRule,
} from "./weeklyDeltaEngine";

// ── Shared helpers (also consumed by ProgressionRulesBar) ──────────────────

/** Strength slots are the only ones the delta engine progresses. */
export function isStrengthSlot(slot: MuscleSlotData): boolean {
  return !slot.activityType || slot.activityType === "strength";
}

const TARGET_SHORT: Record<DeltaTarget, string> = {
  sets: "Sets",
  repMin: "Reps min",
  repMax: "Reps max",
  tempo: "Tempo",
  rir: "RIR",
  rpe: "RPE",
  instructions: "Instructions",
};

/** One-line label for a rule, e.g. "Sets +1", "RIR -1", "Tempo[0] -1". */
export function describeRule(rule: WeeklyDeltaRule): string {
  if (rule.target === "instructions") return "Instructions";
  const amount = "amount" in rule ? rule.amount : 0;
  const sign = amount >= 0 ? "+" : "";
  if (rule.target === "tempo") return `Tempo[${rule.position}] ${sign}${amount}`;
  return `${TARGET_SHORT[rule.target]} ${sign}${amount}`;
}

// Blanket-add targets. `instructions` is intentionally excluded — it needs an
// assigned exercise and per-slot text, so it stays a per-slot-only action.
const BLANKET_TARGETS: { target: DeltaTarget; label: string }[] = [
  { target: "sets", label: "Sets +1" },
  { target: "repMin", label: "Reps min +1" },
  { target: "repMax", label: "Reps max +1" },
  { target: "tempo", label: "Tempo -1" },
  { target: "rir", label: "RIR -1" },
  { target: "rpe", label: "RPE +0.5" },
];

interface ProgressionRulesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Full mesocycle. Rules live on weeks[0] (W1) strength slots. */
  weeks: WeekData[];
  /** Persist a slot's rules (same callback the per-slot popover uses). */
  onSetSlotDeltaRules: (slotId: string, rules: WeeklyDeltaRule[]) => void;
}

function prescriptionSummary(slot: MuscleSlotData): string {
  const reps = slot.repMin === slot.repMax ? `${slot.repMin}` : `${slot.repMin}-${slot.repMax}`;
  return `${slot.sets}×${reps}`;
}

export const ProgressionRulesSheet = memo(function ProgressionRulesSheet({
  open,
  onOpenChange,
  weeks,
  onSetSlotDeltaRules,
}: ProgressionRulesSheetProps) {
  const isMobile = useIsMobile();

  const totalWeeks = weeks.length;
  const isDeloadByWeek = useMemo(() => weeks.map((w) => !!w.isDeload), [weeks]);

  // W1 strength slots, ordered by day then position — the only slots the engine
  // progresses and the only place deltaRules are authored.
  const strengthSlots = useMemo(() => {
    const w1Slots = weeks[0]?.slots ?? [];
    return w1Slots
      .filter(isStrengthSlot)
      .slice()
      .sort((a, b) => a.dayIndex - b.dayIndex || a.sortOrder - b.sortOrder);
  }, [weeks]);

  // How many strength slots would receive each blanket target (i.e. don't
  // already carry a rule for it). Drives the disabled state + count badge.
  const eligibleByTarget = useMemo(() => {
    const out = {} as Record<DeltaTarget, number>;
    for (const { target } of BLANKET_TARGETS) {
      out[target] = strengthSlots.filter(
        (s) => !(s.deltaRules ?? []).some((r) => r.target === target),
      ).length;
    }
    return out;
  }, [strengthSlots]);

  const handleBlanketAdd = useCallback(
    (target: DeltaTarget) => {
      // Fan a fresh default rule out to every strength slot lacking that target.
      // createDefaultRule() mints a unique id per call, and each dispatch targets
      // a distinct slotId, so D12 (one rule per target per slot) holds.
      for (const slot of strengthSlots) {
        const existing = slot.deltaRules ?? [];
        if (existing.some((r) => r.target === target)) continue;
        onSetSlotDeltaRules(slot.id, [...existing, createDefaultRule(target)]);
      }
    },
    [strengthSlots, onSetSlotDeltaRules],
  );

  // Group the ordered slots by day for the sectioned list.
  const dayGroups = useMemo(() => {
    const groups: { dayIndex: number; slots: MuscleSlotData[] }[] = [];
    for (let d = 1; d <= 7; d++) {
      const daySlots = strengthSlots.filter((s) => s.dayIndex === d);
      if (daySlots.length > 0) groups.push({ dayIndex: d, slots: daySlots });
    }
    return groups;
  }, [strengthSlots]);

  const blanketHeader = (
    <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Wand2 className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold">Add a rule for all slots</span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Applies to every strength slot that doesn't already have that rule. You can
        fine-tune each slot below.
      </p>
      <div className="flex flex-wrap gap-2">
        {BLANKET_TARGETS.map(({ target, label }) => {
          const remaining = eligibleByTarget[target];
          return (
            <Button
              key={target}
              variant="outline"
              size="sm"
              className="text-xs"
              disabled={remaining === 0}
              onClick={() => handleBlanketAdd(target)}
            >
              <Plus className="h-3 w-3 mr-1" />
              {label}
              <span className="ml-1.5 text-[10px] text-muted-foreground">
                {remaining === 0 ? "all set" : `+${remaining}`}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );

  const list =
    strengthSlots.length === 0 ? (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground text-center px-4">
        Add strength slots to W1 first, then author progression rules here.
      </div>
    ) : (
      <div className="space-y-4">
        {dayGroups.map(({ dayIndex, slots }) => (
          <div key={dayIndex} className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {DAYS_OF_WEEK[dayIndex - 1]}
            </div>
            {slots.map((slot) => {
              const muscleLabel = getMuscleDisplay(slot.muscleId)?.label ?? slot.muscleId;
              return (
                <div
                  key={slot.id}
                  className="rounded-md border border-border/50 bg-card p-3 space-y-1"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{muscleLabel}</span>
                      {slot.exercise && (
                        <span className="text-xs text-muted-foreground truncate">
                          {" "}
                          · {slot.exercise.name}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-mono text-muted-foreground shrink-0">
                      {prescriptionSummary(slot)}
                    </span>
                  </div>
                  <SlotDeltaRulesPanel
                    rules={slot.deltaRules ?? []}
                    totalWeeks={totalWeeks}
                    isDeloadByWeek={isDeloadByWeek}
                    baseValues={{
                      sets: slot.sets,
                      repMin: slot.repMin,
                      repMax: slot.repMax,
                      tempo: slot.tempo,
                      rir: slot.rir,
                      rpe: slot.rpe,
                      instructions: slot.exercise?.instructions,
                    }}
                    setsDetail={slot.setsDetail}
                    hasExercise={!!slot.exercise}
                    onChange={(rules) => onSetSlotDeltaRules(slot.id, rules)}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="text-left px-4 pt-4 pb-2">
            <DrawerTitle>Progression rules</DrawerTitle>
            <DrawerDescription>
              Auto-progress each slot across the following weeks. Coach overrides on
              any week still win.
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col flex-1 min-h-0 px-4 pb-[calc(env(safe-area-inset-bottom,0)+1rem)] gap-3 overflow-hidden">
            {blanketHeader}
            <DrawerScrollArea className="flex-1 min-h-0 -mx-1 px-1">{list}</DrawerScrollArea>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Progression rules</DialogTitle>
          <DialogDescription>
            Auto-progress each slot across the following weeks. Coach overrides on any
            week still win.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col flex-1 min-h-0 gap-3">
          {blanketHeader}
          <ScrollArea className="flex-1 min-h-0 -mx-1 px-1">{list}</ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
});
