import type { MuscleSlotData } from "@/types/muscle-builder";
import { MOVEMENT_GROUP_IDS } from "@/types/muscle-builder";
import type { MovementGroupConfig } from "@/hooks/useMovementGroupConfig";
import type { ExerciseMovement } from "@/hooks/useExerciseMovementMap";

/**
 * Multi-lens volume (Phase 3, 3a) — the MOVEMENT + CARDIO lenses that render alongside the existing
 * muscle (landmark) lens. Pure functions over the current-week slots.
 *
 * MOVEMENT: PLAIN weekly sets per movement group (Squat/Press/Hinge) and per Press subGroup
 * (Horizontal/Anterior). No MEV/MRV landmarks. Two ways a slot contributes (3b — volume-first):
 *   - FILLED: it has an exercise whose id resolves in `movementMap` (any category — a filled bench
 *     press counts in Press AND its muscle lens), contributing to the group AND its leaf. Unresolved
 *     exercises don't contribute.
 *   - UNFILLED group slot: no exercise, `muscleId` is a movement-group id (squat/press/hinge). It
 *     contributes its sets to the GROUP total only (the variation — hence the leaf — isn't chosen
 *     yet). Filling it later swaps it onto the filled path (exercise present → the else-branch is
 *     skipped), so the group total is unchanged and the leaf resolves. No double-count.
 *
 * CARDIO: minutes per modality from cardio slots' `duration`, plus an HR-zone distribution.
 */

export interface MovementSubGroupRow {
  id: string;
  label: string;
  sets: number;
}
export interface MovementGroupRow {
  id: string;
  label: string;
  sortOrder: number;
  sets: number;
  subGroups: MovementSubGroupRow[];
}
export interface MovementLens {
  rows: MovementGroupRow[];
  totalSets: number;
}

/** Sum plain weekly sets per movement group + Press subGroup, ordered by the config. Groups with 0
 *  sets are dropped (empty lens → no rows → renders nothing). */
export function computeMovementLens(
  slots: MuscleSlotData[],
  movementMap: Map<string, ExerciseMovement>,
  config: MovementGroupConfig,
): MovementLens {
  const groupSets = new Map<string, number>();
  const leafSets = new Map<string, number>();

  for (const slot of slots) {
    const sets = slot.sets ?? 0;
    const exId = slot.exercise?.exerciseId;
    if (exId) {
      // Filled: resolve group + leaf from the exercise.
      const mv = movementMap.get(exId);
      if (!mv) continue;
      groupSets.set(mv.groupId, (groupSets.get(mv.groupId) ?? 0) + sets);
      leafSets.set(mv.leafId, (leafSets.get(mv.leafId) ?? 0) + sets);
    } else if (MOVEMENT_GROUP_IDS.has(slot.muscleId)) {
      // Unfilled group slot: count sets to the group only (variation/leaf not chosen yet).
      groupSets.set(slot.muscleId, (groupSets.get(slot.muscleId) ?? 0) + sets);
    }
  }

  const rows: MovementGroupRow[] = config.groups
    .map((g) => ({
      id: g.id,
      label: g.label,
      sortOrder: g.sortOrder,
      sets: groupSets.get(g.id) ?? 0,
      subGroups: g.subGroups
        .map((sg) => ({ id: sg.id, label: sg.label, sets: leafSets.get(sg.id) ?? 0 }))
        .filter((sg) => sg.sets > 0)
        .sort((a, b) => b.sets - a.sets),
    }))
    .filter((r) => r.sets > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const totalSets = [...groupSets.values()].reduce((a, b) => a + b, 0);
  return { rows, totalSets };
}

export interface CardioModalityRow {
  label: string;
  minutes: number;
  /** True when the modality bucket has 0 minutes — an unfilled group slot "programmed, awaiting
   *  duration" (3c). Rendered muted (no bar); flips to a normal row once a duration is set. */
  pending: boolean;
}
export interface CardioHrZoneRow {
  zone: number;
  minutes: number;
}
export interface CardioLens {
  modalities: CardioModalityRow[];
  hrZones: CardioHrZoneRow[];
  totalMinutes: number;
}

/**
 * Minutes per cardio modality (+ HR-zone distribution). `modalityOf` resolves a slot's modality to a
 * stable { key, label } (or null to exclude) — injected so this stays pure/testable. The caller keys
 * BOTH unfilled group slots (muscleId = cardio_movement id) AND filled slots (exercise's
 * cardio_movement) to the SAME modality key, so filling a group slot keeps its minutes in the same
 * bucket (stable total, no double-count) — 3c volume-first.
 *
 * Unlike 3a, 0-minute slots are NOT dropped: an unfilled group slot surfaces its modality at 0 min as
 * a PENDING bucket the moment it's picked, then fills to real minutes when a duration is set.
 */
export function computeCardioLens(
  slots: MuscleSlotData[],
  modalityOf: (slot: MuscleSlotData) => { key: string; label: string } | null,
): CardioLens {
  const byKey = new Map<string, { label: string; minutes: number }>();
  const byZone = new Map<number, number>();

  for (const slot of slots) {
    const m = modalityOf(slot);
    if (!m) continue;
    const minutes = slot.duration ?? 0;
    const cur = byKey.get(m.key) ?? { label: m.label, minutes: 0 };
    cur.minutes += minutes;
    byKey.set(m.key, cur);
    if (minutes > 0 && slot.targetHrZone) byZone.set(slot.targetHrZone, (byZone.get(slot.targetHrZone) ?? 0) + minutes);
  }

  const modalities = [...byKey.values()]
    .map(({ label, minutes }) => ({ label, minutes, pending: minutes === 0 }))
    .sort((a, b) => b.minutes - a.minutes || a.label.localeCompare(b.label));
  const hrZones = [...byZone.entries()]
    .map(([zone, minutes]) => ({ zone, minutes }))
    .sort((a, b) => a.zone - b.zone);

  return { modalities, hrZones, totalMinutes: modalities.reduce((a, m) => a + m.minutes, 0) };
}
