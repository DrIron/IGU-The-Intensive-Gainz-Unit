import { useReducer, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import type { MusclePlanState, MuscleSlotData } from "@/types/muscle-builder";

// ============================================================
// Actions
// ============================================================

type Action =
  | { type: 'LOAD_TEMPLATE'; payload: { name: string; description: string; slots: MuscleSlotData[]; templateId: string } }
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_DESCRIPTION'; description: string }
  | { type: 'SELECT_DAY'; dayIndex: number }
  | { type: 'ADD_MUSCLE'; dayIndex: number; muscleId: string }
  | { type: 'REMOVE_MUSCLE'; dayIndex: number; muscleId: string }
  | { type: 'SET_SETS'; dayIndex: number; muscleId: string; sets: number }
  | { type: 'REORDER'; dayIndex: number; fromIndex: number; toIndex: number }
  | { type: 'MOVE_MUSCLE'; fromDay: number; toDay: number; muscleId: string; toIndex: number }
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

function reducer(state: MusclePlanState, action: Action): MusclePlanState {
  switch (action.type) {
    case 'LOAD_TEMPLATE':
      return {
        ...state,
        templateId: action.payload.templateId,
        name: action.payload.name,
        description: action.payload.description,
        slots: action.payload.slots,
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
      const exists = state.slots.some(
        s => s.dayIndex === action.dayIndex && s.muscleId === action.muscleId
      );
      if (exists) return state;
      const newSlot: MuscleSlotData = {
        dayIndex: action.dayIndex,
        muscleId: action.muscleId,
        sets: 3,
        sortOrder: getMaxSortOrder(state.slots, action.dayIndex) + 1,
      };
      return { ...state, slots: [...state.slots, newSlot], isDirty: true };
    }

    case 'REMOVE_MUSCLE':
      return {
        ...state,
        slots: state.slots.filter(
          s => !(s.dayIndex === action.dayIndex && s.muscleId === action.muscleId)
        ),
        isDirty: true,
      };

    case 'SET_SETS':
      return {
        ...state,
        slots: state.slots.map(s =>
          s.dayIndex === action.dayIndex && s.muscleId === action.muscleId
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
      const slot = state.slots.find(
        s => s.dayIndex === action.fromDay && s.muscleId === action.muscleId
      );
      if (!slot) return state;

      // Check if muscle already exists on target day
      const existsOnTarget = state.slots.some(
        s => s.dayIndex === action.toDay && s.muscleId === action.muscleId
      );
      if (existsOnTarget) return state;

      const withoutMoved = state.slots.filter(
        s => !(s.dayIndex === action.fromDay && s.muscleId === action.muscleId)
      );

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

    case 'LOAD_PRESET':
      return {
        ...state,
        slots: action.slots,
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
        const { error } = await supabase
          .from('muscle_program_templates')
          .update({
            name: state.name,
            description: state.description || null,
            slot_config: state.slots as unknown as Record<string, unknown>,
            updated_at: new Date().toISOString(),
          })
          .eq('id', state.templateId);

        if (error) throw error;
        dispatch({ type: 'MARK_SAVED', templateId: state.templateId });
      } else {
        const { data, error } = await supabase
          .from('muscle_program_templates')
          .insert({
            coach_id: coachUserId,
            name: state.name,
            description: state.description || null,
            slot_config: state.slots as unknown as Record<string, unknown>,
          })
          .select('id')
          .single();

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
      const { data, error } = await supabase
        .from('muscle_program_templates')
        .insert({
          coach_id: coachUserId,
          name: state.name,
          description: state.description || null,
          slot_config: state.slots as unknown as Record<string, unknown>,
          is_preset: true,
        })
        .select('id')
        .single();

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
