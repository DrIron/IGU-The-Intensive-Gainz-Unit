import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Phase 3 movement taxonomy config (get_movement_group_config RPC): Squat/Press/Hinge groups with
 * per-group + per-subGroup variation counts, plus the movement_pattern → group map. Static config —
 * cached indefinitely. Supplies the movement lens's group/subGroup LABELS + order (per-plan set
 * counts come from useExerciseMovementMap).
 */

export interface MovementSubGroup {
  id: string;
  label: string;
  sortOrder: number;
  variationCount: number;
}

export interface MovementGroup {
  id: string;
  label: string;
  sortOrder: number;
  variationCount: number;
  subGroups: MovementSubGroup[];
}

export interface MovementGroupConfig {
  groups: MovementGroup[];
  patternMap: Record<string, string>;
}

export function useMovementGroupConfig(enabled = true) {
  return useQuery<MovementGroupConfig>({
    queryKey: ["movement-group-config"],
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_movement_group_config");
      if (error) throw error;
      return (data as unknown as MovementGroupConfig) ?? { groups: [], patternMap: {} };
    },
  });
}
