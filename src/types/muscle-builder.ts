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

// ============================================================
// Activity Types (multi-session support)
// ============================================================

export type ActivityType = 'strength' | 'cardio' | 'hiit' | 'yoga_mobility' | 'recovery' | 'sport_specific';

export interface ActivityDef {
  id: string;
  label: string;
  category: ActivityType;
  colorClass: string;
  colorHex: string;
}

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  strength: 'Strength',
  cardio: 'Cardio',
  hiit: 'HIIT',
  yoga_mobility: 'Yoga / Mobility',
  recovery: 'Recovery',
  sport_specific: 'Sport-Specific',
};

export const ACTIVITY_TYPE_COLORS: Record<ActivityType, { colorClass: string; colorHex: string }> = {
  strength: { colorClass: 'bg-blue-500', colorHex: '#3b82f6' },
  cardio: { colorClass: 'bg-green-500', colorHex: '#22c55e' },
  hiit: { colorClass: 'bg-orange-500', colorHex: '#f97316' },
  yoga_mobility: { colorClass: 'bg-purple-500', colorHex: '#a855f7' },
  recovery: { colorClass: 'bg-teal-500', colorHex: '#14b8a6' },
  sport_specific: { colorClass: 'bg-red-500', colorHex: '#ef4444' },
};

export const ACTIVITY_CATEGORIES: ActivityDef[] = [
  // Cardio (green)
  { id: 'running', label: 'Running', category: 'cardio', colorClass: 'bg-green-500', colorHex: '#22c55e' },
  { id: 'cycling', label: 'Cycling', category: 'cardio', colorClass: 'bg-green-500', colorHex: '#22c55e' },
  { id: 'rowing', label: 'Rowing', category: 'cardio', colorClass: 'bg-green-500', colorHex: '#22c55e' },
  { id: 'swimming', label: 'Swimming', category: 'cardio', colorClass: 'bg-green-500', colorHex: '#22c55e' },
  { id: 'elliptical', label: 'Elliptical', category: 'cardio', colorClass: 'bg-green-500', colorHex: '#22c55e' },
  { id: 'jump_rope', label: 'Jump Rope', category: 'cardio', colorClass: 'bg-green-500', colorHex: '#22c55e' },
  { id: 'assault_bike', label: 'Assault Bike', category: 'cardio', colorClass: 'bg-green-500', colorHex: '#22c55e' },
  { id: 'stair_climber', label: 'Stair Climber', category: 'cardio', colorClass: 'bg-green-500', colorHex: '#22c55e' },
  { id: 'walking', label: 'Walking', category: 'cardio', colorClass: 'bg-green-500', colorHex: '#22c55e' },
  // HIIT (orange)
  { id: 'tabata', label: 'Tabata', category: 'hiit', colorClass: 'bg-orange-500', colorHex: '#f97316' },
  { id: 'emom', label: 'EMOM', category: 'hiit', colorClass: 'bg-orange-500', colorHex: '#f97316' },
  { id: 'amrap', label: 'AMRAP', category: 'hiit', colorClass: 'bg-orange-500', colorHex: '#f97316' },
  { id: 'circuit', label: 'Circuit', category: 'hiit', colorClass: 'bg-orange-500', colorHex: '#f97316' },
  { id: 'interval_training', label: 'Interval Training', category: 'hiit', colorClass: 'bg-orange-500', colorHex: '#f97316' },
  // Yoga / Mobility (purple)
  { id: 'vinyasa_flow', label: 'Vinyasa Flow', category: 'yoga_mobility', colorClass: 'bg-purple-500', colorHex: '#a855f7' },
  { id: 'hatha_yoga', label: 'Hatha Yoga', category: 'yoga_mobility', colorClass: 'bg-purple-500', colorHex: '#a855f7' },
  { id: 'yin_yoga', label: 'Yin Yoga', category: 'yoga_mobility', colorClass: 'bg-purple-500', colorHex: '#a855f7' },
  { id: 'power_yoga', label: 'Power Yoga', category: 'yoga_mobility', colorClass: 'bg-purple-500', colorHex: '#a855f7' },
  { id: 'stretching', label: 'Stretching', category: 'yoga_mobility', colorClass: 'bg-purple-500', colorHex: '#a855f7' },
  { id: 'foam_rolling_mobility', label: 'Foam Rolling', category: 'yoga_mobility', colorClass: 'bg-purple-500', colorHex: '#a855f7' },
  { id: 'dynamic_warmup', label: 'Dynamic Warmup', category: 'yoga_mobility', colorClass: 'bg-purple-500', colorHex: '#a855f7' },
  { id: 'band_work', label: 'Band Work', category: 'yoga_mobility', colorClass: 'bg-purple-500', colorHex: '#a855f7' },
  { id: 'cat_cow', label: 'Cat-Cow', category: 'yoga_mobility', colorClass: 'bg-purple-500', colorHex: '#a855f7' },
  { id: 'hip_9090', label: 'Hip 90/90', category: 'yoga_mobility', colorClass: 'bg-purple-500', colorHex: '#a855f7' },
  // Recovery (teal)
  { id: 'foam_rolling_recovery', label: 'Foam Rolling', category: 'recovery', colorClass: 'bg-teal-500', colorHex: '#14b8a6' },
  { id: 'cold_plunge', label: 'Cold Plunge', category: 'recovery', colorClass: 'bg-teal-500', colorHex: '#14b8a6' },
  { id: 'sauna', label: 'Sauna', category: 'recovery', colorClass: 'bg-teal-500', colorHex: '#14b8a6' },
  { id: 'massage', label: 'Massage', category: 'recovery', colorClass: 'bg-teal-500', colorHex: '#14b8a6' },
  { id: 'light_walk', label: 'Light Walk', category: 'recovery', colorClass: 'bg-teal-500', colorHex: '#14b8a6' },
  { id: 'sleep_rest', label: 'Sleep / Rest', category: 'recovery', colorClass: 'bg-teal-500', colorHex: '#14b8a6' },
  // Sport-Specific (red)
  { id: 'agility_drills', label: 'Agility Drills', category: 'sport_specific', colorClass: 'bg-red-500', colorHex: '#ef4444' },
  { id: 'plyometrics', label: 'Plyometrics', category: 'sport_specific', colorClass: 'bg-red-500', colorHex: '#ef4444' },
  { id: 'skill_work', label: 'Skill Work', category: 'sport_specific', colorClass: 'bg-red-500', colorHex: '#ef4444' },
  { id: 'sprint_drills', label: 'Sprint Drills', category: 'sport_specific', colorClass: 'bg-red-500', colorHex: '#ef4444' },
  { id: 'footwork', label: 'Footwork', category: 'sport_specific', colorClass: 'bg-red-500', colorHex: '#ef4444' },
  { id: 'reaction_training', label: 'Reaction Training', category: 'sport_specific', colorClass: 'bg-red-500', colorHex: '#ef4444' },
];

export const ACTIVITY_MAP = new Map(ACTIVITY_CATEGORIES.map(a => [a.id, a]));

/** Get activities grouped by category */
export const ACTIVITIES_BY_CATEGORY = new Map<ActivityType, ActivityDef[]>();
for (const activity of ACTIVITY_CATEGORIES) {
  const existing = ACTIVITIES_BY_CATEGORY.get(activity.category) || [];
  existing.push(activity);
  ACTIVITIES_BY_CATEGORY.set(activity.category, existing);
}

/** Lookup activity display by ID */
export function getActivityDisplay(activityId: string): { label: string; colorClass: string; colorHex: string; category: ActivityType } | null {
  const activity = ACTIVITY_MAP.get(activityId);
  if (!activity) return null;
  return { label: activity.label, colorClass: activity.colorClass, colorHex: activity.colorHex, category: activity.category };
}

// ============================================================
// Slot Exercise + Slot Data
// ============================================================

export interface SlotExercise {
  exerciseId: string;   // FK to exercise_library.id
  name: string;         // Denormalized for display (captured at selection time)
  instructions?: string; // Coach notes for this exercise
}

export interface MuscleSlotData {
  id: string;           // Unique slot identifier
  dayIndex: number;     // 1-7 (Mon-Sun)
  muscleId: string;
  sets: number;
  repMin: number;       // Default 8
  repMax: number;       // Default 12
  tempo?: string;       // 4-digit notation "3120" (ecc-pause-con-pause in seconds)
  rir?: number;         // Reps in Reserve (0-10)
  rpe?: number;         // Rate of Perceived Exertion (1-10, half-steps allowed)
  sortOrder: number;
  sessionId?: string;   // FK to SessionData.id — the session this slot belongs to. Optional only for backward compat; normalized on load.
  exercise?: SlotExercise;          // Primary exercise (optional — assigned in final planning phase)
  replacements?: SlotExercise[];    // Alternative exercises client can swap to
  setsDetail?: import("@/types/workout-builder").SetPrescription[];  // Per-set overrides (when customizing individual sets)
  prescriptionColumns?: string[];   // Active prescription column types for this slot
  clientInputColumns?: string[];    // Per-slot client input override (undefined = use global plan defaults)
  // Activity fields (non-strength sessions — all optional, backward compat)
  activityType?: ActivityType;       // undefined = 'strength'
  activityId?: string;               // e.g. 'running', 'tabata' — references ACTIVITY_CATEGORIES
  activityName?: string;             // display name (denormalized)
  duration?: number;                 // minutes
  distance?: number;                 // meters
  targetHrZone?: number;             // 1-5
  pace?: string;                     // free text
  rounds?: number;                   // HIIT
  workSeconds?: number;              // HIIT
  restSeconds?: number;              // HIIT
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  activityNotes?: string;            // general notes for non-strength slot
}

// Session = a coach-defined grouping of activities within a day.
// One day can have multiple sessions ("Push", "Z2 Cardio") — each becomes
// its own day_module when converted to a program.
export interface SessionData {
  id: string;
  dayIndex: number;     // 1-7
  name?: string;        // Optional coach label; falls back to defaultSessionName(type)
  type: ActivityType;   // Drives default label, color, and session_type on conversion
  sortOrder: number;    // Order within the day (ascending)
}

export interface WeekData {
  slots: MuscleSlotData[];
  sessions?: SessionData[];  // Optional for backward compat; normalized on load via migrateSlotsToSessions
  label?: string;
  isDeload?: boolean;
}

export function defaultSessionName(type: ActivityType): string {
  return ACTIVITY_TYPE_LABELS[type];
}

/**
 * Migrate a legacy week's slots (no sessionId) into the session-aware shape.
 * Groups slots by (dayIndex, activityType||'strength') and creates one
 * SessionData per group. Slots that already carry a sessionId matching a
 * provided session are preserved; unmatched slots fall back to auto-grouping.
 *
 * Returns the normalized slots (with sessionId set) and the full sessions array.
 */
export function migrateSlotsToSessions(
  slots: MuscleSlotData[],
  existingSessions?: SessionData[],
): { slots: MuscleSlotData[]; sessions: SessionData[] } {
  const sessionsById = new Map<string, SessionData>();
  if (existingSessions) {
    for (const s of existingSessions) sessionsById.set(s.id, s);
  }

  // Group slots by (dayIndex, activityType) for auto-session creation.
  // Preserves ordering via a composite key + first-seen order.
  const autoSessionKey = (dayIndex: number, type: ActivityType) => `${dayIndex}:${type}`;
  const autoSessions = new Map<string, SessionData>();
  const sortOrderByDay = new Map<number, number>();

  const nextSortOrder = (dayIndex: number): number => {
    const existing = [...sessionsById.values()]
      .filter(s => s.dayIndex === dayIndex)
      .map(s => s.sortOrder);
    const max = existing.length > 0 ? Math.max(...existing) : -1;
    const n = sortOrderByDay.get(dayIndex) ?? max;
    const next = n + 1;
    sortOrderByDay.set(dayIndex, next);
    return next;
  };

  const normalizedSlots = slots.map(slot => {
    // Slot already bound to a known session — keep as-is.
    if (slot.sessionId && sessionsById.has(slot.sessionId)) return slot;

    const type: ActivityType = slot.activityType || 'strength';
    const key = autoSessionKey(slot.dayIndex, type);
    let session = autoSessions.get(key);
    if (!session) {
      session = {
        id: crypto.randomUUID(),
        dayIndex: slot.dayIndex,
        type,
        sortOrder: nextSortOrder(slot.dayIndex),
      };
      autoSessions.set(key, session);
      sessionsById.set(session.id, session);
    }
    return { ...slot, sessionId: session.id };
  });

  const sessions = [...sessionsById.values()].sort((a, b) => {
    if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
    return a.sortOrder - b.sortOrder;
  });

  return { slots: normalizedSlots, sessions };
}

export interface MusclePlanState {
  templateId: string | null;
  name: string;
  description: string;
  weeks: WeekData[];
  currentWeekIndex: number;
  selectedDayIndex: number;
  isDirty: boolean;
  isSaving: boolean;
  globalClientInputs: string[];
  globalPrescriptionColumns: string[];
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
  { id: 'rotator_cuff', label: 'Rotator Cuff', bodyRegion: 'push', colorClass: 'bg-pink-400', colorHex: '#f472b6', landmarks: { MV: 2, MEV: 4, MAV: 10, MRV: 14 } },
  { id: 'serratus', label: 'Serratus Anterior', bodyRegion: 'push', colorClass: 'bg-pink-300', colorHex: '#f9a8d4', landmarks: { MV: 2, MEV: 4, MAV: 10, MRV: 14 } },
  // Pull muscles (blue/sky/cyan/indigo/violet)
  { id: 'lats', label: 'Lats', bodyRegion: 'pull', colorClass: 'bg-blue-500', colorHex: '#3b82f6', landmarks: { MV: 6, MEV: 10, MAV: 20, MRV: 25 } },
  { id: 'upper_mid_back', label: 'Upper / Mid Back', bodyRegion: 'pull', colorClass: 'bg-sky-500', colorHex: '#0ea5e9', landmarks: { MV: 6, MEV: 8, MAV: 18, MRV: 22 } },
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
  { id: 'tibialis', label: 'Tibialis Anterior', bodyRegion: 'legs', colorClass: 'bg-cyan-400', colorHex: '#22d3ee', landmarks: { MV: 2, MEV: 4, MAV: 8, MRV: 12 } },
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
  { id: 'triceps_long', label: 'Long Head (Scapular Plane)', parentId: 'triceps' },
  { id: 'triceps_lat_med', label: 'Lateral + Medial (Non-Scapular)', parentId: 'triceps' },
  // Lats
  { id: 'lats_iliac', label: 'Iliac', parentId: 'lats' },
  { id: 'lats_thoracic', label: 'Thoracic', parentId: 'lats' },
  { id: 'lats_lumbar', label: 'Lumbar', parentId: 'lats' },
  // Upper / Mid Back
  { id: 'upper_back_upper_traps', label: 'Upper Trapezius', parentId: 'upper_mid_back' },
  { id: 'mid_back_mid_traps', label: 'Middle Trapezius', parentId: 'upper_mid_back' },
  { id: 'mid_back_low_traps', label: 'Lower Trapezius', parentId: 'upper_mid_back' },
  { id: 'mid_back_rhomboids', label: 'Rhomboids', parentId: 'upper_mid_back' },
  { id: 'upper_back_teres_major', label: 'Teres Major', parentId: 'upper_mid_back' },
  // Elbow Flexors
  { id: 'elbow_flexors_biceps_short', label: 'Biceps Short Head', parentId: 'elbow_flexors' },
  { id: 'elbow_flexors_biceps_long', label: 'Biceps Long Head', parentId: 'elbow_flexors' },
  { id: 'elbow_flexors_brachialis', label: 'Brachialis', parentId: 'elbow_flexors' },
  { id: 'elbow_flexors_brachioradialis', label: 'Brachioradialis', parentId: 'elbow_flexors' },
  // Rotator Cuff
  { id: 'rotator_cuff_supraspinatus', label: 'Supraspinatus', parentId: 'rotator_cuff' },
  { id: 'rotator_cuff_infraspinatus', label: 'Infraspinatus', parentId: 'rotator_cuff' },
  { id: 'rotator_cuff_subscapularis', label: 'Subscapularis', parentId: 'rotator_cuff' },
  { id: 'rotator_cuff_teres_minor', label: 'Teres Minor', parentId: 'rotator_cuff' },
  // Serratus
  { id: 'serratus_anterior', label: 'Serratus Anterior', parentId: 'serratus' },
  // Forearm
  { id: 'forearm_flexors', label: 'Wrist Flexors', parentId: 'forearm' },
  { id: 'forearm_extensors', label: 'Wrist Extensors', parentId: 'forearm' },
  { id: 'forearm_digital_flexors', label: 'Digital Flexors (Grip)', parentId: 'forearm' },
  { id: 'forearm_digital_extensors', label: 'Digital Extensors', parentId: 'forearm' },
  { id: 'forearm_supinators', label: 'Supinators', parentId: 'forearm' },
  { id: 'forearm_pronators', label: 'Pronators', parentId: 'forearm' },
  // Quads
  { id: 'quads_rectus_femoris', label: 'Rectus Femoris', parentId: 'quads' },
  { id: 'quads_vastus_lateralis', label: 'Vastus Lateralis', parentId: 'quads' },
  { id: 'quads_vastus_medialis', label: 'Vastus Medialis', parentId: 'quads' },
  { id: 'quads_vastus_intermedius', label: 'Vastus Intermedius', parentId: 'quads' },
  // Calves
  { id: 'calves_gastrocnemius', label: 'Gastrocnemius', parentId: 'calves' },
  { id: 'calves_soleus', label: 'Soleus', parentId: 'calves' },
  // Tibialis
  { id: 'tibialis_anterior', label: 'Tibialis Anterior', parentId: 'tibialis' },
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

// ============================================================
// Short labels — compact names for narrow slot cards.
// Full label is always available via getMuscleDisplay; use these for
// the calendar slot row only. Keep them short, unique, lowercase-friendly.
// ============================================================

/** Short label for each parent muscle (fallback when no subdivision) */
const PARENT_SHORT_LABELS: Record<string, string> = {
  pecs: 'Pecs',
  shoulders: 'Delts',
  triceps: 'Tri',
  rotator_cuff: 'RC',
  serratus: 'Serr',
  lats: 'Lats',
  upper_mid_back: 'Back',
  elbow_flexors: 'Bi',
  forearm: 'Frm',
  quads: 'Quads',
  hamstrings: 'Hams',
  glutes: 'Glutes',
  calves: 'Calves',
  adductors: 'Add',
  abductors: 'Abd',
  hip_flexors: 'Hips',
  tibialis: 'Tib',
  core: 'Core',
  neck: 'Neck',
};

/** Short sub-part, joined to the parent short label with " / " */
const SUBDIVISION_SHORT_PARTS: Record<string, string> = {
  // Pecs
  pecs_clavicular: 'Upper',
  pecs_sternal: 'Mid',
  pecs_costal: 'Lower',
  // Shoulders
  shoulders_anterior: 'Front',
  shoulders_lateral: 'Side',
  shoulders_posterior: 'Rear',
  // Triceps
  triceps_long: 'Long',
  triceps_lat_med: 'Lat+Med',
  // Rotator Cuff
  rotator_cuff_supraspinatus: 'Supra',
  rotator_cuff_infraspinatus: 'Infra',
  rotator_cuff_subscapularis: 'Subsc',
  rotator_cuff_teres_minor: 'T.Min',
  // Serratus
  serratus_anterior: 'Ant',
  // Lats
  lats_iliac: 'Iliac',
  lats_thoracic: 'Thor',
  lats_lumbar: 'Lumb',
  // Upper / Mid Back
  upper_back_upper_traps: 'U.Trap',
  mid_back_mid_traps: 'M.Trap',
  mid_back_low_traps: 'L.Trap',
  mid_back_rhomboids: 'Rhom',
  upper_back_teres_major: 'T.Maj',
  // Elbow Flexors
  elbow_flexors_biceps_short: 'Bi.Sh',
  elbow_flexors_biceps_long: 'Bi.Lg',
  elbow_flexors_brachialis: 'Brach',
  elbow_flexors_brachioradialis: 'B.Rad',
  // Forearm
  forearm_flexors: 'WFlex',
  forearm_extensors: 'WExt',
  forearm_digital_flexors: 'Grip',
  forearm_digital_extensors: 'D.Ext',
  forearm_supinators: 'Sup',
  forearm_pronators: 'Pro',
  // Quads
  quads_rectus_femoris: 'RF',
  quads_vastus_lateralis: 'VL',
  quads_vastus_medialis: 'VM',
  quads_vastus_intermedius: 'VI',
  // Calves
  calves_gastrocnemius: 'Gastr',
  calves_soleus: 'Sol',
  // Tibialis
  tibialis_anterior: 'Ant',
  // Glutes
  glutes_max: 'Max',
  glutes_med: 'Med',
  glutes_min: 'Min',
  // Hip Flexors
  hip_flexors_rec_fem: 'RF',
  hip_flexors_sartorius: 'Sart',
  hip_flexors_iliacus: 'Iliac',
  // Core
  core_rectus_abdominis: 'RA',
  core_internal_obliques: 'Int.Ob',
  core_external_obliques: 'Ext.Ob',
  core_transversus: 'TrAb',
  core_erectors: 'Erctr',
  core_pelvic_floor: 'Pelv',
  // Neck
  neck_scm: 'SCM',
  neck_upper_traps: 'U.Trap',
  neck_scalenes: 'Scal',
  neck_splenius: 'Splen',
};

/**
 * Compact label for slot cards: parent short + optional subdivision part.
 * Examples: "Pecs", "Pecs / Upper", "Back / U.Trap", "Bi / Bi.Sh".
 * Keep under ~16 chars so it fits a 160px column without truncation.
 */
export function getShortMuscleLabel(muscleId: string): string {
  // Subdivision: join parent + sub part.
  const sub = SUBDIVISION_MAP.get(muscleId);
  if (sub) {
    const parent = PARENT_SHORT_LABELS[sub.parentId] ?? sub.parentId;
    const part = SUBDIVISION_SHORT_PARTS[muscleId];
    return part ? `${parent} / ${part}` : parent;
  }
  // Parent muscle: return its short form.
  if (PARENT_SHORT_LABELS[muscleId]) return PARENT_SHORT_LABELS[muscleId];
  // Non-muscle (cardio/hiit/etc.) — fall back to the full label from MUSCLE_MAP.
  const parent = MUSCLE_MAP.get(muscleId);
  return parent?.label ?? muscleId;
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
// Tempo & Working Set Helpers
// ============================================================

/** Parse 4-digit tempo "3120" → { ecc, pause1, con, pause2, total } or null */
export function parseTempo(tempo: string | undefined): { ecc: number; pause1: number; con: number; pause2: number; total: number } | null {
  if (!tempo || tempo.length !== 4) return null;
  const digits = tempo.split('').map(Number);
  if (digits.some(isNaN)) return null;
  return { ecc: digits[0], pause1: digits[1], con: digits[2], pause2: digits[3], total: digits[0] + digits[1] + digits[2] + digits[3] };
}

/** Check if slot counts as a "working set" for TUST calculation (RIR ≤ 5 or RPE ≥ 5) */
export function isWorkingSet(slot: MuscleSlotData): boolean {
  if (slot.rir != null && slot.rir <= 5) return true;
  if (slot.rpe != null && slot.rpe >= 5) return true;
  return false;
}

// ============================================================
// Built-in Presets
// ============================================================

function makeSlots(dayMuscles: Record<number, { id: string; sets: number; repMin?: number; repMax?: number }[]>): MuscleSlotData[] {
  const slots: MuscleSlotData[] = [];
  for (const [day, muscles] of Object.entries(dayMuscles)) {
    muscles.forEach((m, i) => {
      slots.push({ id: crypto.randomUUID(), dayIndex: Number(day), muscleId: m.id, sets: m.sets, repMin: m.repMin ?? 8, repMax: m.repMax ?? 12, sortOrder: i });
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
  upper_mid_back: ['Upper Back', 'Traps'],
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
  rotator_cuff:  ['Rotator Cuff', 'Shoulders'],
  serratus:      ['Serratus', 'Core'],
  tibialis:      ['Tibialis', 'Calves'],
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
  triceps_lat_med: ['Triceps'],
  // Lats subdivisions
  lats_iliac:    ['Lats'],
  lats_thoracic: ['Lats'],
  lats_lumbar:   ['Lats'],
  // Upper / Mid Back subdivisions
  upper_back_upper_traps: ['Traps', 'Upper Back'],
  mid_back_mid_traps:     ['Upper Back', 'Traps'],
  mid_back_low_traps:     ['Upper Back', 'Traps'],
  mid_back_rhomboids:     ['Upper Back'],
  upper_back_teres_major: ['Upper Back', 'Lats'],
  // Elbow Flexors subdivisions
  elbow_flexors_biceps_short:    ['Biceps'],
  elbow_flexors_biceps_long:     ['Biceps'],
  elbow_flexors_brachialis:      ['Brachialis', 'Biceps'],
  elbow_flexors_brachioradialis: ['Forearms', 'Biceps'],
  // Rotator Cuff subdivisions
  rotator_cuff_supraspinatus: ['Rotator Cuff', 'Shoulders'],
  rotator_cuff_infraspinatus: ['Rotator Cuff', 'Shoulders'],
  rotator_cuff_subscapularis: ['Rotator Cuff', 'Shoulders'],
  rotator_cuff_teres_minor:   ['Rotator Cuff', 'Shoulders'],
  // Serratus subdivisions
  serratus_anterior: ['Serratus', 'Core'],
  // Forearm subdivisions
  forearm_flexors:           ['Forearms'],
  forearm_extensors:         ['Forearms'],
  forearm_digital_flexors:   ['Forearms'],
  forearm_digital_extensors: ['Forearms'],
  forearm_supinators:        ['Forearms'],
  forearm_pronators:         ['Forearms'],
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
  // Calves subdivisions
  calves_gastrocnemius: ['Calves'],
  calves_soleus:        ['Calves'],
  // Tibialis subdivisions
  tibialis_anterior: ['Tibialis', 'Calves'],
  // Neck subdivisions
  neck_scm:         ['Traps'],
  neck_upper_traps: ['Traps'],
  neck_scalenes:    ['Traps'],
  neck_splenius:    ['Traps'],
};

// ============================================================
// Exercise Library V2 Constants
// ============================================================

export const EQUIPMENT_TYPES = [
  { id: 'BB', label: 'Barbell / EZ Bar' },
  { id: 'DB', label: 'Dumbbell' },
  { id: 'M', label: 'Machine' },
  { id: 'C-FT', label: 'Cable — Functional Trainer' },
  { id: 'C-AA', label: 'Cable — Adjustable Arms' },
  { id: 'C-FS', label: 'Cable — Fixed Seated' },
  { id: 'BW', label: 'Bodyweight / Bands' },
] as const;

export const EQUIPMENT_MAP = new Map(EQUIPMENT_TYPES.map(e => [e.id, e.label]));

export const RESISTANCE_PROFILES = ['Lengthened', 'Mid-range', 'Shortened'] as const;
export type ResistanceProfile = typeof RESISTANCE_PROFILES[number];

export const RESISTANCE_PROFILE_SHORT: Record<ResistanceProfile, string> = {
  'Lengthened': '(L)',
  'Mid-range': '(M)',
  'Shortened': '(S)',
};

export const MACHINE_BRANDS = [
  'Prime', 'Hammer Strength', 'Nautilus', 'Cybex',
  'NewTech M-Torture', 'Atlantis', 'Gymleco', 'Life Fitness', 'Other',
] as const;

export type MachineBrand = typeof MACHINE_BRANDS[number];

export const SYSTEM_PRESETS: SystemPreset[] = [
  {
    name: 'Push / Pull / Legs',
    description: '6 days, 2x frequency per muscle',
    slots: makeSlots({
      1: [{ id: 'pecs', sets: 4 }, { id: 'shoulders', sets: 4 }, { id: 'triceps', sets: 3 }],
      2: [{ id: 'lats', sets: 4 }, { id: 'upper_mid_back', sets: 3 }, { id: 'elbow_flexors', sets: 3 }],
      3: [{ id: 'quads', sets: 4 }, { id: 'hamstrings', sets: 3 }, { id: 'glutes', sets: 3 }, { id: 'calves', sets: 3 }],
      4: [{ id: 'pecs', sets: 4 }, { id: 'shoulders', sets: 4 }, { id: 'triceps', sets: 3 }],
      5: [{ id: 'lats', sets: 4 }, { id: 'upper_mid_back', sets: 3 }, { id: 'elbow_flexors', sets: 3 }],
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
      2: [{ id: 'lats', sets: 5 }, { id: 'upper_mid_back', sets: 3 }, { id: 'elbow_flexors', sets: 4 }],
      3: [{ id: 'shoulders', sets: 5 }, { id: 'upper_mid_back', sets: 3 }],
      4: [{ id: 'quads', sets: 5 }, { id: 'hamstrings', sets: 4 }, { id: 'calves', sets: 3 }],
      5: [{ id: 'glutes', sets: 5 }, { id: 'core', sets: 4 }, { id: 'forearm', sets: 3 }],
    }),
  },
];
