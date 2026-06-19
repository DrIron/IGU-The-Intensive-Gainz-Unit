// useCurrentBodyComp — latest weight + body-fat for a nutrition goal/phase, for
// the NU7 goal-page journey marker. Mirrors the ClientNutritionProgress source
// (NU7 §3): current weight = newest weight_logs (phase_id), current body-fat =
// newest non-null weekly_progress.body_fat_percentage (goal_id) — the goal id IS
// the phase id used by those logs. Supplementary read: degrades to nulls on
// error rather than blocking the page.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CurrentBodyComp {
  currentWeightKg: number | null;
  currentBodyFat: number | null;
  isLoading: boolean;
}

export function useCurrentBodyComp(goalId: string | undefined): CurrentBodyComp {
  const [state, setState] = useState<CurrentBodyComp>({
    currentWeightKg: null,
    currentBodyFat: null,
    isLoading: true,
  });
  const fetchedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!goalId || fetchedFor.current === goalId) return;
    fetchedFor.current = goalId;
    (async () => {
      const [weight, bf] = await Promise.all([
        supabase
          .from("weight_logs")
          .select("weight_kg, log_date")
          .eq("phase_id", goalId)
          .order("log_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("weekly_progress")
          .select("body_fat_percentage, week_number")
          .eq("goal_id", goalId)
          .not("body_fat_percentage", "is", null)
          .order("week_number", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      setState({
        currentWeightKg: (weight.data?.weight_kg as number | null | undefined) ?? null,
        currentBodyFat: (bf.data?.body_fat_percentage as number | null | undefined) ?? null,
        isLoading: false,
      });
    })();
  }, [goalId]);

  return state;
}
