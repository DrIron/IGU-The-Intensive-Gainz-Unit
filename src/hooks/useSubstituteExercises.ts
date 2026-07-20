import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SubstituteResult } from "@/lib/substituteMatch";

/**
 * Fetch the weighted get_substitute_exercises RPC for a source exercise. Used by the
 * ExercisePickerDialog "Best replacements" shelf. `enabled` gates the call so we don't fetch when the
 * dialog is closed or has no source exercise. Equipment-aware boost is intentionally left off (v1).
 */
export function useSubstituteExercises(exerciseId: string | null | undefined, enabled: boolean) {
  const [result, setResult] = useState<SubstituteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!enabled || !exerciseId) {
      setResult(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { data, error: rpcError } = await supabase.rpc("get_substitute_exercises", {
        p_exercise_id: exerciseId,
      });
      if (cancelled) return;
      if (rpcError) {
        setError(rpcError);
        setResult(null);
      } else {
        setResult((data as unknown as SubstituteResult) ?? null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [exerciseId, enabled]);

  return { result, loading, error };
}
