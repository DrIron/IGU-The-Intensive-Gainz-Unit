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
import type { SetPrescription } from "@/types/workout-builder";
import type { DeltaTarget } from "./weeklyDeltaEngine";

export interface DeloadPreset {
  id: string;
  label: string;
  shortDescription: string;
  /** Fields this preset modifies — used to seed manualOverrides on the target week. */
  touchedTargets: DeltaTarget[];
  /** Pure transformation. Should NOT mutate input. Delegates to applyDeloadPreset. */
  apply: (slot: MuscleSlotData) => MuscleSlotData;
}

/**
 * The minimal shape a deload reduction touches — sets count, RIR, and per-set details.
 * Satisfied by BOTH the board's MuscleSlotData AND the canonical PrescribableSlot, so the SAME
 * math runs for the board reducer and the WorkoutSessionV2 canonical resolver (per-client
 * deload-via-override) and they can't drift.
 */
export interface Deloadable {
  sets?: number;
  rir?: number;
  setsDetail?: SetPrescription[];
}

/** Per-preset numeric params, applied in a fixed pipeline: sets → load → rir. */
interface DeloadPresetParams {
  setsFactor?: number; // keep this fraction of sets (0.6 = -40%)
  loadFactor?: number; // scale per-set weight (0.8 = -20%)
  rirDelta?: number; // add to RIR (+1 = easier)
}

const PRESET_PARAMS: Record<string, DeloadPresetParams> = {
  volume: { setsFactor: 0.6, rirDelta: 1 },
  intensity: { loadFactor: 0.8, rirDelta: 2 },
  recovery: { setsFactor: 0.5, loadFactor: 0.7, rirDelta: 2 },
};

// ----- Helpers (generic over Deloadable) -----

function clampInt(value: number, min: number, max: number): number {
  const n = Math.round(value);
  return Math.max(min, Math.min(max, n));
}

function reduceSetsBy<T extends Deloadable>(target: T, factor: number): T {
  // factor < 1 reduces, e.g. 0.6 keeps 60% of sets. Ceil rather than round so "Sets -40%"
  // maps 4 → 3 (not 2) — faithful to the label, keeps a touch more volume; coaches can trim.
  const baseSets = target.sets ?? target.setsDetail?.length ?? 0;
  if (!baseSets) return target;
  const newCount = Math.max(1, Math.min(20, Math.ceil(baseSets * factor)));
  return {
    ...target,
    sets: newCount,
    setsDetail: target.setsDetail
      ? target.setsDetail.slice(0, newCount).map((s, i) => ({ ...s, set_number: i + 1 }))
      : target.setsDetail,
  };
}

function adjustRir<T extends Deloadable>(target: T, delta: number): T {
  return {
    ...target,
    rir: target.rir != null ? clampInt(target.rir + delta, 0, 10) : target.rir,
    setsDetail: target.setsDetail?.map((s) =>
      s.rir != null ? { ...s, rir: clampInt(s.rir + delta, 0, 10) } : s,
    ),
  };
}

function reduceLoadBy<T extends Deloadable>(target: T, factor: number): T {
  // Load lives on setsDetail[i].weight. No setsDetail → no-op.
  if (!target.setsDetail) return target;
  return {
    ...target,
    setsDetail: target.setsDetail.map((s) =>
      s.weight != null
        ? { ...s, weight: Math.max(0, Math.round(s.weight * factor * 10) / 10) }
        : s,
    ),
  };
}

/**
 * Shared pure deload transform. Used by the board's APPLY_DELOAD reducer (MuscleSlotData) and the
 * canonical resolver (PrescribableSlot). Unknown preset id → unchanged.
 */
export function applyDeloadPreset<T extends Deloadable>(target: T, presetId: string): T {
  const p = PRESET_PARAMS[presetId];
  if (!p) return target;
  let out: T = target;
  if (p.setsFactor != null) out = reduceSetsBy(out, p.setsFactor);
  if (p.loadFactor != null) out = reduceLoadBy(out, p.loadFactor);
  if (p.rirDelta != null) out = adjustRir(out, p.rirDelta);
  return out;
}

export const BUILTIN_DELOAD_PRESETS: DeloadPreset[] = [
  {
    id: "volume",
    label: "Volume deload",
    shortDescription: "Sets -40%, RIR +1, load unchanged",
    touchedTargets: ["sets", "rir"],
    apply: (slot) => applyDeloadPreset(slot, "volume"),
  },
  {
    id: "intensity",
    label: "Intensity deload",
    shortDescription: "Sets unchanged, load -20%, RIR +2",
    touchedTargets: ["rir"],
    apply: (slot) => applyDeloadPreset(slot, "intensity"),
  },
  {
    id: "recovery",
    label: "Recovery deload",
    shortDescription: "Sets -50%, load -30%, RIR +2",
    touchedTargets: ["sets", "rir"],
    apply: (slot) => applyDeloadPreset(slot, "recovery"),
  },
];

export function findDeloadPreset(id: string): DeloadPreset | null {
  return BUILTIN_DELOAD_PRESETS.find((p) => p.id === id) ?? null;
}
