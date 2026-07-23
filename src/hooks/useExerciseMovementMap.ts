import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * exercise_id → { groupId, leafId } from the `exercise_movement_map` view (Phase 3). The view is
 * DB-authoritative: it encodes both the movement_pattern → group join AND the Press Horizontal/
 * Anterior leaf split (from muscle_group/positioning). Cached indefinitely (static taxonomy). The
 * movement lens resolves each filled slot's exercise via this map — exercises absent from the map
 * (movement_pattern not in the taxonomy) simply don't contribute.
 */

export interface ExerciseMovement {
  groupId: string;
  leafId: string;
}

export function useExerciseMovementMap(enabled = true) {
  return useQuery<Map<string, ExerciseMovement>>({
    queryKey: ["exercise-movement-map"],
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercise_movement_map")
        .select("exercise_id, movement_group_id, movement_leaf_id");
      if (error) throw error;
      const map = new Map<string, ExerciseMovement>();
      for (const r of data ?? []) {
        if (r.exercise_id && r.movement_group_id) {
          map.set(r.exercise_id, { groupId: r.movement_group_id, leafId: r.movement_leaf_id ?? r.movement_group_id });
        }
      }
      return map;
    },
  });
}
