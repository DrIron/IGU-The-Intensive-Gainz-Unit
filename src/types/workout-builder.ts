// src/types/workout-builder.ts
// Type definitions for IGU Workout Builder Phase 1

// ============================================================
// Column Configuration Types
// ============================================================

export type PrescriptionColumnType =
  | 'sets'
  | 'reps'
  | 'rep_range'
  | 'weight'
  | 'tempo'
  | 'rir'
  | 'rpe'
  | 'percent_1rm'
  | 'rest'
  | 'time'
  | 'distance'
  | 'pace'
  | 'hr'
  | 'side'
  | 'rounds'
  | 'band_resistance'
  | 'notes'
  | 'custom';

export type ClientInputColumnType =
  | 'performed_weight'
  | 'performed_reps'
  | 'performed_rir'
  | 'performed_rpe'
  | 'performed_time'
  | 'performed_distance'
  | 'performed_pace'
  | 'performed_hr'
  | 'performed_side'
  | 'performed_rounds'
  | 'performed_calories'
  | 'client_notes';

/**
 * Client-input column types whose performed values do NOT have a dedicated
 * column on exercise_set_logs — they are persisted in the performed_json JSONB
 * blob keyed by type. The four core types (performed_weight/reps/rir/rpe) keep
 * writing their typed columns. See migration 20260613150000.
 */
export const PERFORMED_JSON_COLUMN_TYPES: ReadonlySet<ClientInputColumnType> = new Set([
  'performed_time',
  'performed_distance',
  'performed_pace',
  'performed_hr',
  'performed_side',
  'performed_rounds',
  'performed_calories',
]);

export interface ColumnConfig {
  id: string;
  type: PrescriptionColumnType | ClientInputColumnType;
  label: string;
  visible: boolean;
  order: number;
  width?: number;
  customLabel?: string;
  unit?: string;
  placeholder?: string;
}

export interface ColumnPreset {
  id: string;
  coach_id: string;
  name: string;
  description?: string;
  column_config: ColumnConfig[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// Default column configurations
export const DEFAULT_PRESCRIPTION_COLUMNS: ColumnConfig[] = [
  { id: 'sets', type: 'sets', label: 'Sets', visible: true, order: 0 },
  { id: 'reps', type: 'rep_range', label: 'Reps', visible: true, order: 1 },
  { id: 'weight', type: 'weight', label: 'Weight', visible: true, order: 2, unit: 'kg' },
  { id: 'rir', type: 'rir', label: 'RIR', visible: true, order: 3 },
  { id: 'rest', type: 'rest', label: 'Rest', visible: true, order: 4, unit: 'sec' },
];

export const AVAILABLE_PRESCRIPTION_COLUMNS: { type: PrescriptionColumnType; label: string; unit?: string }[] = [
  { type: 'sets', label: 'Sets' },
  { type: 'reps', label: 'Reps (Single)' },
  { type: 'rep_range', label: 'Rep Range (Min-Max)' },
  { type: 'weight', label: 'Target Weight', unit: 'kg' },
  { type: 'tempo', label: 'Tempo' },
  { type: 'rir', label: 'RIR (Reps in Reserve)' },
  { type: 'rpe', label: 'RPE (Rate of Perceived Exertion)' },
  { type: 'percent_1rm', label: '% of 1RM' },
  { type: 'rest', label: 'Rest Period', unit: 'sec' },
  { type: 'time', label: 'Time/Duration', unit: 'sec' },
  { type: 'distance', label: 'Distance', unit: 'm' },
  { type: 'pace', label: 'Pace' },
  { type: 'hr', label: 'Target HR', unit: 'bpm' },
  { type: 'side', label: 'Side (L/R)' },
  { type: 'rounds', label: 'Rounds' },
  { type: 'band_resistance', label: 'Band Color/Resistance' },
  { type: 'notes', label: 'Coach Notes' },
  { type: 'custom', label: 'Custom Field' },
];

export const AVAILABLE_CLIENT_COLUMNS: { type: ClientInputColumnType; label: string; unit?: string }[] = [
  { type: 'performed_weight', label: 'Weight Used', unit: 'kg' },
  { type: 'performed_reps', label: 'Reps Performed' },
  { type: 'performed_rir', label: 'Actual RIR' },
  { type: 'performed_rpe', label: 'Actual RPE' },
  { type: 'performed_time', label: 'Time Taken', unit: 'sec' },
  { type: 'performed_distance', label: 'Distance Covered', unit: 'm' },
  { type: 'performed_pace', label: 'Pace' },
  { type: 'performed_hr', label: 'Heart Rate', unit: 'bpm' },
  { type: 'performed_side', label: 'Side (L/R)' },
  { type: 'performed_rounds', label: 'Rounds Completed' },
  { type: 'performed_calories', label: 'Calories' },
  { type: 'client_notes', label: 'Notes' },
];

// ============================================================
// Session Types
// ============================================================

export type SessionType =
  | 'strength'
  | 'cardio'
  | 'hiit'
  | 'mobility'
  | 'recovery'
  | 'sport_specific'
  | 'other';

export type SessionTiming = 'morning' | 'afternoon' | 'evening' | 'anytime';

export const SESSION_TYPES: { value: SessionType; label: string; icon?: string; color?: string }[] = [
  { value: 'strength', label: 'Strength Training', color: 'bg-blue-500' },
  { value: 'cardio', label: 'Cardio', color: 'bg-green-500' },
  { value: 'hiit', label: 'HIIT', color: 'bg-orange-500' },
  { value: 'mobility', label: 'Mobility', color: 'bg-purple-500' },
  { value: 'recovery', label: 'Recovery', color: 'bg-teal-500' },
  { value: 'sport_specific', label: 'Sport-Specific', color: 'bg-red-500' },
  { value: 'other', label: 'Other', color: 'bg-gray-500' },
];

export const SESSION_TIMINGS: { value: SessionTiming; label: string }[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'anytime', label: 'Anytime' },
];

// ============================================================
// Calendar Builder Types
// ============================================================

export interface CalendarWeek {
  weekNumber: number;
  startDate: Date;
  days: CalendarDay[];
}

export interface CalendarDay {
  date: Date;
  dayIndex: number; // 1-7 for Mon-Sun
  sessions: CalendarSession[];
  isRestDay: boolean;
}

export interface CalendarSession {
  id: string;
  title: string;
  sessionType: SessionType;
  sessionTiming: SessionTiming;
  status: 'draft' | 'published';
  moduleCount: number;
  exerciseCount: number;
}

export interface ProgramCalendarState {
  programId: string;
  weeks: CalendarWeek[];
  selectedWeek: number;
  selectedDay: number | null;
  isEditing: boolean;
}

// ============================================================
// Direct Calendar Session Types
// ============================================================

export interface DirectCalendarSession {
  id: string;
  client_user_id: string;
  coach_user_id: string;
  subscription_id: string;
  session_date: string;
  session_type: SessionType;
  session_timing: SessionTiming;
  title: string;
  notes?: string;
  status: 'scheduled' | 'completed' | 'skipped';
  exercises?: DirectSessionExercise[];
  created_at: string;
  updated_at: string;
}

export interface DirectSessionExercise {
  id: string;
  direct_session_id: string;
  exercise_id: string;
  section: 'warmup' | 'main' | 'accessory' | 'cooldown';
  sort_order: number;
  instructions?: string;
  prescription_json: ExercisePrescription;
  column_config: ColumnConfig[];
  exercise?: {
    name: string;
    primary_muscle: string;
    default_video_url?: string;
  };
}

// ============================================================
// Exercise Prescription Types
// ============================================================

export interface ExercisePrescription {
  set_count: number;
  rep_range_min?: number;
  rep_range_max?: number;
  reps?: number;
  weight?: number;
  tempo?: string;
  rir?: number;
  rpe?: number;
  percent_1rm?: number;
  // Rest is a RANGE. `rest_seconds` is the lower bound; `rest_seconds_max` is
  // the upper bound. When `rest_seconds_max` is absent, coaches/clients see a
  // single rest value (backward compat with the old single-field data).
  rest_seconds?: number;
  rest_seconds_max?: number;
  time_seconds?: number;
  distance_meters?: number;
  notes?: string;
  custom_fields?: Record<string, string | number>;
}

export interface SetLog {
  set_index: number;
  performed_reps: number | null;
  performed_load: number | null;
  performed_rir: number | null;
  performed_rpe: number | null;
  performed_time: number | null;
  performed_distance: number | null;
  notes: string;
}

// ============================================================
// Enhanced Exercise Display Types
// ============================================================

export interface EnhancedExerciseDisplay {
  id: string;
  exercise_id: string;
  section: 'warmup' | 'main' | 'accessory' | 'cooldown';
  sort_order: number;
  instructions?: string | null;
  prescription: ExercisePrescription;
  column_config: ColumnConfig[];
  exercise: {
    name: string;
    primary_muscle: string;
    default_video_url?: string;
  };
  last_performance?: {
    date: string;
    performed_reps: number;
    performed_load: number;
    performed_rir?: number;
  };
  personal_best?: {
    date: string;
    max_load: number;
    max_reps_at_weight?: number;
  };
}

// ============================================================
// Team Program Types (for future)
// ============================================================

export interface TeamProgram {
  id: string;
  program_template_id: string;
  team_id: string;
  start_date: string;
  sync_mode: 'synced' | 'individual';
  current_week: number;
  current_day: number;
  members: TeamProgramMember[];
}

export interface TeamProgramMember {
  user_id: string;
  joined_at: string;
  start_position: {
    week: number;
    day: number;
  };
}

// ============================================================
// Utility Types
// ============================================================

export type ExerciseSection = 'warmup' | 'main' | 'accessory' | 'cooldown';

export const EXERCISE_SECTIONS: { value: ExerciseSection; label: string }[] = [
  { value: 'warmup', label: 'Warm-up' },
  { value: 'main', label: 'Main Work' },
  { value: 'accessory', label: 'Accessory' },
  { value: 'cooldown', label: 'Cool-down' },
];

// Helper function to generate unique column ID
export function generateColumnId(): string {
  return `col_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Helper to get column value from prescription
export function getColumnValue(
  prescription: ExercisePrescription,
  columnType: PrescriptionColumnType
): string | number | null {
  switch (columnType) {
    case 'sets':
      return prescription.set_count;
    case 'reps':
      return prescription.reps ?? null;
    case 'rep_range':
      if (prescription.rep_range_min && prescription.rep_range_max) {
        return `${prescription.rep_range_min}-${prescription.rep_range_max}`;
      }
      return prescription.rep_range_min ?? prescription.rep_range_max ?? null;
    case 'weight':
      return prescription.weight ?? null;
    case 'tempo':
      return prescription.tempo ?? null;
    case 'rir':
      return prescription.rir ?? null;
    case 'rpe':
      return prescription.rpe ?? null;
    case 'percent_1rm':
      return prescription.percent_1rm ?? null;
    case 'rest': {
      const lo = prescription.rest_seconds;
      const hi = prescription.rest_seconds_max;
      if (lo != null && hi != null && lo !== hi) return `${lo}-${hi}`;
      return lo ?? hi ?? null;
    }
    case 'time':
      return prescription.time_seconds ?? null;
    case 'distance':
      return prescription.distance_meters ?? null;
    case 'notes':
      return prescription.notes ?? null;
    case 'custom':
      return null;
    default:
      return null;
  }
}

// Helper to set column value in prescription
export function setColumnValue(
  prescription: ExercisePrescription,
  columnType: PrescriptionColumnType,
  value: string | number | null
): ExercisePrescription {
  const updated = { ...prescription };

  switch (columnType) {
    case 'sets':
      updated.set_count = typeof value === 'number' ? value : parseInt(value as string) || 1;
      break;
    case 'reps':
      updated.reps = typeof value === 'number' ? value : parseInt(value as string) || undefined;
      break;
    case 'rep_range':
      if (typeof value === 'string' && value.includes('-')) {
        const [min, max] = value.split('-').map(v => parseInt(v.trim()));
        updated.rep_range_min = min || undefined;
        updated.rep_range_max = max || undefined;
      }
      break;
    case 'weight':
      updated.weight = typeof value === 'number' ? value : parseFloat(value as string) || undefined;
      break;
    case 'tempo':
      updated.tempo = value as string || undefined;
      break;
    case 'rir':
      updated.rir = typeof value === 'number' ? value : parseInt(value as string) || undefined;
      break;
    case 'rpe':
      updated.rpe = typeof value === 'number' ? value : parseFloat(value as string) || undefined;
      break;
    case 'percent_1rm':
      updated.percent_1rm = typeof value === 'number' ? value : parseFloat(value as string) || undefined;
      break;
    case 'rest':
      if (typeof value === 'string' && value.includes('-')) {
        const [lo, hi] = value.split('-').map(v => parseInt(v.trim(), 10));
        updated.rest_seconds = Number.isFinite(lo) ? lo : undefined;
        updated.rest_seconds_max = Number.isFinite(hi) ? hi : undefined;
      } else {
        updated.rest_seconds = typeof value === 'number' ? value : parseInt(value as string) || undefined;
        updated.rest_seconds_max = undefined;
      }
      break;
    case 'time':
      updated.time_seconds = typeof value === 'number' ? value : parseInt(value as string) || undefined;
      break;
    case 'distance':
      updated.distance_meters = typeof value === 'number' ? value : parseFloat(value as string) || undefined;
      break;
    case 'notes':
      updated.notes = value as string || undefined;
      break;
  }

  return updated;
}

// ============================================================
// V2 Per-Set Types
// ============================================================

// Per-set instruction "branch" — an ordered sub-instruction that hangs off a set
// (drop set or rest-pause). Part of the P1 prescription-model schema addendum;
// resolver math lands in P3 (WorkoutSessionV2), builder UI in P4. See
// docs/PROGRAM_SYSTEM_UNIFICATION_BUILD_PLAN.md "Planning Board v2 + prescription model".
export type SetBranch =
  // Drop set: same weight engine as back-off, off the parent set, optional new tempo.
  | { type: 'drop'; basis: 'percent' | 'drop'; value: number; tempo?: string }
  // Rest & Repeat (rest-pause): rest a prescribed time, repeat the same set to failure.
  | { type: 'rest_repeat'; rest_seconds: number; to_failure: true; max_rounds?: number };

export interface SetPrescription {
  set_number: number; // 1-indexed
  reps?: number;
  rep_range_min?: number;
  rep_range_max?: number;
  weight?: number;
  tempo?: string;
  rir?: number;
  rpe?: number;
  percent_1rm?: number;
  rest_seconds?: number;
  rest_seconds_max?: number;
  time_seconds?: number;
  distance_meters?: number;
  // Activity prescription fields (cardio / carry / throw / mobility / hiit).
  // All JSONB-stored alongside the rest of sets_json — no DB column needed.
  pace?: string;       // e.g. "5:30/km"
  target_hr?: number;  // bpm
  side?: string;       // "L" | "R" | "both"
  rounds?: number;     // hiit / circuit rounds
  band_resistance?: string;
  notes?: string;
  custom_fields?: Record<string, string | number>;
  // ── Per-set instruction family (P1 prescription-model schema addendum).
  // Data-shape only: round-tripped verbatim through prescription_json.setsDetail by
  // save_plan_from_builder; the resolver (back-off/drop weight math from the reference
  // or client-logged weight, AMRAP, rest-pause) is P3, the typed "+ Coach instruction"
  // menu is P4. Does NOT belong to the client-inputs system (separate + complete).
  amrap?: boolean;                          // true removes the rep-range target; client logs reps
  weight_mode?: 'absolute' | 'backoff';     // default 'absolute'
  // When weight_mode === 'backoff': this set's weight derives from a reference set.
  backoff?: {
    ref_set_index: number;
    basis: 'percent' | 'drop';
    value: number;
    rounding?: number;                      // kg increment to round to (default 2.5)
  };
  branches?: SetBranch[];                   // ordered drop-set / rest-pause sub-instructions
  note?: string;                            // per-set note (formalized; coexists with `notes`)
}

export interface EnhancedExerciseDisplayV2 extends Omit<EnhancedExerciseDisplay, 'prescription'> {
  prescription: ExercisePrescription; // legacy (backward compat)
  sets: SetPrescription[]; // per-set array
  prescription_columns: ColumnConfig[]; // coach instruction columns
  input_columns: ColumnConfig[]; // client input columns
  linear_progression_enabled?: boolean;
  progression_config?: ProgressionConfig | null;
}

export const DEFAULT_INPUT_COLUMNS: ColumnConfig[] = [
  { id: 'input_weight', type: 'performed_weight', label: 'Weight', visible: true, order: 0, unit: 'kg' },
  { id: 'input_reps', type: 'performed_reps', label: 'Reps', visible: true, order: 1 },
  { id: 'input_rpe', type: 'performed_rpe', label: 'RPE', visible: true, order: 2 },
];

// ============================================================
// Per-category default column sets (activity logging — Option B)
//
// Each entry is a flat ColumnConfig[] mixing prescription columns (coach-side)
// and client-input columns (the inputs the client fills), exactly like strength
// stores `[...prescriptionColumns, ...inputColumns]`. Applied when a non-strength
// slot is converted; fully editable afterwards via the existing column editor.
// ============================================================

const col = (
  id: string,
  type: PrescriptionColumnType | ClientInputColumnType,
  label: string,
  order: number,
  unit?: string,
): ColumnConfig => ({ id, type, label, visible: true, order, ...(unit ? { unit } : {}) });

export const DEFAULT_COLUMNS_BY_CATEGORY: Record<string, ColumnConfig[]> = {
  // Keyed by ActivityType (what conversion branches on) + extra named presets.
  cardio: [
    col('p_distance', 'distance', 'Distance', 0, 'm'),
    col('p_time', 'time', 'Time', 1, 'sec'),
    col('p_pace', 'pace', 'Pace', 2),
    col('p_hr', 'hr', 'Target HR', 3, 'bpm'),
    col('i_distance', 'performed_distance', 'Distance', 0, 'm'),
    col('i_time', 'performed_time', 'Time', 1, 'sec'),
    col('i_pace', 'performed_pace', 'Pace', 2),
    col('i_hr', 'performed_hr', 'Heart Rate', 3, 'bpm'),
  ],
  hiit: [
    col('p_rounds', 'rounds', 'Rounds', 0),
    col('p_time', 'time', 'Work', 1, 'sec'),
    col('p_rest', 'rest', 'Rest', 2, 'sec'),
    col('i_rounds', 'performed_rounds', 'Rounds', 0),
    col('i_time', 'performed_time', 'Time', 1, 'sec'),
  ],
  yoga_mobility: [
    col('p_time', 'time', 'Time', 0, 'sec'),
    col('p_side', 'side', 'Side', 1),
    col('i_time', 'performed_time', 'Time', 0, 'sec'),
    col('i_side', 'performed_side', 'Side', 1),
  ],
  recovery: [
    col('p_time', 'time', 'Time', 0, 'sec'),
    col('i_time', 'performed_time', 'Time', 0, 'sec'),
  ],
  sport_specific: [
    col('p_time', 'time', 'Time', 0, 'sec'),
    col('p_reps', 'rep_range', 'Reps', 1),
    col('i_time', 'performed_time', 'Time', 0, 'sec'),
    col('i_reps', 'performed_reps', 'Reps', 1),
  ],
  // Named presets a coach can pick manually (no dedicated ActivityType).
  carry: [
    col('p_weight', 'weight', 'Load', 0, 'kg'),
    col('p_distance', 'distance', 'Distance', 1, 'm'),
    col('p_time', 'time', 'Time', 2, 'sec'),
    col('i_weight', 'performed_weight', 'Load', 0, 'kg'),
    col('i_distance', 'performed_distance', 'Distance', 1, 'm'),
    col('i_time', 'performed_time', 'Time', 2, 'sec'),
  ],
  throw: [
    col('p_weight', 'weight', 'Load', 0, 'kg'),
    col('p_reps', 'rep_range', 'Reps', 1),
    col('i_weight', 'performed_weight', 'Load', 0, 'kg'),
    col('i_reps', 'performed_reps', 'Reps', 1),
  ],
};

/** Resolve the default column_config for a non-strength slot's activityType. */
export function defaultColumnsForActivityType(activityType?: string | null): ColumnConfig[] {
  if (activityType && DEFAULT_COLUMNS_BY_CATEGORY[activityType]) {
    return DEFAULT_COLUMNS_BY_CATEGORY[activityType];
  }
  return DEFAULT_COLUMNS_BY_CATEGORY.cardio;
}

// ============================================================
// V2 Helper Functions
// ============================================================

const PRESCRIPTION_COLUMN_TYPES: Set<string> = new Set([
  'sets', 'reps', 'rep_range', 'weight', 'tempo', 'rir', 'rpe',
  'percent_1rm', 'rest', 'time', 'distance', 'pace', 'hr', 'side', 'rounds',
  'band_resistance', 'notes', 'custom',
]);

export function splitColumnsByCategory(columns: ColumnConfig[]): {
  prescriptionColumns: ColumnConfig[];
  inputColumns: ColumnConfig[];
} {
  const prescriptionColumns: ColumnConfig[] = [];
  const inputColumns: ColumnConfig[] = [];

  for (const col of columns) {
    if (PRESCRIPTION_COLUMN_TYPES.has(col.type)) {
      prescriptionColumns.push(col);
    } else {
      inputColumns.push(col);
    }
  }

  return { prescriptionColumns, inputColumns };
}

export function legacyPrescriptionToSets(prescription: ExercisePrescription): SetPrescription[] {
  const count = prescription.set_count || 3;
  const sets: SetPrescription[] = [];

  for (let i = 1; i <= count; i++) {
    sets.push({
      set_number: i,
      reps: prescription.reps,
      rep_range_min: prescription.rep_range_min,
      rep_range_max: prescription.rep_range_max,
      weight: prescription.weight,
      tempo: prescription.tempo,
      rir: prescription.rir,
      rpe: prescription.rpe,
      percent_1rm: prescription.percent_1rm,
      rest_seconds: prescription.rest_seconds,
      rest_seconds_max: prescription.rest_seconds_max,
      time_seconds: prescription.time_seconds,
      distance_meters: prescription.distance_meters,
      notes: prescription.notes,
      custom_fields: prescription.custom_fields,
    });
  }

  return sets;
}

export function getSetColumnValue(
  set: SetPrescription,
  columnType: PrescriptionColumnType | ClientInputColumnType
): string | number | null {
  switch (columnType) {
    case 'reps':
      return set.reps ?? null;
    case 'rep_range':
      if (set.rep_range_min && set.rep_range_max) {
        return `${set.rep_range_min}-${set.rep_range_max}`;
      }
      return set.rep_range_min ?? set.rep_range_max ?? null;
    case 'weight':
      return set.weight ?? null;
    case 'tempo':
      return set.tempo ?? null;
    case 'rir':
      return set.rir ?? null;
    case 'rpe':
      return set.rpe ?? null;
    case 'percent_1rm':
      return set.percent_1rm ?? null;
    case 'rest':
      return set.rest_seconds ?? null;
    case 'time':
      return set.time_seconds ?? null;
    case 'distance':
      return set.distance_meters ?? null;
    case 'pace':
      return set.pace ?? null;
    case 'hr':
      return set.target_hr ?? null;
    case 'side':
      return set.side ?? null;
    case 'rounds':
      return set.rounds ?? null;
    case 'band_resistance':
      return set.band_resistance ?? null;
    case 'notes':
      return set.notes ?? null;
    default:
      return null;
  }
}

export function setSetColumnValue(
  set: SetPrescription,
  columnType: PrescriptionColumnType | ClientInputColumnType,
  value: string | number | null
): SetPrescription {
  const updated = { ...set };

  switch (columnType) {
    case 'reps':
      updated.reps = typeof value === 'number' ? value : parseInt(value as string) || undefined;
      break;
    case 'rep_range':
      if (typeof value === 'string' && value.includes('-')) {
        const [min, max] = value.split('-').map(v => parseInt(v.trim()));
        updated.rep_range_min = min || undefined;
        updated.rep_range_max = max || undefined;
      }
      break;
    case 'weight':
      updated.weight = typeof value === 'number' ? value : parseFloat(value as string) || undefined;
      break;
    case 'tempo':
      updated.tempo = value as string || undefined;
      break;
    case 'rir':
      updated.rir = typeof value === 'number' ? value : parseInt(value as string) || undefined;
      break;
    case 'rpe':
      updated.rpe = typeof value === 'number' ? value : parseFloat(value as string) || undefined;
      break;
    case 'percent_1rm':
      updated.percent_1rm = typeof value === 'number' ? value : parseFloat(value as string) || undefined;
      break;
    case 'rest':
      updated.rest_seconds = typeof value === 'number' ? value : parseInt(value as string) || undefined;
      break;
    case 'time':
      updated.time_seconds = typeof value === 'number' ? value : parseInt(value as string) || undefined;
      break;
    case 'distance':
      updated.distance_meters = typeof value === 'number' ? value : parseFloat(value as string) || undefined;
      break;
    case 'pace':
      updated.pace = value as string || undefined;
      break;
    case 'hr':
      updated.target_hr = typeof value === 'number' ? value : parseInt(value as string) || undefined;
      break;
    case 'side':
      updated.side = value as string || undefined;
      break;
    case 'rounds':
      updated.rounds = typeof value === 'number' ? value : parseInt(value as string) || undefined;
      break;
    case 'band_resistance':
      updated.band_resistance = value as string || undefined;
      break;
    case 'notes':
      updated.notes = value as string || undefined;
      break;
  }

  return updated;
}

export function reorderColumns(
  columns: ColumnConfig[],
  fromIndex: number,
  toIndex: number
): ColumnConfig[] {
  const reordered = [...columns];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);
  return reordered.map((col, i) => ({ ...col, order: i }));
}

export function getYouTubeThumbnailUrl(videoUrl: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = videoUrl.match(pattern);
    if (match?.[1]) {
      return `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg`;
    }
  }

  return null;
}

// ============================================================
// Linear Progression Types
// ============================================================

export interface ProgressionConfig {
  load_increment_kg: number;
  load_increment_lb: number;
  unit: 'kg' | 'lb';
  rir_threshold: number;
  rep_range_check: boolean;
  suggestion_style: 'gentle' | 'direct' | 'data_only';
}

export const DEFAULT_PROGRESSION_CONFIG: ProgressionConfig = {
  load_increment_kg: 2.5,
  load_increment_lb: 5,
  unit: 'kg',
  rir_threshold: 2,
  rep_range_check: true,
  suggestion_style: 'gentle',
};

export type SuggestionType =
  | 'increase_load'
  | 'hold_steady'
  | 'reduce_load'
  | 'increase_reps'
  | 'none';

export interface ProgressionSuggestion {
  id: string;
  client_id: string;
  client_module_exercise_id: string;
  exercise_library_id: string;
  session_date: string;
  set_number: number;
  prescribed_weight: number | null;
  prescribed_rep_min: number | null;
  prescribed_rep_max: number | null;
  prescribed_rir: number | null;
  performed_weight: number | null;
  performed_reps: number | null;
  performed_rir: number | null;
  performed_rpe: number | null;
  suggestion_type: SuggestionType;
  suggestion_text: string;
  suggested_increment: number | null;
  client_response: 'accepted' | 'dismissed' | 'ignored' | null;
  client_response_at: string | null;
  created_at: string;
}
