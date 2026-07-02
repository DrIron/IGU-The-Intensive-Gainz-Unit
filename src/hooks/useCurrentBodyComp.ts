// useCurrentBodyComp — latest weight + body-fat for a nutrition goal/phase, for
// the NU7 goal-page journey marker. Current weight = newest weight_logs (phase_id);
// current body-fat = newest body_fat_logs entry for the phase owner. (Was newest
// weekly_progress.body_fat_percentage keyed on goal_id, but goal_id is a
// nutrition_goals FK — disjoint from a phase id — so that read was always 0 rows,
// and the unified check-in no longer writes weekly_progress. body_fat_logs is
// user-keyed, so we resolve the phase owner first.) body_fat_logs RLS allows
// self + care-team + admin. Supplementary read: degrades to nulls on error.
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
      // body_fat_logs is user-keyed — resolve the phase owner first.
      const { data: phaseRow } = await supabase
        .from("nutrition_phases")
        .select("user_id")
        .eq("id", goalId)
        .maybeSingle();
      const ownerId = phaseRow?.user_id as string | undefined;

      const [weight, bf] = await Promise.all([
        supabase
          .from("weight_logs")
          .select("weight_kg, log_date")
          .eq("phase_id", goalId)
          .order("log_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
        ownerId
          ? supabase
              .from("body_fat_logs")
              .select("body_fat_percentage, log_date")
              .eq("user_id", ownerId)
              .not("body_fat_percentage", "is", null)
              .order("log_date", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
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
