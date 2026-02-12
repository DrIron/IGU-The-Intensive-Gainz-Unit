import { useMemo } from "react";
import {
  MUSCLE_GROUPS,
  MUSCLE_MAP,
  getVolumeLandmarkZone,
  type MuscleSlotData,
  type LandmarkZone,
  type MuscleGroupDef,
} from "@/types/muscle-builder";

export interface MuscleVolumeEntry {
  muscle: MuscleGroupDef;
  totalSets: number;
  frequency: number;
  zone: LandmarkZone;
  dayBreakdown: { dayIndex: number; sets: number }[];
}

export interface VolumeSummary {
  totalSets: number;
  musclesTargeted: number;
  trainingDays: number;
  avgSetsPerMuscle: number;
}

export function useMusclePlanVolume(slots: MuscleSlotData[]) {
  const volumeEntries = useMemo<MuscleVolumeEntry[]>(() => {
    const map = new Map<string, { totalSets: number; days: Map<number, number> }>();

    for (const slot of slots) {
      let entry = map.get(slot.muscleId);
      if (!entry) {
        entry = { totalSets: 0, days: new Map() };
        map.set(slot.muscleId, entry);
      }
      entry.totalSets += slot.sets;
      entry.days.set(slot.dayIndex, (entry.days.get(slot.dayIndex) || 0) + slot.sets);
    }

    const entries: MuscleVolumeEntry[] = [];
    for (const muscle of MUSCLE_GROUPS) {
      const data = map.get(muscle.id);
      if (!data) continue;
      entries.push({
        muscle,
        totalSets: data.totalSets,
        frequency: data.days.size,
        zone: getVolumeLandmarkZone(data.totalSets, muscle.landmarks),
        dayBreakdown: Array.from(data.days.entries()).map(([dayIndex, sets]) => ({ dayIndex, sets })),
      });
    }

    return entries.sort((a, b) => b.totalSets - a.totalSets);
  }, [slots]);

  const summary = useMemo<VolumeSummary>(() => {
    const trainingDays = new Set(slots.map(s => s.dayIndex)).size;
    const totalSets = slots.reduce((sum, s) => sum + s.sets, 0);
    const musclesTargeted = volumeEntries.length;
    return {
      totalSets,
      musclesTargeted,
      trainingDays,
      avgSetsPerMuscle: musclesTargeted > 0 ? Math.round(totalSets / musclesTargeted) : 0,
    };
  }, [slots, volumeEntries]);

  // Frequency heatmap: muscle × day matrix
  const frequencyMatrix = useMemo(() => {
    const matrix = new Map<string, Map<number, number>>();
    for (const slot of slots) {
      let row = matrix.get(slot.muscleId);
      if (!row) {
        row = new Map();
        matrix.set(slot.muscleId, row);
      }
      row.set(slot.dayIndex, (row.get(slot.dayIndex) || 0) + slot.sets);
    }
    return matrix;
  }, [slots]);

  // Muscle placement counts (for palette badges)
  const placementCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const slot of slots) {
      counts.set(slot.muscleId, (counts.get(slot.muscleId) || 0) + 1);
    }
    return counts;
  }, [slots]);

  // Consecutive day warnings
  const consecutiveDayWarnings = useMemo(() => {
    const warnings = new Set<string>();
    const musclesByDay = new Map<string, Set<number>>();

    for (const slot of slots) {
      let days = musclesByDay.get(slot.muscleId);
      if (!days) {
        days = new Set();
        musclesByDay.set(slot.muscleId, days);
      }
      days.add(slot.dayIndex);
    }

    for (const [muscleId, days] of musclesByDay) {
      const sorted = Array.from(days).sort((a, b) => a - b);
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i + 1] - sorted[i] === 1) {
          const muscle = MUSCLE_MAP.get(muscleId);
          if (muscle) {
            warnings.add(`${muscle.label} on consecutive days (${sorted[i]} & ${sorted[i + 1]})`);
          }
        }
      }
    }

    return warnings;
  }, [slots]);

  return { volumeEntries, summary, frequencyMatrix, placementCounts, consecutiveDayWarnings };
}
