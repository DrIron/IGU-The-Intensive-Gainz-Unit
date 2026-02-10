import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { evaluateSet, type SetContext, type SuggestionResult } from '@/utils/progressionEngine';
import type { ProgressionConfig, ProgressionSuggestion } from '@/types/workout-builder';

interface ActiveSuggestion {
  id: string;
  exerciseId: string;
  setNumber: number;
  result: SuggestionResult;
}

interface UseProgressionSuggestionsReturn {
  evaluate: (
    context: SetContext,
    config: ProgressionConfig,
    meta: {
      clientId: string;
      clientModuleExerciseId: string;
      exerciseLibraryId: string;
      sessionDate: string;
    },
  ) => Promise<ActiveSuggestion | null>;
  logResponse: (
    suggestionId: string,
    response: 'accepted' | 'dismissed' | 'ignored',
  ) => Promise<void>;
  activeSuggestions: ActiveSuggestion[];
  clearSuggestion: (suggestionId: string) => void;
}

export function useProgressionSuggestions(): UseProgressionSuggestionsReturn {
  const [activeSuggestions, setActiveSuggestions] = useState<ActiveSuggestion[]>([]);
  const autoHideTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const evaluate = useCallback(
    async (
      context: SetContext,
      config: ProgressionConfig,
      meta: {
        clientId: string;
        clientModuleExerciseId: string;
        exerciseLibraryId: string;
        sessionDate: string;
      },
    ): Promise<ActiveSuggestion | null> => {
      const result = evaluateSet(context, config);

      if (result.type === 'none') return null;

      // Insert suggestion record
      const { data, error } = await supabase
        .from('progression_suggestions')
        .insert({
          client_id: meta.clientId,
          client_module_exercise_id: meta.clientModuleExerciseId,
          exercise_library_id: meta.exerciseLibraryId,
          session_date: meta.sessionDate,
          set_number: context.set_number,
          prescribed_weight: context.prescribed_weight,
          prescribed_rep_min: context.prescribed_rep_min,
          prescribed_rep_max: context.prescribed_rep_max,
          prescribed_rir: context.prescribed_rir,
          performed_weight: context.performed_weight,
          performed_reps: context.performed_reps,
          performed_rir: context.performed_rir,
          performed_rpe: context.performed_rpe,
          suggestion_type: result.type,
          suggestion_text: result.text,
          suggested_increment: result.increment ?? null,
        } as any)
        .select('id')
        .single();

      if (error) {
        console.error('Failed to insert progression suggestion:', error);
        return null;
      }

      const suggestion: ActiveSuggestion = {
        id: data.id,
        exerciseId: meta.clientModuleExerciseId,
        setNumber: context.set_number,
        result,
      };

      setActiveSuggestions((prev) => [...prev, suggestion]);

      // Auto-hide after 30s → mark as ignored
      const timer = setTimeout(() => {
        logResponseInternal(data.id, 'ignored');
        setActiveSuggestions((prev) => prev.filter((s) => s.id !== data.id));
      }, 30_000);
      autoHideTimers.current.set(data.id, timer);

      return suggestion;
    },
    [],
  );

  const logResponseInternal = async (
    suggestionId: string,
    response: 'accepted' | 'dismissed' | 'ignored',
  ) => {
    await supabase
      .from('progression_suggestions')
      .update({
        client_response: response,
        client_response_at: new Date().toISOString(),
      } as any)
      .eq('id', suggestionId);
  };

  const logResponse = useCallback(
    async (
      suggestionId: string,
      response: 'accepted' | 'dismissed' | 'ignored',
    ) => {
      // Clear auto-hide timer
      const timer = autoHideTimers.current.get(suggestionId);
      if (timer) {
        clearTimeout(timer);
        autoHideTimers.current.delete(suggestionId);
      }

      await logResponseInternal(suggestionId, response);
      setActiveSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));
    },
    [],
  );

  const clearSuggestion = useCallback((suggestionId: string) => {
    const timer = autoHideTimers.current.get(suggestionId);
    if (timer) {
      clearTimeout(timer);
      autoHideTimers.current.delete(suggestionId);
    }
    setActiveSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));
  }, []);

  return { evaluate, logResponse, activeSuggestions, clearSuggestion };
}
