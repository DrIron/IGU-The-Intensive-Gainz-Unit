// src/components/coach/programs/muscle-builder/progressionClipboard.ts
//
// Pure helpers for the "copy progression" feature in the Planning Board.
//
// A coach copies one W1 strength slot's deltaRules into a lightweight in-memory
// clipboard (board state — NOT the OS clipboard), then stamps them onto other
// W1 strength slots. Progression rules only ever live on W1 slots, so every
// scope below resolves against W1's WeekData.
//
// The merge / clear-overrides / recompute work happens in the reducer
// (PASTE_DELTA_RULES_TO_SLOTS → pasteDeltaRulesToSlots) and the engine
// (mergeDeltaRules). This module only answers "which slot ids does each paste
// scope target?".
//
// Scope guard: board-only (slot_config). Does NOT touch the canonical
// progression_rules table / plan_slots.progression_rule_id — out of scope.

import type { WeekData, MuscleSlotData } from "@/types/muscle-builder";

/**
 * Strength slots are the only ones the delta engine progresses, so the only
 * valid paste targets. Mirrors `isStrengthSlot` in ProgressionRulesSheet — kept
 * inline so this pure module stays free of the React component graph (it's
 * imported by unit tests and the reducer-adjacent UI alike).
 */
function isStrengthSlot(slot: MuscleSlotData): boolean {
  return !slot.activityType || slot.activityType === "strength";
}

/**
 * All W1 strength slot ids — paste scope (c) "all strength slots in the whole
 * plan". Excludes `excludeSlotId` (the copy source) since pasting a slot's rules
 * onto itself is a no-op.
 */
export function resolvePlanScopeTargetIds(
  w1: WeekData | undefined,
  excludeSlotId?: string,
): string[] {
  return (w1?.slots ?? [])
    .filter(isStrengthSlot)
    .filter((s) => s.id !== excludeSlotId)
    .map((s) => s.id);
}

/**
 * W1 strength slot ids in the SAME session as `sourceSlotId` — paste scope (b)
 * "all strength slots in the same session". Excludes the source itself. Returns
 * [] when the source slot is missing or carries no sessionId.
 */
export function resolveSessionScopeTargetIds(
  w1: WeekData | undefined,
  sourceSlotId: string,
): string[] {
  const slots = w1?.slots ?? [];
  const source = slots.find((s) => s.id === sourceSlotId);
  if (!source?.sessionId) return [];
  return slots
    .filter(isStrengthSlot)
    .filter((s) => s.sessionId === source.sessionId && s.id !== sourceSlotId)
    .map((s) => s.id);
}

/**
 * Filter a coach-picked id list down to W1 strength slot ids — paste scope (a)
 * "specific slots the coach picks". Guards against stale/non-strength ids
 * sneaking through the multi-select.
 */
export function resolvePickedScopeTargetIds(
  w1: WeekData | undefined,
  pickedIds: Iterable<string>,
): string[] {
  const picked = new Set(pickedIds);
  return (w1?.slots ?? [])
    .filter(isStrengthSlot)
    .filter((s) => picked.has(s.id))
    .map((s) => s.id);
}
