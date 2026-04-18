import { useReducer, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { withTimeout } from "@/lib/withTimeout";
import type { MusclePlanState, MuscleSlotData, SlotExercise, ActivityType, WeekData } from "@/types/muscle-builder";
import { ACTIVITY_MAP } from "@/types/muscle-builder";
import type { SetPrescription } from "@/types/workout-builder";

const DEFAULT_GLOBAL_CLIENT_INPUTS = ['performed_weight', 'performed_reps', 'performed_rpe'];
const DEFAULT_GLOBAL_PRESCRIPTION_COLUMNS = ['rep_range', 'tempo', 'rir', 'rpe', 'rest'];

// ============================================================
// Actions
// ============================================================

type Action =
  | { type: 'LOAD_TEMPLATE'; payload: { name: string; description: string; weeks: WeekData[]; templateId: string; globalClientInputs?: string[]; globalPrescriptionColumns?: string[] } }
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_DESCRIPTION'; description: string }
  | { type: 'SELECT_DAY'; dayIndex: number }
  | { type: 'SELECT_WEEK'; weekIndex: number }
  | { type: 'ADD_WEEK' }
  | { type: 'REMOVE_WEEK'; weekIndex: number }
  | { type: 'DUPLICATE_WEEK'; weekIndex: number }
  | { type: 'SET_WEEK_LABEL'; weekIndex: number; label: string }
  | { type: 'TOGGLE_DELOAD'; weekIndex: number }
  | { type: 'APPLY_SLOT_TO_REMAINING'; slotId: string; fields: Partial<MuscleSlotData> }
  | { type: 'ADD_MUSCLE'; dayIndex: number; muscleId: string; sets?: number }
  | { type: 'REMOVE_MUSCLE'; slotId: string }
  | { type: 'SET_SETS'; slotId: string; sets: number }
  | { type: 'SET_REPS'; slotId: string; repMin: number; repMax: number }
  | { type: 'SET_SLOT_DETAILS'; slotId: string; sets?: number; repMin?: number; repMax?: number; tempo?: string | undefined; rir?: number | undefined; rpe?: number | undefined }
  | { type: 'SET_ALL_SETS_FOR_MUSCLE'; muscleId: string; sets: number }
  | { type: 'REORDER'; dayIndex: number; fromIndex: number; toIndex: number }
  | { type: 'MOVE_MUSCLE'; slotId: string; toDay: number; toIndex: number }
  | { type: 'PASTE_DAY'; fromDayIndex: number; toDayIndex: number }
  | { type: 'LOAD_PRESET'; slots: MuscleSlotData[]; name?: string }
  | { type: 'CLEAR_ALL' }
  | { type: 'MARK_SAVED'; templateId: string }
  | { type: 'SAVING' }
  | { type: 'SAVE_ERROR' }
  | { type: 'SET_EXERCISE'; slotId: string; exercise: SlotExercise }
  | { type: 'CLEAR_EXERCISE'; slotId: string }
  | { type: 'ADD_REPLACEMENT'; slotId: string; exercise: SlotExercise }
  | { type: 'REMOVE_REPLACEMENT'; slotId: string; replacementIndex: number }
  | { type: 'TOGGLE_PER_SET'; slotId: string }
  | { type: 'UPDATE_SET_DETAIL'; slotId: string; setIndex: number; field: keyof SetPrescription; value: number | string | undefined }
  | { type: 'SET_SLOT_COLUMNS'; slotId: string; columns: string[] }
  | { type: 'SET_EXERCISE_INSTRUCTIONS'; slotId: string; instructions: string }
  | { type: 'SET_GLOBAL_CLIENT_INPUTS'; columns: string[] }
  | { type: 'SET_SLOT_CLIENT_INPUTS'; slotId: string; columns: string[] | undefined }
  | { type: 'ADD_ACTIVITY'; dayIndex: number; activityId: string; activityType: ActivityType }
  | { type: 'SET_ACTIVITY_DETAILS'; slotId: string; details: Partial<Pick<MuscleSlotData, 'duration' | 'distance' | 'targetHrZone' | 'pace' | 'rounds' | 'workSeconds' | 'restSeconds' | 'difficulty' | 'activityNotes'>> }
  | { type: 'UNDO' }
  | { type: 'REDO' };

// ============================================================
// Helpers
// ============================================================

const EMPTY_WEEK: WeekData = { slots: [] };

const initialState: MusclePlanState = {
  templateId: null,
  name: 'Untitled Muscle Plan',
  description: '',
  weeks: [{ ...EMPTY_WEEK }],
  currentWeekIndex: 0,
  selectedDayIndex: 1,
  isDirty: false,
  isSaving: false,
  globalClientInputs: DEFAULT_GLOBAL_CLIENT_INPUTS,
  globalPrescriptionColumns: DEFAULT_GLOBAL_PRESCRIPTION_COLUMNS,
};

function getCurrentSlots(state: MusclePlanState): MuscleSlotData[] {
  return state.weeks[state.currentWeekIndex]?.slots ?? [];
}

function withUpdatedCurrentWeek(state: MusclePlanState, updater: (slots: MuscleSlotData[]) => MuscleSlotData[]): MusclePlanState {
  const weeks = state.weeks.map((w, i) =>
    i === state.currentWeekIndex ? { ...w, slots: updater(w.slots) } : w
  );
  return { ...state, weeks, isDirty: true };
}

function getMaxSortOrder(slots: MuscleSlotData[], dayIndex: number): number {
  const daySlots = slots.filter(s => s.dayIndex === dayIndex);
  if (daySlots.length === 0) return -1;
  return Math.max(...daySlots.map(s => s.sortOrder));
}

function createSetsDetailFromFlat(slot: MuscleSlotData): SetPrescription[] {
  return Array.from({ length: slot.sets }, (_, i) => ({
    set_number: i + 1,
    rep_range_min: slot.repMin ?? 8,
    rep_range_max: slot.repMax ?? 12,
    ...(slot.tempo ? { tempo: slot.tempo } : {}),
    ...(slot.rir != null ? { rir: slot.rir } : {}),
    ...(slot.rpe != null ? { rpe: slot.rpe } : {}),
    rest_seconds: 90,
  }));
}

function syncSetsDetailLength(setsDetail: SetPrescription[], newCount: number): SetPrescription[] {
  if (setsDetail.length === newCount) return setsDetail;
  if (newCount < setsDetail.length) return setsDetail.slice(0, newCount);
  const lastRow = setsDetail[setsDetail.length - 1] || { set_number: 0, rest_seconds: 90 };
  const newRows: SetPrescription[] = [];
  for (let i = setsDetail.length; i < newCount; i++) {
    newRows.push({ ...lastRow, set_number: i + 1 });
  }
  return [...setsDetail, ...newRows];
}

function hydrateSlotIds(slots: MuscleSlotData[]): MuscleSlotData[] {
  return slots.map(s => ({
    ...s,
    id: s.id || crypto.randomUUID(),
    repMin: s.repMin ?? 8,
    repMax: s.repMax ?? 12,
  }));
}

function deepCloneWeek(week: WeekData): WeekData {
  return {
    ...week,
    slots: week.slots.map(s => ({
      ...s,
      id: crypto.randomUUID(),
      exercise: s.exercise ? { ...s.exercise } : undefined,
      replacements: s.replacements ? s.replacements.map(r => ({ ...r })) : undefined,
      setsDetail: s.setsDetail ? s.setsDetail.map(sd => ({ ...sd })) : undefined,
    })),
  };
}

// ============================================================
// Reducer
// ============================================================

function reducer(state: MusclePlanState, action: Action): MusclePlanState {
  const slots = getCurrentSlots(state);

  switch (action.type) {
    case 'LOAD_TEMPLATE':
      return {
        ...state,
        templateId: action.payload.templateId,
        name: action.payload.name,
        description: action.payload.description,
        weeks: action.payload.weeks.map(w => ({ ...w, slots: hydrateSlotIds(w.slots) })),
        currentWeekIndex: 0,
        globalClientInputs: action.payload.globalClientInputs || DEFAULT_GLOBAL_CLIENT_INPUTS,
        globalPrescriptionColumns: action.payload.globalPrescriptionColumns || DEFAULT_GLOBAL_PRESCRIPTION_COLUMNS,
        isDirty: false,
        isSaving: false,
      };

    case 'SET_NAME':
      return { ...state, name: action.name, isDirty: true };

    case 'SET_DESCRIPTION':
      return { ...state, description: action.description, isDirty: true };

    case 'SELECT_DAY':
      return { ...state, selectedDayIndex: action.dayIndex };

    case 'SELECT_WEEK':
      return { ...state, currentWeekIndex: Math.min(action.weekIndex, state.weeks.length - 1) };

    // ---- Week management ----

    case 'ADD_WEEK': {
      const lastWeek = state.weeks[state.weeks.length - 1] || EMPTY_WEEK;
      const newWeek = deepCloneWeek(lastWeek);
      return { ...state, weeks: [...state.weeks, newWeek], currentWeekIndex: state.weeks.length, isDirty: true };
    }

    case 'REMOVE_WEEK': {
      if (state.weeks.length <= 1) return state;
      const weeks = state.weeks.filter((_, i) => i !== action.weekIndex);
      const newIndex = Math.min(state.currentWeekIndex, weeks.length - 1);
      return { ...state, weeks, currentWeekIndex: newIndex, isDirty: true };
    }

    case 'DUPLICATE_WEEK': {
      const source = state.weeks[action.weekIndex];
      if (!source) return state;
      const cloned = deepCloneWeek(source);
      const weeks = [...state.weeks];
      weeks.splice(action.weekIndex + 1, 0, cloned);
      return { ...state, weeks, currentWeekIndex: action.weekIndex + 1, isDirty: true };
    }

    case 'SET_WEEK_LABEL': {
      const weeks = state.weeks.map((w, i) =>
        i === action.weekIndex ? { ...w, label: action.label || undefined } : w
      );
      return { ...state, weeks, isDirty: true };
    }

    case 'TOGGLE_DELOAD': {
      const week = state.weeks[action.weekIndex];
      if (!week) return state;
      const wasDeload = week.isDeload;
      const updatedSlots = wasDeload
        ? week.slots // turning OFF: slots stay as-is, coach uses undo if needed
        : week.slots.map(s => ({
            ...s,
            sets: Math.max(1, Math.ceil(s.sets * 0.6)),
            setsDetail: s.setsDetail
              ? s.setsDetail.slice(0, Math.max(1, Math.ceil(s.sets * 0.6)))
              : undefined,
          }));
      const weeks = state.weeks.map((w, i) =>
        i === action.weekIndex
          ? { ...w, isDeload: !wasDeload, label: !wasDeload ? (w.label || 'Deload') : w.label, slots: updatedSlots }
          : w
      );
      return { ...state, weeks, isDirty: true };
    }

    case 'APPLY_SLOT_TO_REMAINING': {
      const sourceSlot = slots.find(s => s.id === action.slotId);
      if (!sourceSlot) return state;
      const { dayIndex, sortOrder } = sourceSlot;
      const weeks = state.weeks.map((w, wi) => {
        if (wi <= state.currentWeekIndex) return w;
        const updatedSlots = w.slots.map(s => {
          if (s.dayIndex !== dayIndex || s.sortOrder !== sortOrder) return s;
          const merged = { ...s, ...action.fields };
          if (action.fields.exercise) {
            merged.exercise = { ...action.fields.exercise };
          }
          return merged;
        });
        return { ...w, slots: updatedSlots };
      });
      return { ...state, weeks, isDirty: true };
    }

    // ---- Slot operations (scoped to current week) ----

    case 'ADD_MUSCLE': {
      const newSlot: MuscleSlotData = {
        id: crypto.randomUUID(),
        dayIndex: action.dayIndex,
        muscleId: action.muscleId,
        sets: action.sets ?? 3,
        repMin: 8,
        repMax: 12,
        sortOrder: getMaxSortOrder(slots, action.dayIndex) + 1,
      };
      return withUpdatedCurrentWeek(state, s => [...s, newSlot]);
    }

    case 'REMOVE_MUSCLE':
      return withUpdatedCurrentWeek(state, s => s.filter(sl => sl.id !== action.slotId));

    case 'SET_SETS':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => sl.id === action.slotId ? { ...sl, sets: Math.max(1, Math.min(20, action.sets)) } : sl)
      );

    case 'SET_REPS':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => sl.id === action.slotId
          ? { ...sl, repMin: Math.max(1, Math.min(100, action.repMin)), repMax: Math.max(1, Math.min(100, action.repMax)) }
          : sl)
      );

    case 'SET_SLOT_DETAILS':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => {
          if (sl.id !== action.slotId) return sl;
          const updated = {
            ...sl,
            ...(action.sets != null && { sets: Math.max(1, Math.min(20, action.sets)) }),
            ...(action.repMin != null && { repMin: Math.max(1, Math.min(100, action.repMin)) }),
            ...(action.repMax != null && { repMax: Math.max(1, Math.min(100, action.repMax)) }),
            ...(action.tempo !== undefined && { tempo: action.tempo || undefined }),
            ...(action.rir !== undefined && { rir: action.rir }),
            ...(action.rpe !== undefined && { rpe: action.rpe }),
          };
          if (action.sets != null && updated.setsDetail) {
            updated.setsDetail = syncSetsDetailLength(updated.setsDetail, updated.sets);
          }
          return updated;
        })
      );

    case 'REORDER': {
      const daySlots = slots
        .filter(s => s.dayIndex === action.dayIndex)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const otherSlots = slots.filter(s => s.dayIndex !== action.dayIndex);
      const [moved] = daySlots.splice(action.fromIndex, 1);
      daySlots.splice(action.toIndex, 0, moved);
      const reordered = daySlots.map((s, i) => ({ ...s, sortOrder: i }));
      return withUpdatedCurrentWeek(state, () => [...otherSlots, ...reordered]);
    }

    case 'MOVE_MUSCLE': {
      const slot = slots.find(s => s.id === action.slotId);
      if (!slot) return state;
      const withoutMoved = slots.filter(s => s.id !== action.slotId);
      const targetSlots = withoutMoved
        .filter(s => s.dayIndex === action.toDay)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const movedSlot: MuscleSlotData = { ...slot, dayIndex: action.toDay, sortOrder: action.toIndex };
      targetSlots.splice(action.toIndex, 0, movedSlot);
      const reorderedTarget = targetSlots.map((s, i) => ({ ...s, sortOrder: i }));
      const otherSlots = withoutMoved.filter(s => s.dayIndex !== action.toDay);
      return withUpdatedCurrentWeek(state, () => [...otherSlots, ...reorderedTarget]);
    }

    case 'SET_ALL_SETS_FOR_MUSCLE':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => sl.muscleId === action.muscleId ? { ...sl, sets: Math.max(1, Math.min(20, action.sets)) } : sl)
      );

    case 'PASTE_DAY': {
      const sourceSlots = slots
        .filter(s => s.dayIndex === action.fromDayIndex)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      if (sourceSlots.length === 0) return state;
      const maxOrder = getMaxSortOrder(slots, action.toDayIndex);
      const newSlots = sourceSlots.map((s, i) => ({
        ...s,
        id: crypto.randomUUID(),
        dayIndex: action.toDayIndex,
        sortOrder: maxOrder + 1 + i,
      }));
      return withUpdatedCurrentWeek(state, s => [...s, ...newSlots]);
    }

    case 'LOAD_PRESET':
      return {
        ...state,
        weeks: [{ slots: hydrateSlotIds(action.slots) }],
        currentWeekIndex: 0,
        name: action.name ?? state.name,
        isDirty: true,
      };

    case 'CLEAR_ALL':
      return { ...state, weeks: [{ slots: [] }], currentWeekIndex: 0, isDirty: true };

    case 'SET_EXERCISE':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => sl.id === action.slotId ? { ...sl, exercise: action.exercise } : sl)
      );

    case 'CLEAR_EXERCISE':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => sl.id === action.slotId ? { ...sl, exercise: undefined } : sl)
      );

    case 'ADD_REPLACEMENT':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => sl.id === action.slotId
          ? { ...sl, replacements: [...(sl.replacements || []), action.exercise] }
          : sl)
      );

    case 'REMOVE_REPLACEMENT':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => {
          if (sl.id !== action.slotId || !sl.replacements) return sl;
          const updated = sl.replacements.filter((_, i) => i !== action.replacementIndex);
          return { ...sl, replacements: updated.length > 0 ? updated : undefined };
        })
      );

    case 'TOGGLE_PER_SET':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => {
          if (sl.id !== action.slotId) return sl;
          if (sl.setsDetail) {
            const first = sl.setsDetail[0];
            return {
              ...sl,
              setsDetail: undefined,
              ...(first?.rep_range_min != null && { repMin: first.rep_range_min }),
              ...(first?.rep_range_max != null && { repMax: first.rep_range_max }),
              ...(first?.tempo !== undefined && { tempo: first.tempo }),
              ...(first?.rir !== undefined && { rir: first.rir }),
              ...(first?.rpe !== undefined && { rpe: first.rpe }),
            };
          }
          return { ...sl, setsDetail: createSetsDetailFromFlat(sl) };
        })
      );

    case 'UPDATE_SET_DETAIL':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => {
          if (sl.id !== action.slotId || !sl.setsDetail) return sl;
          const updated = sl.setsDetail.map((set, i) =>
            i === action.setIndex ? { ...set, [action.field]: action.value } : set
          );
          return { ...sl, setsDetail: updated };
        })
      );

    case 'SET_SLOT_COLUMNS':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => sl.id === action.slotId ? { ...sl, prescriptionColumns: action.columns } : sl)
      );

    case 'SET_EXERCISE_INSTRUCTIONS':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => {
          if (sl.id !== action.slotId || !sl.exercise) return sl;
          return { ...sl, exercise: { ...sl.exercise, instructions: action.instructions || undefined } };
        })
      );

    case 'SET_GLOBAL_CLIENT_INPUTS':
      return { ...state, globalClientInputs: action.columns, isDirty: true };

    case 'SET_SLOT_CLIENT_INPUTS':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => sl.id === action.slotId ? { ...sl, clientInputColumns: action.columns } : sl)
      );

    case 'ADD_ACTIVITY': {
      const activity = ACTIVITY_MAP.get(action.activityId);
      const newSlot: MuscleSlotData = {
        id: crypto.randomUUID(),
        dayIndex: action.dayIndex,
        muscleId: '',
        sets: 1,
        repMin: 0,
        repMax: 0,
        sortOrder: getMaxSortOrder(slots, action.dayIndex) + 1,
        activityType: action.activityType,
        activityId: action.activityId,
        activityName: activity?.label || action.activityId,
        duration: 30,
      };
      return withUpdatedCurrentWeek(state, s => [...s, newSlot]);
    }

    case 'SET_ACTIVITY_DETAILS':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => sl.id === action.slotId ? { ...sl, ...action.details } : sl)
      );

    case 'MARK_SAVED':
      // Clear isDirty so auto-save doesn't immediately refire. If the user edits
      // mid-save, the next SET_* action flips isDirty back to true and auto-save
      // picks it up after the 2s debounce.
      return { ...state, templateId: action.templateId, isDirty: false, isSaving: false };

    case 'SAVING':
      return { ...state, isSaving: true };

    case 'SAVE_ERROR':
      return { ...state, isSaving: false };

    default:
      return state;
  }
}

// ============================================================
// Undo/Redo wrapper
// ============================================================

const MAX_HISTORY = 50;

const NON_UNDOABLE: Set<string> = new Set([
  'SELECT_DAY', 'SELECT_WEEK', 'SAVING', 'MARK_SAVED', 'SAVE_ERROR', 'LOAD_TEMPLATE', 'UNDO', 'REDO',
]);

interface UndoableState {
  current: MusclePlanState;
  past: MusclePlanState[];
  future: MusclePlanState[];
}

function undoableReducer(state: UndoableState, action: Action): UndoableState {
  if (action.type === 'UNDO') {
    if (state.past.length === 0) return state;
    const previous = state.past[state.past.length - 1];
    return {
      past: state.past.slice(0, -1),
      current: { ...previous, isSaving: state.current.isSaving, templateId: state.current.templateId },
      future: [state.current, ...state.future].slice(0, MAX_HISTORY),
    };
  }

  if (action.type === 'REDO') {
    if (state.future.length === 0) return state;
    const next = state.future[0];
    return {
      past: [...state.past, state.current].slice(-MAX_HISTORY),
      current: { ...next, isSaving: state.current.isSaving, templateId: state.current.templateId },
      future: state.future.slice(1),
    };
  }

  const newCurrent = reducer(state.current, action);

  if (NON_UNDOABLE.has(action.type) || newCurrent === state.current) {
    return { ...state, current: newCurrent };
  }

  return {
    past: [...state.past, state.current].slice(-MAX_HISTORY),
    current: newCurrent,
    future: [],
  };
}

// ============================================================
// Hook
// ============================================================

function buildSlotConfig(state: MusclePlanState): Record<string, unknown> {
  return {
    weeks: state.weeks,
    globalClientInputs: state.globalClientInputs,
    globalPrescriptionColumns: state.globalPrescriptionColumns,
  } as unknown as Record<string, unknown>;
}

export function useMuscleBuilderState(coachUserId: string, existingTemplateId?: string) {
  const [{ current: state, past, future }, dispatch] = useReducer(undoableReducer, {
    current: initialState,
    past: [],
    future: [],
  });
  const { toast } = useToast();
  const hasFetched = useRef(false);

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  // Load existing template
  useEffect(() => {
    if (!existingTemplateId || hasFetched.current) return;
    hasFetched.current = true;

    (async () => {
      const { data, error } = await supabase
        .from('muscle_program_templates')
        .select('*')
        .eq('id', existingTemplateId)
        .single();

      if (error) {
        toast({ title: 'Error loading template', description: sanitizeErrorForUser(error), variant: 'destructive' });
        return;
      }

      // slot_config formats: array (v1), { slots } (v2), { weeks } (v3)
      const raw = data.slot_config as unknown;
      let weeks: WeekData[] = [{ slots: [] }];
      let globalClientInputs: string[] | undefined;
      let globalPrescriptionColumns: string[] | undefined;

      if (Array.isArray(raw)) {
        // v1: bare array of slots
        weeks = [{ slots: raw as MuscleSlotData[] }];
      } else if (raw && typeof raw === 'object') {
        const obj = raw as Record<string, unknown>;
        if ('weeks' in obj && Array.isArray(obj.weeks)) {
          // v3: multi-week format
          weeks = (obj.weeks as WeekData[]).map(w => ({
            slots: w.slots || [],
            label: w.label,
            isDeload: w.isDeload,
          }));
        } else if ('slots' in obj) {
          // v2: single-week object format
          weeks = [{ slots: (obj.slots as MuscleSlotData[]) || [] }];
        }
        globalClientInputs = obj.globalClientInputs as string[] | undefined;
        globalPrescriptionColumns = obj.globalPrescriptionColumns as string[] | undefined;
      }

      dispatch({
        type: 'LOAD_TEMPLATE',
        payload: {
          templateId: data.id,
          name: data.name,
          description: data.description || '',
          weeks,
          globalClientInputs,
          globalPrescriptionColumns,
        },
      });
    })();
  }, [existingTemplateId, toast]);

  // Auto-save: debounce 2s after changes when template already exists
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!state.isDirty || !state.templateId || state.isSaving) return;

    autoSaveTimerRef.current = setTimeout(async () => {
      const s = stateRef.current;
      if (!s.isDirty || !s.templateId || s.isSaving) return;

      dispatch({ type: 'SAVING' });
      try {
        const { error } = await withTimeout(
          supabase
            .from('muscle_program_templates')
            .update({
              name: s.name,
              description: s.description || null,
              slot_config: buildSlotConfig(s),
              updated_at: new Date().toISOString(),
            })
            .eq('id', s.templateId),
          15000,
          'Auto-save muscle plan',
        );
        if (error) throw error;
        dispatch({ type: 'MARK_SAVED', templateId: s.templateId! });
      } catch {
        dispatch({ type: 'SAVE_ERROR' });
      }
    }, 2000);

    return () => clearTimeout(autoSaveTimerRef.current);
  }, [state.isDirty, state.templateId, state.isSaving, state.weeks, state.name, state.description]);

  // Save
  const save = useCallback(async () => {
    clearTimeout(autoSaveTimerRef.current);
    dispatch({ type: 'SAVING' });

    try {
      if (state.templateId) {
        const { error } = await withTimeout(
          supabase
            .from('muscle_program_templates')
            .update({
              name: state.name,
              description: state.description || null,
              slot_config: buildSlotConfig(state),
              updated_at: new Date().toISOString(),
            })
            .eq('id', state.templateId),
          15000,
          'Save muscle plan',
        );

        if (error) throw error;
        dispatch({ type: 'MARK_SAVED', templateId: state.templateId });
      } else {
        const { data, error } = await withTimeout(
          supabase
            .from('muscle_program_templates')
            .insert({
              coach_id: coachUserId,
              name: state.name,
              description: state.description || null,
              slot_config: buildSlotConfig(state),
            })
            .select('id')
            .single(),
          15000,
          'Save muscle plan',
        );

        if (error) throw error;
        dispatch({ type: 'MARK_SAVED', templateId: data.id });
      }

      toast({ title: 'Muscle plan saved' });
    } catch (error: unknown) {
      dispatch({ type: 'SAVE_ERROR' });
      toast({ title: 'Error saving', description: sanitizeErrorForUser(error), variant: 'destructive' });
    }
  }, [state.templateId, state.name, state.description, state.weeks, coachUserId, toast]);

  // Save as preset
  const saveAsPreset = useCallback(async () => {
    dispatch({ type: 'SAVING' });
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('muscle_program_templates')
          .insert({
            coach_id: coachUserId,
            name: state.name,
            description: state.description || null,
            slot_config: buildSlotConfig(state),
            is_preset: true,
          })
          .select('id')
          .single(),
        15000,
        'Save preset',
      );

      if (error) throw error;
      dispatch({ type: 'SAVE_ERROR' }); // just stop isSaving — don't change templateId
      toast({ title: 'Saved as preset' });
      return data.id;
    } catch (error: unknown) {
      dispatch({ type: 'SAVE_ERROR' });
      toast({ title: 'Error saving preset', description: sanitizeErrorForUser(error), variant: 'destructive' });
      return null;
    }
  }, [coachUserId, state.name, state.description, state.weeks, toast]);

  return { state, dispatch, save, saveAsPreset, canUndo, canRedo };
}

export { getCurrentSlots };
