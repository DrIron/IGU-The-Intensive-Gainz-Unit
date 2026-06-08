// src/components/coach/programs/muscle-builder/deloadPresets.ts
//
// Built-in deload presets — pure transformations that take a MuscleSlotData
// and return a deload-adjusted version. Each preset declares which fields it
// modifies (`touchedTargets`) so the APPLY_DELOAD reducer can tag those
// fields as manualOverrides — that's how progression rules from W1 don't
// re-clobber the deload reductions on later recomputes.
//
// Coaches who want different behavior pick "Custom" in the dialog and
// hand-author the deltas. A coach-defined preset library is post-MVP (see
// plan §14 C).
//
// Spec: docs/PLANNING_BOARD_WEEKLY_DELTAS_PLAN.md §9

import type { MuscleSlotData } from "@/types/muscle-builder";
import type { DeltaTarget } from "./weeklyDeltaEngine";

export interface DeloadPreset {
  id: string;
  label: string;
  shortDescription: string;
  /** Fields this preset modifies — used to seed manualOverrides on the target week. */
  touchedTargets: DeltaTarget[];
  /** Pure transformation. Should NOT mutate input. */
  apply: (slot: MuscleSlotData) => MuscleSlotData;
}

// ----- Helpers -----

function clampInt(value: number, min: number, max: number): number {
  const n = Math.round(value);
  return Math.max(min, Math.min(max, n));
}

function reduceSetsBy(slot: MuscleSlotData, factor: number): MuscleSlotData {
  // factor < 1 reduces, e.g. 0.6 keeps 60% of sets.
  // Ceil rather than round so "Sets -40%" maps 4 → 3 (not 2). Faithful to the
  // preset label and keeps a tiny bit more volume during deloads — coaches
  // can always trim by hand if they want more reduction.
  const newCount = Math.max(1, Math.min(20, Math.ceil(slot.sets * factor)));
  return {
    ...slot,
    sets: newCount,
    setsDetail: slot.setsDetail
      ? slot.setsDetail.slice(0, newCount).map((s, i) => ({ ...s, set_number: i + 1 }))
      : undefined,
  };
}

function adjustRir(slot: MuscleSlotData, delta: number): MuscleSlotData {
  const newRir = slot.rir != null ? clampInt(slot.rir + delta, 0, 10) : slot.rir;
  return {
    ...slot,
    rir: newRir,
    setsDetail: slot.setsDetail?.map(s =>
      s.rir != null ? { ...s, rir: clampInt(s.rir + delta, 0, 10) } : s,
    ),
  };
}

function reduceLoadBy(slot: MuscleSlotData, factor: number): MuscleSlotData {
  // factor < 1 reduces. Load lives on setsDetail[i].weight; slot-level
  // weight isn't a thing on MuscleSlotData. If no setsDetail, this is a no-op.
  if (!slot.setsDetail) return slot;
  return {
    ...slot,
    setsDetail: slot.setsDetail.map(s =>
      s.weight != null
        ? { ...s, weight: Math.max(0, Math.round(s.weight * factor * 10) / 10) }
        : s,
    ),
  };
}

// ----- Presets -----

const VOLUME_DELOAD: DeloadPreset = {
  id: "volume",
  label: "Volume deload",
  shortDescription: "Sets -40%, RIR +1, load unchanged",
  touchedTargets: ["sets", "rir"],
  apply: (slot) => adjustRir(reduceSetsBy(slot, 0.6), 1),
};

const INTENSITY_DELOAD: DeloadPreset = {
  id: "intensity",
  label: "Intensity deload",
  shortDescription: "Sets unchanged, load -20%, RIR +2",
  touchedTargets: ["rir"],
  apply: (slot) => adjustRir(reduceLoadBy(slot, 0.8), 2),
};

const RECOVERY_DELOAD: DeloadPreset = {
  id: "recovery",
  label: "Recovery deload",
  shortDescription: "Sets -50%, load -30%, RIR +2",
  touchedTargets: ["sets", "rir"],
  apply: (slot) => adjustRir(reduceLoadBy(reduceSetsBy(slot, 0.5), 0.7), 2),
};

export const BUILTIN_DELOAD_PRESETS: DeloadPreset[] = [
  VOLUME_DELOAD,
  INTENSITY_DELOAD,
  RECOVERY_DELOAD,
];

export function findDeloadPreset(id: string): DeloadPreset | null {
  return BUILTIN_DELOAD_PRESETS.find((p) => p.id === id) ?? null;
}
