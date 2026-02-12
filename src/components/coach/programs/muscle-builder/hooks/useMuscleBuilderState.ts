import { useReducer, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { withTimeout } from "@/lib/withTimeout";
import type { MusclePlanState, MuscleSlotData } from "@/types/muscle-builder";

// ============================================================
// Actions
// ============================================================

type Action =
  | { type: 'LOAD_TEMPLATE'; payload: { name: string; description: string; slots: MuscleSlotData[]; templateId: string } }
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_DESCRIPTION'; description: string }
  | { type: 'SELECT_DAY'; dayIndex: number }
  | { type: 'ADD_MUSCLE'; dayIndex: number; muscleId: string; sets?: number }
  | { type: 'REMOVE_MUSCLE'; slotId: string }
  | { type: 'SET_SETS'; slotId: string; sets: number }
  | { type: 'SET_ALL_SETS_FOR_MUSCLE'; muscleId: string; sets: number }
  | { type: 'REORDER'; dayIndex: number; fromIndex: number; toIndex: number }
  | { type: 'MOVE_MUSCLE'; slotId: string; toDay: number; toIndex: number }
  | { type: 'PASTE_DAY'; fromDayIndex: number; toDayIndex: number }
  | { type: 'LOAD_PRESET'; slots: MuscleSlotData[]; name?: string }
  | { type: 'CLEAR_ALL' }
  | { type: 'MARK_SAVED'; templateId: string }
  | { type: 'SAVING' }
  | { type: 'SAVE_ERROR' };

// ============================================================
// Reducer
// ============================================================

const initialState: MusclePlanState = {
  templateId: null,
  name: 'Untitled Muscle Plan',
  description: '',
  slots: [],
  selectedDayIndex: 1,
  isDirty: false,
  isSaving: false,
};

function getMaxSortOrder(slots: MuscleSlotData[], dayIndex: number): number {
  const daySlots = slots.filter(s => s.dayIndex === dayIndex);
  if (daySlots.length === 0) return -1;
  return Math.max(...daySlots.map(s => s.sortOrder));
}

/** Ensure every slot has a unique id (backward compat for saved data without ids) */
function hydrateSlotIds(slots: MuscleSlotData[]): MuscleSlotData[] {
  return slots.map(s => (s.id ? s : { ...s, id: crypto.randomUUID() }));
}

function reducer(state: MusclePlanState, action: Action): MusclePlanState {
  switch (action.type) {
    case 'LOAD_TEMPLATE':
      return {
        ...state,
        templateId: action.payload.templateId,
        name: action.payload.name,
        description: action.payload.description,
        slots: hydrateSlotIds(action.payload.slots),
        isDirty: false,
        isSaving: false,
      };

    case 'SET_NAME':
      return { ...state, name: action.name, isDirty: true };

    case 'SET_DESCRIPTION':
      return { ...state, description: action.description, isDirty: true };

    case 'SELECT_DAY':
      return { ...state, selectedDayIndex: action.dayIndex };

    case 'ADD_MUSCLE': {
      const newSlot: MuscleSlotData = {
        id: crypto.randomUUID(),
        dayIndex: action.dayIndex,
        muscleId: action.muscleId,
        sets: action.sets ?? 3,
        sortOrder: getMaxSortOrder(state.slots, action.dayIndex) + 1,
      };
      return { ...state, slots: [...state.slots, newSlot], isDirty: true };
    }

    case 'REMOVE_MUSCLE':
      return {
        ...state,
        slots: state.slots.filter(s => s.id !== action.slotId),
        isDirty: true,
      };

    case 'SET_SETS':
      return {
        ...state,
        slots: state.slots.map(s =>
          s.id === action.slotId
            ? { ...s, sets: Math.max(1, Math.min(20, action.sets)) }
            : s
        ),
        isDirty: true,
      };

    case 'REORDER': {
      const daySlots = state.slots
        .filter(s => s.dayIndex === action.dayIndex)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const otherSlots = state.slots.filter(s => s.dayIndex !== action.dayIndex);

      const [moved] = daySlots.splice(action.fromIndex, 1);
      daySlots.splice(action.toIndex, 0, moved);

      const reordered = daySlots.map((s, i) => ({ ...s, sortOrder: i }));
      return { ...state, slots: [...otherSlots, ...reordered], isDirty: true };
    }

    case 'MOVE_MUSCLE': {
      const slot = state.slots.find(s => s.id === action.slotId);
      if (!slot) return state;

      const withoutMoved = state.slots.filter(s => s.id !== action.slotId);

      // Get target day slots sorted
      const targetSlots = withoutMoved
        .filter(s => s.dayIndex === action.toDay)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      const movedSlot: MuscleSlotData = {
        ...slot,
        dayIndex: action.toDay,
        sortOrder: action.toIndex,
      };

      targetSlots.splice(action.toIndex, 0, movedSlot);
      const reorderedTarget = targetSlots.map((s, i) => ({ ...s, sortOrder: i }));

      const otherSlots = withoutMoved.filter(s => s.dayIndex !== action.toDay);
      return { ...state, slots: [...otherSlots, ...reorderedTarget], isDirty: true };
    }

    case 'SET_ALL_SETS_FOR_MUSCLE':
      return {
        ...state,
        slots: state.slots.map(s =>
          s.muscleId === action.muscleId
            ? { ...s, sets: Math.max(1, Math.min(20, action.sets)) }
            : s
        ),
        isDirty: true,
      };

    case 'PASTE_DAY': {
      const sourceSlots = state.slots
        .filter(s => s.dayIndex === action.fromDayIndex)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      if (sourceSlots.length === 0) return state;
      const maxOrder = getMaxSortOrder(state.slots, action.toDayIndex);
      const newSlots = sourceSlots.map((s, i) => ({
        ...s,
        id: crypto.randomUUID(),
        dayIndex: action.toDayIndex,
        sortOrder: maxOrder + 1 + i,
      }));
      return { ...state, slots: [...state.slots, ...newSlots], isDirty: true };
    }

    case 'LOAD_PRESET':
      return {
        ...state,
        slots: hydrateSlotIds(action.slots),
        name: action.name ?? state.name,
        isDirty: true,
      };

    case 'CLEAR_ALL':
      return { ...state, slots: [], isDirty: true };

    case 'MARK_SAVED':
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
// Hook
// ============================================================

export function useMuscleBuilderState(coachUserId: string, existingTemplateId?: string) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { toast } = useToast();
  const hasFetched = useRef(false);

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

      dispatch({
        type: 'LOAD_TEMPLATE',
        payload: {
          templateId: data.id,
          name: data.name,
          description: data.description || '',
          slots: (data.slot_config as MuscleSlotData[]) || [],
        },
      });
    })();
  }, [existingTemplateId, toast]);

  // Save
  const save = useCallback(async () => {
    dispatch({ type: 'SAVING' });

    try {
      if (state.templateId) {
        const { error } = await withTimeout(
          supabase
            .from('muscle_program_templates')
            .update({
              name: state.name,
              description: state.description || null,
              slot_config: state.slots as unknown as Record<string, unknown>,
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
              slot_config: state.slots as unknown as Record<string, unknown>,
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
    } catch (error: any) {
      dispatch({ type: 'SAVE_ERROR' });
      toast({ title: 'Error saving', description: sanitizeErrorForUser(error), variant: 'destructive' });
    }
  }, [state.templateId, state.name, state.description, state.slots, coachUserId, toast]);

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
            slot_config: state.slots as unknown as Record<string, unknown>,
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
    } catch (error: any) {
      dispatch({ type: 'SAVE_ERROR' });
      toast({ title: 'Error saving preset', description: sanitizeErrorForUser(error), variant: 'destructive' });
      return null;
    }
  }, [coachUserId, state.name, state.description, state.slots, toast]);

  return { state, dispatch, save, saveAsPreset };
}
