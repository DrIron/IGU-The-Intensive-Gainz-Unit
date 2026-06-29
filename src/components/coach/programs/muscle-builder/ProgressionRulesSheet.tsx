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

import { memo, useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogScrollArea,
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
import { Copy, ClipboardPaste, Plus, Wand2, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { DAYS_OF_WEEK, getMuscleDisplay } from "@/types/muscle-builder";
import type { MuscleSlotData, WeekData } from "@/types/muscle-builder";
import { SlotDeltaRulesPanel } from "./SlotDeltaRulesPanel";
import {
  resolvePlanScopeTargetIds,
  resolveSessionScopeTargetIds,
  resolvePickedScopeTargetIds,
} from "./progressionClipboard";
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
  /**
   * Copy-progression paste: merge the copied rules onto `targetSlotIds`, clear
   * their downstream overrides, and recompute — all in one reducer dispatch.
   */
  onPasteDeltaRules: (sourceRules: WeeklyDeltaRule[], targetSlotIds: string[]) => void;
}

function prescriptionSummary(slot: MuscleSlotData): string {
  const reps = slot.repMin === slot.repMax ? `${slot.repMin}` : `${slot.repMin}-${slot.repMax}`;
  return `${slot.sets}×${reps}`;
}

/** Short display label for a slot — exercise name when assigned, else muscle. */
function slotLabel(slot: MuscleSlotData): string {
  if (slot.exercise) return slot.exercise.name;
  return getMuscleDisplay(slot.muscleId)?.label ?? slot.muscleId;
}

/** Board-only progression clipboard — copied W1 rules + their source slot. */
interface ProgressionClipboard {
  sourceSlotId: string;
  sourceLabel: string;
  rules: WeeklyDeltaRule[];
}

export const ProgressionRulesSheet = memo(function ProgressionRulesSheet({
  open,
  onOpenChange,
  weeks,
  onSetSlotDeltaRules,
  onPasteDeltaRules,
}: ProgressionRulesSheetProps) {
  const isMobile = useIsMobile();

  const totalWeeks = weeks.length;
  const isDeloadByWeek = useMemo(() => weeks.map((w) => !!w.isDeload), [weeks]);

  // Board-only progression clipboard (NOT the OS clipboard). Copying a slot's
  // rules stashes them here; paste stamps them onto other strength slots.
  const [clipboard, setClipboard] = useState<ProgressionClipboard | null>(null);
  // Checkbox selection for the "specific slots the coach picks" paste scope.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const w1 = weeks[0];

  const handleCopy = useCallback((slot: MuscleSlotData) => {
    const rules = slot.deltaRules ?? [];
    if (rules.length === 0) return;
    setClipboard({ sourceSlotId: slot.id, sourceLabel: slotLabel(slot), rules });
    setSelectedIds(new Set());
  }, []);

  const clearClipboard = useCallback(() => {
    setClipboard(null);
    setSelectedIds(new Set());
  }, []);

  const toggleSelected = useCallback((slotId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  }, []);

  // Paste to a resolved set of target ids, then reset the clipboard + selection.
  const doPaste = useCallback(
    (targetSlotIds: string[]) => {
      if (!clipboard || targetSlotIds.length === 0) return;
      onPasteDeltaRules(clipboard.rules, targetSlotIds);
      clearClipboard();
    },
    [clipboard, onPasteDeltaRules, clearClipboard],
  );

  // Target id counts per scope for the copied source (excludes the source).
  const planTargetIds = useMemo(
    () => (clipboard ? resolvePlanScopeTargetIds(w1, clipboard.sourceSlotId) : []),
    [clipboard, w1],
  );
  const sessionTargetIds = useMemo(
    () => (clipboard ? resolveSessionScopeTargetIds(w1, clipboard.sourceSlotId) : []),
    [clipboard, w1],
  );
  const pickedTargetIds = useMemo(
    () => (clipboard ? resolvePickedScopeTargetIds(w1, selectedIds) : []),
    [clipboard, w1, selectedIds],
  );

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

  const pasteBanner = clipboard ? (
    <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <ClipboardPaste className="h-3.5 w-3.5 text-sky-500 shrink-0" />
          <span className="text-xs font-semibold truncate">
            Copied {clipboard.sourceLabel}'s progression
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            ({clipboard.rules.length} rule{clipboard.rules.length === 1 ? "" : "s"})
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs shrink-0"
          onClick={clearClipboard}
        >
          <X className="h-3 w-3 mr-1" />
          Clear
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Paste onto other strength slots. Existing rules for the same metric are
        overwritten; untouched metrics are kept. Downstream weeks recompute and
        manual edits on pasted-to slots are cleared.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          disabled={sessionTargetIds.length === 0}
          onClick={() => doPaste(sessionTargetIds)}
        >
          <ClipboardPaste className="h-3 w-3 mr-1" />
          Same session
          <span className="ml-1.5 text-[10px] text-muted-foreground">
            {sessionTargetIds.length === 0 ? "none" : sessionTargetIds.length}
          </span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          disabled={planTargetIds.length === 0}
          onClick={() => doPaste(planTargetIds)}
        >
          <ClipboardPaste className="h-3 w-3 mr-1" />
          All strength slots
          <span className="ml-1.5 text-[10px] text-muted-foreground">
            {planTargetIds.length === 0 ? "none" : planTargetIds.length}
          </span>
        </Button>
        <Button
          variant="default"
          size="sm"
          className="text-xs"
          disabled={pickedTargetIds.length === 0}
          onClick={() => doPaste(pickedTargetIds)}
        >
          Paste into {pickedTargetIds.length} selected
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground italic">
        Tick slots below to paste into a custom set.
      </p>
    </div>
  ) : null;

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
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {clipboard && (
                        <Checkbox
                          checked={selectedIds.has(slot.id)}
                          onCheckedChange={() => toggleSelected(slot.id)}
                          disabled={slot.id === clipboard.sourceSlotId}
                          aria-label={`Select ${muscleLabel} as paste target`}
                          className="shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <span className="text-sm font-medium">{muscleLabel}</span>
                        {slot.exercise && (
                          <span className="text-xs text-muted-foreground truncate">
                            {" "}
                            · {slot.exercise.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-mono text-muted-foreground">
                        {prescriptionSummary(slot)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={(slot.deltaRules ?? []).length === 0}
                        onClick={() => handleCopy(slot)}
                        title={
                          (slot.deltaRules ?? []).length === 0
                            ? "No rules to copy"
                            : "Copy this slot's progression"
                        }
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                    </div>
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
            {pasteBanner}
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
          {pasteBanner}
          <DialogScrollArea className="flex-1 min-h-0 -mx-1 px-1">{list}</DialogScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
});
