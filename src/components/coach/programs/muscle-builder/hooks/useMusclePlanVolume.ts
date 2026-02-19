import { useMemo } from "react";
import {
  MUSCLE_GROUPS,
  MUSCLE_MAP,
  getMuscleDisplay,
  resolveParentMuscleId,
  getVolumeLandmarkZone,
  parseTempo,
  isWorkingSet,
  type MuscleSlotData,
  type LandmarkZone,
  type MuscleGroupDef,
} from "@/types/muscle-builder";

export interface SubdivisionVolume {
  muscleId: string;
  label: string;
  sets: number;
}

export interface MuscleVolumeEntry {
  muscle: MuscleGroupDef;
  totalSets: number;
  totalRepsMin: number;
  totalRepsMax: number;
  tustSecondsMin: number;   // TUST in seconds (using repMin)
  tustSecondsMax: number;   // TUST in seconds (using repMax)
  workingSets: number;      // Count of sets from qualifying slots (RIR ≤ 5 or RPE ≥ 5 with tempo)
  hasTempo: boolean;        // Any slot in this muscle group has tempo set
  frequency: number;
  zone: LandmarkZone;
  dayBreakdown: { dayIndex: number; sets: number }[];
  subdivisionBreakdown: SubdivisionVolume[];
}

export interface VolumeSummary {
  totalSets: number;
  musclesTargeted: number;
  trainingDays: number;
  avgSetsPerMuscle: number;
  totalRepsMin: number;
  totalRepsMax: number;
  totalWorkingSets: number;
  totalTustSecondsMin: number;
  totalTustSecondsMax: number;
}

export function useMusclePlanVolume(slots: MuscleSlotData[]) {
  // Volume entries — aggregate subdivisions to parent level
  const volumeEntries = useMemo<MuscleVolumeEntry[]>(() => {
    const map = new Map<string, { totalSets: number; totalRepsMin: number; totalRepsMax: number; tustSecondsMin: number; tustSecondsMax: number; workingSets: number; hasTempo: boolean; days: Map<number, number>; subs: Map<string, number> }>();

    for (const slot of slots) {
      const parentId = resolveParentMuscleId(slot.muscleId);
      let entry = map.get(parentId);
      if (!entry) {
        entry = { totalSets: 0, totalRepsMin: 0, totalRepsMax: 0, tustSecondsMin: 0, tustSecondsMax: 0, workingSets: 0, hasTempo: false, days: new Map(), subs: new Map() };
        map.set(parentId, entry);
      }
      entry.totalSets += slot.sets;
      const repMin = slot.repMin ?? 8;
      const repMax = slot.repMax ?? 12;
      entry.totalRepsMin += slot.sets * repMin;
      entry.totalRepsMax += slot.sets * repMax;
      entry.days.set(slot.dayIndex, (entry.days.get(slot.dayIndex) || 0) + slot.sets);

      // TUST: only for working sets with tempo
      const tempo = parseTempo(slot.tempo);
      if (tempo) entry.hasTempo = true;
      if (tempo && isWorkingSet(slot)) {
        entry.tustSecondsMin += slot.sets * repMin * tempo.total;
        entry.tustSecondsMax += slot.sets * repMax * tempo.total;
        entry.workingSets += slot.sets;
      }

      // Track subdivision-level sets (only if slot is a subdivision)
      if (parentId !== slot.muscleId) {
        entry.subs.set(slot.muscleId, (entry.subs.get(slot.muscleId) || 0) + slot.sets);
      }
    }

    const entries: MuscleVolumeEntry[] = [];
    for (const muscle of MUSCLE_GROUPS) {
      const data = map.get(muscle.id);
      if (!data) continue;
      const subdivisionBreakdown: SubdivisionVolume[] = [];
      for (const [subId, sets] of data.subs) {
        const display = getMuscleDisplay(subId);
        if (display) subdivisionBreakdown.push({ muscleId: subId, label: display.label, sets });
      }
      subdivisionBreakdown.sort((a, b) => b.sets - a.sets);
      entries.push({
        muscle,
        totalSets: data.totalSets,
        totalRepsMin: data.totalRepsMin,
        totalRepsMax: data.totalRepsMax,
        tustSecondsMin: data.tustSecondsMin,
        tustSecondsMax: data.tustSecondsMax,
        workingSets: data.workingSets,
        hasTempo: data.hasTempo,
        frequency: data.days.size,
        zone: getVolumeLandmarkZone(data.totalSets, muscle.landmarks),
        dayBreakdown: Array.from(data.days.entries()).map(([dayIndex, sets]) => ({ dayIndex, sets })),
        subdivisionBreakdown,
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
      totalRepsMin: volumeEntries.reduce((sum, e) => sum + e.totalRepsMin, 0),
      totalRepsMax: volumeEntries.reduce((sum, e) => sum + e.totalRepsMax, 0),
      totalWorkingSets: volumeEntries.reduce((sum, e) => sum + e.workingSets, 0),
      totalTustSecondsMin: volumeEntries.reduce((sum, e) => sum + e.tustSecondsMin, 0),
      totalTustSecondsMax: volumeEntries.reduce((sum, e) => sum + e.tustSecondsMax, 0),
    };
  }, [slots, volumeEntries]);

  // Frequency heatmap — aggregate by parent for the matrix
  const frequencyMatrix = useMemo(() => {
    const matrix = new Map<string, Map<number, number>>();
    for (const slot of slots) {
      const parentId = resolveParentMuscleId(slot.muscleId);
      let row = matrix.get(parentId);
      if (!row) {
        row = new Map();
        matrix.set(parentId, row);
      }
      row.set(slot.dayIndex, (row.get(slot.dayIndex) || 0) + slot.sets);
    }
    return matrix;
  }, [slots]);

  // Placement counts — track both raw muscle IDs and parent IDs for palette badges
  const placementCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const slot of slots) {
      // Count the exact ID (parent or subdivision)
      counts.set(slot.muscleId, (counts.get(slot.muscleId) || 0) + 1);
      // Also count at parent level if this is a subdivision
      const parentId = resolveParentMuscleId(slot.muscleId);
      if (parentId !== slot.muscleId) {
        counts.set(parentId, (counts.get(parentId) || 0) + 1);
      }
    }
    return counts;
  }, [slots]);

  // Consecutive day warnings — aggregate by parent
  const consecutiveDayWarnings = useMemo(() => {
    const warnings = new Set<string>();
    const musclesByDay = new Map<string, Set<number>>();

    for (const slot of slots) {
      const parentId = resolveParentMuscleId(slot.muscleId);
      let days = musclesByDay.get(parentId);
      if (!days) {
        days = new Set();
        musclesByDay.set(parentId, days);
      }
      days.add(slot.dayIndex);
    }

    for (const [muscleId, days] of musclesByDay) {
      const sorted = Array.from(days).sort((a, b) => a - b);
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i + 1] - sorted[i] === 1) {
          const muscle = getMuscleDisplay(muscleId);
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
