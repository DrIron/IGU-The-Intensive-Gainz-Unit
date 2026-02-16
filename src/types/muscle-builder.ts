// src/types/muscle-builder.ts
// Type definitions and constants for the Planning Board (Muscle Workout Builder)

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
  id: string;           // Unique slot identifier
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

// ============================================================
// Muscle Subdivisions (anatomically specific sub-groups)
// ============================================================

export interface SubdivisionDef {
  id: string;        // e.g. 'pecs_clavicular'
  label: string;     // e.g. 'Clavicular (Upper)'
  parentId: string;  // e.g. 'pecs'
}

export const SUBDIVISIONS: SubdivisionDef[] = [
  // Pecs
  { id: 'pecs_clavicular', label: 'Clavicular (Upper)', parentId: 'pecs' },
  { id: 'pecs_sternal', label: 'Sternal (Mid)', parentId: 'pecs' },
  { id: 'pecs_costal', label: 'Costal (Lower)', parentId: 'pecs' },
  // Shoulders
  { id: 'shoulders_anterior', label: 'Anterior Delt', parentId: 'shoulders' },
  { id: 'shoulders_lateral', label: 'Lateral Delt', parentId: 'shoulders' },
  { id: 'shoulders_posterior', label: 'Posterior Delt', parentId: 'shoulders' },
  // Triceps
  { id: 'triceps_long', label: 'Long Head', parentId: 'triceps' },
  { id: 'triceps_lateral', label: 'Lateral Head', parentId: 'triceps' },
  { id: 'triceps_medial', label: 'Medial Head', parentId: 'triceps' },
  // Lats
  { id: 'lats_iliac', label: 'Iliac', parentId: 'lats' },
  { id: 'lats_thoracic', label: 'Thoracic', parentId: 'lats' },
  { id: 'lats_lumbar', label: 'Lumbar', parentId: 'lats' },
  // Mid-back
  { id: 'mid_back_rhomboids', label: 'Rhomboids', parentId: 'mid_back' },
  { id: 'mid_back_mid_traps', label: 'Middle Trapezius', parentId: 'mid_back' },
  { id: 'mid_back_low_traps', label: 'Lower Trapezius', parentId: 'mid_back' },
  // Upper Back
  { id: 'upper_back_upper_traps', label: 'Upper Trapezius', parentId: 'upper_back' },
  { id: 'upper_back_teres_major', label: 'Teres Major', parentId: 'upper_back' },
  // Elbow Flexors
  { id: 'elbow_flexors_biceps_short', label: 'Biceps Short Head', parentId: 'elbow_flexors' },
  { id: 'elbow_flexors_biceps_long', label: 'Biceps Long Head', parentId: 'elbow_flexors' },
  { id: 'elbow_flexors_brachialis', label: 'Brachialis', parentId: 'elbow_flexors' },
  { id: 'elbow_flexors_brachioradialis', label: 'Brachioradialis', parentId: 'elbow_flexors' },
  // Forearm
  { id: 'forearm_flexors', label: 'Wrist Flexors', parentId: 'forearm' },
  { id: 'forearm_extensors', label: 'Wrist Extensors', parentId: 'forearm' },
  // Quads
  { id: 'quads_rectus_femoris', label: 'Rectus Femoris', parentId: 'quads' },
  { id: 'quads_vastus_lateralis', label: 'Vastus Lateralis', parentId: 'quads' },
  { id: 'quads_vastus_medialis', label: 'Vastus Medialis', parentId: 'quads' },
  { id: 'quads_vastus_intermedius', label: 'Vastus Intermedius', parentId: 'quads' },
  // Glutes
  { id: 'glutes_max', label: 'Glute Max', parentId: 'glutes' },
  { id: 'glutes_med', label: 'Glute Med', parentId: 'glutes' },
  { id: 'glutes_min', label: 'Glute Min', parentId: 'glutes' },
  // Hip Flexors
  { id: 'hip_flexors_rec_fem', label: 'Rec Fem', parentId: 'hip_flexors' },
  { id: 'hip_flexors_sartorius', label: 'Sartorius', parentId: 'hip_flexors' },
  { id: 'hip_flexors_iliacus', label: 'Iliacus', parentId: 'hip_flexors' },
  // Core
  { id: 'core_rectus_abdominis', label: 'Rectus Abdominis', parentId: 'core' },
  { id: 'core_internal_obliques', label: 'Internal Obliques', parentId: 'core' },
  { id: 'core_external_obliques', label: 'External Obliques', parentId: 'core' },
  { id: 'core_transversus', label: 'Transversus Abdominis', parentId: 'core' },
  { id: 'core_erectors', label: 'Spinal Erectors', parentId: 'core' },
  { id: 'core_pelvic_floor', label: 'Pelvic Floor', parentId: 'core' },
  // Neck
  { id: 'neck_scm', label: 'SCM', parentId: 'neck' },
  { id: 'neck_upper_traps', label: 'Upper Trapezius', parentId: 'neck' },
  { id: 'neck_scalenes', label: 'Scalenes', parentId: 'neck' },
  { id: 'neck_splenius', label: 'Splenius', parentId: 'neck' },
];

/** Lookup by subdivision ID */
export const SUBDIVISION_MAP = new Map(SUBDIVISIONS.map(s => [s.id, s]));

/** Parent muscle ID → its subdivisions */
export const SUBDIVISIONS_BY_PARENT = new Map<string, SubdivisionDef[]>();
for (const sub of SUBDIVISIONS) {
  const existing = SUBDIVISIONS_BY_PARENT.get(sub.parentId) || [];
  existing.push(sub);
  SUBDIVISIONS_BY_PARENT.set(sub.parentId, existing);
}

/** Returns parentId if muscleId is a subdivision, or muscleId itself if it's already a parent */
export function resolveParentMuscleId(muscleId: string): string {
  const sub = SUBDIVISION_MAP.get(muscleId);
  return sub ? sub.parentId : muscleId;
}

/** Unified display lookup — checks MUSCLE_MAP first, then SUBDIVISION_MAP (inherits parent color) */
export function getMuscleDisplay(muscleId: string): { label: string; colorClass: string; colorHex: string } | null {
  const parent = MUSCLE_MAP.get(muscleId);
  if (parent) return { label: parent.label, colorClass: parent.colorClass, colorHex: parent.colorHex };
  const sub = SUBDIVISION_MAP.get(muscleId);
  if (!sub) return null;
  const parentDef = MUSCLE_MAP.get(sub.parentId);
  if (!parentDef) return null;
  return { label: sub.label, colorClass: parentDef.colorClass, colorHex: parentDef.colorHex };
}

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
      slots.push({ id: crypto.randomUUID(), dayIndex: Number(day), muscleId: m.id, sets: m.sets, sortOrder: i });
    });
  }
  return slots;
}

export interface SystemPreset {
  name: string;
  description: string;
  slots: MuscleSlotData[];
}

// ============================================================
// Mapping: Planning Board muscle IDs → exercise_library.primary_muscle values
// Used by ExercisePickerDialog to auto-filter when editing muscle-converted modules.
// ============================================================

export const MUSCLE_TO_EXERCISE_FILTER: Record<string, string[]> = {
  // Parent groups (unchanged)
  pecs:          ['Chest', 'Upper Chest'],
  shoulders:     ['Shoulders', 'Side Delts', 'Front Delts', 'Rear Delts'],
  triceps:       ['Triceps'],
  lats:          ['Lats'],
  mid_back:      ['Upper Back'],
  upper_back:    ['Upper Back', 'Traps'],
  elbow_flexors: ['Biceps', 'Brachialis'],
  forearm:       ['Forearms'],
  quads:         ['Quadriceps'],
  hamstrings:    ['Hamstrings'],
  glutes:        ['Glutes'],
  calves:        ['Calves'],
  adductors:     ['Adductors'],
  abductors:     ['Abductors'],
  hip_flexors:   ['Hip Flexors', 'Glutes'],
  core:          ['Core', 'Obliques'],
  neck:          ['Traps'],
  // Pecs subdivisions
  pecs_clavicular:  ['Upper Chest', 'Chest'],
  pecs_sternal:     ['Chest'],
  pecs_costal:      ['Chest'],
  // Shoulders subdivisions
  shoulders_anterior:  ['Front Delts', 'Shoulders'],
  shoulders_lateral:   ['Side Delts', 'Shoulders'],
  shoulders_posterior: ['Rear Delts'],
  // Triceps subdivisions
  triceps_long:    ['Triceps'],
  triceps_lateral: ['Triceps'],
  triceps_medial:  ['Triceps'],
  // Lats subdivisions
  lats_iliac:    ['Lats'],
  lats_thoracic: ['Lats'],
  lats_lumbar:   ['Lats'],
  // Mid-back subdivisions
  mid_back_rhomboids:  ['Upper Back'],
  mid_back_mid_traps:  ['Upper Back', 'Traps'],
  mid_back_low_traps:  ['Upper Back', 'Traps'],
  // Upper Back subdivisions
  upper_back_upper_traps: ['Traps'],
  upper_back_teres_major: ['Upper Back', 'Lats'],
  // Elbow Flexors subdivisions
  elbow_flexors_biceps_short:    ['Biceps'],
  elbow_flexors_biceps_long:     ['Biceps'],
  elbow_flexors_brachialis:      ['Brachialis', 'Biceps'],
  elbow_flexors_brachioradialis: ['Forearms', 'Biceps'],
  // Forearm subdivisions
  forearm_flexors:   ['Forearms'],
  forearm_extensors: ['Forearms'],
  // Quads subdivisions
  quads_rectus_femoris:    ['Quadriceps'],
  quads_vastus_lateralis:  ['Quadriceps'],
  quads_vastus_medialis:   ['Quadriceps'],
  quads_vastus_intermedius: ['Quadriceps'],
  // Glutes subdivisions
  glutes_max: ['Glutes'],
  glutes_med: ['Glutes'],
  glutes_min: ['Glutes'],
  // Hip Flexors subdivisions
  hip_flexors_rec_fem:   ['Hip Flexors', 'Quadriceps'],
  hip_flexors_sartorius: ['Hip Flexors'],
  hip_flexors_iliacus:   ['Hip Flexors'],
  // Core subdivisions
  core_rectus_abdominis:  ['Core'],
  core_internal_obliques: ['Obliques', 'Core'],
  core_external_obliques: ['Obliques', 'Core'],
  core_transversus:       ['Core'],
  core_erectors:          ['Core'],
  core_pelvic_floor:      ['Core'],
  // Neck subdivisions
  neck_scm:         ['Traps'],
  neck_upper_traps: ['Traps'],
  neck_scalenes:    ['Traps'],
  neck_splenius:    ['Traps'],
};

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
