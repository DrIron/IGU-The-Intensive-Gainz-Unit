// useWeightUnit — per-client weight display/entry unit (kg | lb), backed by
// client_preferences (self-RLS). Weights are ALWAYS stored canonically in kg;
// this only controls how the logger shows/accepts them. Conversion lives in
// src/utils/weightUnits.ts — never inline the factor.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { WeightUnit } from "@/utils/weightUnits";

export function useWeightUnit(): {
  unit: WeightUnit;
  setUnit: (next: WeightUnit) => Promise<void>;
  isLoading: boolean;
} {
  const [unit, setUnitState] = useState<WeightUnit>("kg");
  const [isLoading, setIsLoading] = useState(true);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }
      // Optional row → default 'kg'; a read failure degrades to the default
      // rather than blocking the logger (display-only preference).
      const { data } = await supabase
        .from("client_preferences")
        .select("weight_unit")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.weight_unit === "lb" || data?.weight_unit === "kg") {
        setUnitState(data.weight_unit);
      }
      setIsLoading(false);
    })();
  }, []);

  const setUnit = useCallback(async (next: WeightUnit) => {
    // Optimistic so the toggle feels instant; revert on failure.
    const prev = next === "kg" ? "lb" : "kg";
    setUnitState(next);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("client_preferences")
      .upsert({ user_id: user.id, weight_unit: next }, { onConflict: "user_id" });
    if (error) {
      setUnitState(prev);
      throw error;
    }
  }, []);

  return { unit, setUnit, isLoading };
}
