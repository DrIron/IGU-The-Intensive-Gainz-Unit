// src/types/muscle-builder.ts
// Type definitions and constants for the Muscle-First Workout Builder

// ============================================================
// Body Region + Muscle Group Definitions
// ============================================================

export type BodyRegion = 'push' | 'pull' | 'legs' | 'core';

export interface MuscleLandmarks {
  MV: number;   // Maintenance Volume (sets/week)
  MEV: number;  // Minimum Effective Volume
  MAV: number;  // Maximum Adaptive Volume
  MRV: number;  // Maximum Recoverable Volume
}

export interface MuscleGroupDef {
  id: string;
  label: string;
  bodyRegion: BodyRegion;
  colorClass: string;
  colorHex: string;
  landmarks: MuscleLandmarks;
}

export interface MuscleSlotData {
  dayIndex: number;     // 1-7 (Mon-Sun)
  muscleId: string;
  sets: number;
  sortOrder: number;
}

export interface MusclePlanState {
  templateId: string | null;
  name: string;
  description: string;
  slots: MuscleSlotData[];
  selectedDayIndex: number;
  isDirty: boolean;
  isSaving: boolean;
}

export type LandmarkZone =
  | 'below_mv'
  | 'maintenance'
  | 'productive'
  | 'approaching_mrv'
  | 'over_mrv';

// ============================================================
// 17 Muscle Groups with Evidence-Based Volume Landmarks
// ============================================================

export const MUSCLE_GROUPS: MuscleGroupDef[] = [
  // Push muscles (rose/orange/amber)
  { id: 'pecs', label: 'Pecs', bodyRegion: 'push', colorClass: 'bg-rose-500', colorHex: '#f43f5e', landmarks: { MV: 6, MEV: 10, MAV: 20, MRV: 24 } },
  { id: 'shoulders', label: 'Shoulders', bodyRegion: 'push', colorClass: 'bg-orange-500', colorHex: '#f97316', landmarks: { MV: 6, MEV: 8, MAV: 22, MRV: 26 } },
  { id: 'triceps', label: 'Triceps', bodyRegion: 'push', colorClass: 'bg-amber-500', colorHex: '#f59e0b', landmarks: { MV: 4, MEV: 6, MAV: 14, MRV: 18 } },
  // Pull muscles (blue/sky/cyan/indigo/violet)
  { id: 'lats', label: 'Lats', bodyRegion: 'pull', colorClass: 'bg-blue-500', colorHex: '#3b82f6', landmarks: { MV: 6, MEV: 10, MAV: 20, MRV: 25 } },
  { id: 'mid_back', label: 'Mid-back', bodyRegion: 'pull', colorClass: 'bg-sky-500', colorHex: '#0ea5e9', landmarks: { MV: 6, MEV: 8, MAV: 18, MRV: 22 } },
  { id: 'upper_back', label: 'Upper Back', bodyRegion: 'pull', colorClass: 'bg-cyan-500', colorHex: '#06b6d4', landmarks: { MV: 4, MEV: 6, MAV: 16, MRV: 20 } },
  { id: 'elbow_flexors', label: 'Elbow Flexors', bodyRegion: 'pull', colorClass: 'bg-indigo-500', colorHex: '#6366f1', landmarks: { MV: 4, MEV: 8, MAV: 18, MRV: 22 } },
  { id: 'forearm', label: 'Forearm', bodyRegion: 'pull', colorClass: 'bg-violet-400', colorHex: '#a78bfa', landmarks: { MV: 2, MEV: 4, MAV: 12, MRV: 16 } },
  // Leg muscles (emerald/green/lime/teal)
  { id: 'quads', label: 'Quads', bodyRegion: 'legs', colorClass: 'bg-emerald-500', colorHex: '#10b981', landmarks: { MV: 6, MEV: 8, MAV: 18, MRV: 22 } },
  { id: 'hamstrings', label: 'Hamstrings', bodyRegion: 'legs', colorClass: 'bg-green-500', colorHex: '#22c55e', landmarks: { MV: 4, MEV: 6, MAV: 16, MRV: 20 } },
  { id: 'glutes', label: 'Glutes', bodyRegion: 'legs', colorClass: 'bg-lime-500', colorHex: '#84cc16', landmarks: { MV: 4, MEV: 6, MAV: 16, MRV: 20 } },
  { id: 'calves', label: 'Calves', bodyRegion: 'legs', colorClass: 'bg-teal-500', colorHex: '#14b8a6', landmarks: { MV: 6, MEV: 8, MAV: 16, MRV: 20 } },
  { id: 'adductors', label: 'Adductors', bodyRegion: 'legs', colorClass: 'bg-green-400', colorHex: '#4ade80', landmarks: { MV: 4, MEV: 6, MAV: 14, MRV: 18 } },
  { id: 'abductors', label: 'Abductors', bodyRegion: 'legs', colorClass: 'bg-emerald-400', colorHex: '#34d399', landmarks: { MV: 4, MEV: 6, MAV: 14, MRV: 18 } },
  { id: 'hip_flexors', label: 'Hip Flexors', bodyRegion: 'legs', colorClass: 'bg-lime-400', colorHex: '#a3e635', landmarks: { MV: 2, MEV: 4, MAV: 10, MRV: 14 } },
  // Core (yellow)
  { id: 'core', label: 'Core', bodyRegion: 'core', colorClass: 'bg-yellow-500', colorHex: '#eab308', landmarks: { MV: 4, MEV: 6, MAV: 16, MRV: 20 } },
  { id: 'neck', label: 'Neck', bodyRegion: 'core', colorClass: 'bg-yellow-400', colorHex: '#facc15', landmarks: { MV: 2, MEV: 4, MAV: 10, MRV: 14 } },
];

export const MUSCLE_MAP = new Map(MUSCLE_GROUPS.map(m => [m.id, m]));

export const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const BODY_REGION_LABELS: Record<BodyRegion, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  core: 'Core',
};

export const BODY_REGIONS: BodyRegion[] = ['push', 'pull', 'legs', 'core'];

// ============================================================
// Volume Landmark Helpers
// ============================================================

export function getVolumeLandmarkZone(sets: number, landmarks: MuscleLandmarks): LandmarkZone {
  if (sets < landmarks.MV) return 'below_mv';
  if (sets < landmarks.MEV) return 'maintenance';
  if (sets <= landmarks.MAV) return 'productive';
  if (sets <= landmarks.MRV) return 'approaching_mrv';
  return 'over_mrv';
}

export function getLandmarkColor(zone: LandmarkZone): string {
  switch (zone) {
    case 'below_mv': return 'text-zinc-400';
    case 'maintenance': return 'text-amber-400';
    case 'productive': return 'text-emerald-400';
    case 'approaching_mrv': return 'text-orange-400';
    case 'over_mrv': return 'text-red-400';
  }
}

export function getLandmarkBgColor(zone: LandmarkZone): string {
  switch (zone) {
    case 'below_mv': return 'bg-zinc-500';
    case 'maintenance': return 'bg-amber-500';
    case 'productive': return 'bg-emerald-500';
    case 'approaching_mrv': return 'bg-orange-500';
    case 'over_mrv': return 'bg-red-500';
  }
}

export function getLandmarkLabel(zone: LandmarkZone): string {
  switch (zone) {
    case 'below_mv': return 'Below MV';
    case 'maintenance': return 'Maintenance';
    case 'productive': return 'Productive';
    case 'approaching_mrv': return 'Near MRV';
    case 'over_mrv': return 'Over MRV';
  }
}

// ============================================================
// Built-in Presets
// ============================================================

function makeSlots(dayMuscles: Record<number, { id: string; sets: number }[]>): MuscleSlotData[] {
  const slots: MuscleSlotData[] = [];
  for (const [day, muscles] of Object.entries(dayMuscles)) {
    muscles.forEach((m, i) => {
      slots.push({ dayIndex: Number(day), muscleId: m.id, sets: m.sets, sortOrder: i });
    });
  }
  return slots;
}

export interface SystemPreset {
  name: string;
  description: string;
  slots: MuscleSlotData[];
}

export const SYSTEM_PRESETS: SystemPreset[] = [
  {
    name: 'Push / Pull / Legs',
    description: '6 days, 2x frequency per muscle',
    slots: makeSlots({
      1: [{ id: 'pecs', sets: 4 }, { id: 'shoulders', sets: 4 }, { id: 'triceps', sets: 3 }],
      2: [{ id: 'lats', sets: 4 }, { id: 'mid_back', sets: 3 }, { id: 'elbow_flexors', sets: 3 }],
      3: [{ id: 'quads', sets: 4 }, { id: 'hamstrings', sets: 3 }, { id: 'glutes', sets: 3 }, { id: 'calves', sets: 3 }],
      4: [{ id: 'pecs', sets: 4 }, { id: 'shoulders', sets: 4 }, { id: 'triceps', sets: 3 }],
      5: [{ id: 'lats', sets: 4 }, { id: 'mid_back', sets: 3 }, { id: 'elbow_flexors', sets: 3 }],
      6: [{ id: 'quads', sets: 4 }, { id: 'hamstrings', sets: 3 }, { id: 'glutes', sets: 3 }, { id: 'calves', sets: 3 }],
    }),
  },
  {
    name: 'Upper / Lower',
    description: '4 days, 2x frequency',
    slots: makeSlots({
      1: [{ id: 'pecs', sets: 3 }, { id: 'shoulders', sets: 3 }, { id: 'lats', sets: 3 }, { id: 'triceps', sets: 2 }, { id: 'elbow_flexors', sets: 2 }],
      2: [{ id: 'quads', sets: 4 }, { id: 'hamstrings', sets: 3 }, { id: 'glutes', sets: 3 }, { id: 'calves', sets: 3 }],
      4: [{ id: 'pecs', sets: 3 }, { id: 'shoulders', sets: 3 }, { id: 'lats', sets: 3 }, { id: 'triceps', sets: 2 }, { id: 'elbow_flexors', sets: 2 }],
      5: [{ id: 'quads', sets: 4 }, { id: 'hamstrings', sets: 3 }, { id: 'glutes', sets: 3 }, { id: 'calves', sets: 3 }],
    }),
  },
  {
    name: 'Full Body 3x',
    description: '3 days, 3x frequency on major muscles',
    slots: makeSlots({
      1: [{ id: 'pecs', sets: 3 }, { id: 'lats', sets: 3 }, { id: 'quads', sets: 3 }, { id: 'shoulders', sets: 2 }, { id: 'hamstrings', sets: 2 }],
      3: [{ id: 'pecs', sets: 3 }, { id: 'lats', sets: 3 }, { id: 'quads', sets: 3 }, { id: 'shoulders', sets: 2 }, { id: 'glutes', sets: 2 }],
      5: [{ id: 'pecs', sets: 3 }, { id: 'lats', sets: 3 }, { id: 'quads', sets: 3 }, { id: 'shoulders', sets: 2 }, { id: 'hamstrings', sets: 2 }],
    }),
  },
  {
    name: 'Bro Split',
    description: '5 days, 1x per muscle group',
    slots: makeSlots({
      1: [{ id: 'pecs', sets: 5 }, { id: 'triceps', sets: 4 }],
      2: [{ id: 'lats', sets: 5 }, { id: 'mid_back', sets: 3 }, { id: 'elbow_flexors', sets: 4 }],
      3: [{ id: 'shoulders', sets: 5 }, { id: 'upper_back', sets: 3 }],
      4: [{ id: 'quads', sets: 5 }, { id: 'hamstrings', sets: 4 }, { id: 'calves', sets: 3 }],
      5: [{ id: 'glutes', sets: 5 }, { id: 'core', sets: 4 }, { id: 'forearm', sets: 3 }],
    }),
  },
];
