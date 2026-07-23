import type { MuscleSlotData } from "@/types/muscle-builder";
import { MOVEMENT_GROUP_IDS } from "@/types/muscle-builder";
import type { MovementGroupConfig } from "@/hooks/useMovementGroupConfig";
import type { ExerciseMovement } from "@/hooks/useExerciseMovementMap";

/**
 * Multi-lens volume (Phase 3, 3a) — the MOVEMENT + CARDIO lenses that render alongside the existing
 * muscle (landmark) lens. Pure functions over the current-week slots.
 *
 * MOVEMENT: PLAIN weekly sets per compound movement group (Squat/Hinge/Press/Pull/Core/Carry —
 * fully data-driven off get_movement_group_config().groups) and per subGroup leaf (Press, Pull, Carry
 * each split two ways). No MEV/MRV landmarks. Two ways a slot contributes (3b — volume-first):
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
      // Filled: resolve group + leaf from the exercise. An ISOLATION exercise resolves to no compound
      // group (groupId null) → contributes nothing here, so accessories don't distort compound-balance.
      const mv = movementMap.get(exId);
      if (!mv || !mv.groupId) continue;
      groupSets.set(mv.groupId, (groupSets.get(mv.groupId) ?? 0) + sets);
      if (mv.leafId) leafSets.set(mv.leafId, (leafSets.get(mv.leafId) ?? 0) + sets);
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

// ── PPL affinity lens (Phase 3) ───────────────────────────────────────────────────────────────────
// A SECOND reading of the movement lens: weekly plan sets rolled up by push/pull/legs/core/full_body/
// neck. Unlike the compound view, this INCLUDES isolation/accessory work (curls, raises, flys) — every
// resolved exercise carries an affinity — so it reflects true push-vs-pull-vs-legs balance.

export interface AffinityRow {
  affinity: string;
  label: string;
  sets: number;
  compoundSets: number;
  isolationSets: number;
}
export interface AffinityLens {
  rows: AffinityRow[];
  totalSets: number;
}

const AFFINITY_ORDER = ["push", "pull", "legs", "core", "full_body", "neck"] as const;
const AFFINITY_LABEL: Record<string, string> = {
  push: "Push", pull: "Pull", legs: "Legs", core: "Core", full_body: "Full Body", neck: "Neck",
};
// Compound-group id → affinity, for an UNFILLED group slot (no exercise to resolve). Mirrors the
// taxonomy so an unfilled Squat slot lands in Legs exactly as a filled squat would (stable on fill).
const GROUP_AFFINITY: Record<string, string> = {
  squat: "legs", hinge: "legs", press: "push", pull: "pull", core: "core", carry: "full_body",
};

/** Weekly plan sets per PPL affinity (compound + isolation), from filled slots (via the movement map's
 *  per-exercise affinity) plus unfilled compound-group slots (via GROUP_AFFINITY). Ordered
 *  push/pull/legs, then core/full_body/neck; empty affinities dropped. */
export function computeAffinityLens(
  slots: MuscleSlotData[],
  movementMap: Map<string, ExerciseMovement>,
): AffinityLens {
  const agg = new Map<string, { sets: number; compound: number; iso: number }>();
  const add = (affinity: string, sets: number, isIso: boolean) => {
    const cur = agg.get(affinity) ?? { sets: 0, compound: 0, iso: 0 };
    cur.sets += sets;
    if (isIso) cur.iso += sets; else cur.compound += sets;
    agg.set(affinity, cur);
  };

  for (const slot of slots) {
    const sets = slot.sets ?? 0;
    const exId = slot.exercise?.exerciseId;
    if (exId) {
      const mv = movementMap.get(exId);
      if (!mv || !mv.affinity) continue; // unresolved exercise → no guess
      add(mv.affinity, sets, mv.isolation);
    } else if (MOVEMENT_GROUP_IDS.has(slot.muscleId)) {
      const affinity = GROUP_AFFINITY[slot.muscleId];
      if (affinity) add(affinity, sets, false); // unfilled compound group slot
    }
  }

  const rows: AffinityRow[] = AFFINITY_ORDER
    .filter((a) => agg.has(a))
    .map((a) => {
      const v = agg.get(a)!;
      return { affinity: a, label: AFFINITY_LABEL[a] ?? a, sets: v.sets, compoundSets: v.compound, isolationSets: v.iso };
    })
    .filter((r) => r.sets > 0);
  return { rows, totalSets: rows.reduce((s, r) => s + r.sets, 0) };
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

// ── Mobility / warm-up lens (Phase 3, 3e) ───────────────────────────────────────────────────────
// Minutes per body region (target_region) with the D4 COUNT-FALLBACK: mobility/warm-up entries mix
// timed (has a duration) and untimed (rep-based, or an unfilled group slot awaiting a duration). Per
// region we sum minutes from timed entries AND count the untimed ones — so a region with only
// untimed work reads "Shoulders · 3 drills" (never "0 min"/blank), and an all-untimed region renders
// muted/pending (like the cardio 0-min bucket, generalized to count mode). Both mobility and warm-up
// slots are activityType='yoga_mobility' and bucket by region here.

export interface MobilityRegionRow {
  label: string;
  minutes: number;
  timedCount: number;
  untimedCount: number;
  /** No timed minutes → render as a count ("N drills"), muted. */
  countMode: boolean;
}
export interface MobilityLens {
  rows: MobilityRegionRow[];
  totalMinutes: number;
}

/** Region buckets from mobility/warm-up slots. `regionOf` resolves a slot → { key, label } (unfilled
 *  group slot via muscleId=region id; filled via the exercise's target_region) or null to exclude —
 *  injected so this stays pure. Timed entries add minutes; untimed entries add to the count fallback. */
export function computeMobilityLens(
  slots: MuscleSlotData[],
  regionOf: (slot: MuscleSlotData) => { key: string; label: string } | null,
): MobilityLens {
  const byKey = new Map<string, { label: string; minutes: number; timed: number; untimed: number }>();

  for (const slot of slots) {
    const r = regionOf(slot);
    if (!r) continue;
    const minutes = slot.duration ?? 0;
    const cur = byKey.get(r.key) ?? { label: r.label, minutes: 0, timed: 0, untimed: 0 };
    if (minutes > 0) { cur.minutes += minutes; cur.timed += 1; } else { cur.untimed += 1; }
    byKey.set(r.key, cur);
  }

  const rows: MobilityRegionRow[] = [...byKey.values()]
    .map((v) => ({
      label: v.label, minutes: v.minutes, timedCount: v.timed, untimedCount: v.untimed,
      countMode: v.minutes === 0,
    }))
    .sort((a, b) =>
      b.minutes - a.minutes
      || (b.timedCount + b.untimedCount) - (a.timedCount + a.untimedCount)
      || a.label.localeCompare(b.label));
  return { rows, totalMinutes: rows.reduce((s, r) => s + r.minutes, 0) };
}
