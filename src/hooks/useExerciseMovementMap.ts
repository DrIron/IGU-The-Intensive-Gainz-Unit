import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * exercise_id → { groupId, leafId, isolation, affinity } from the `exercise_movement_map` view
 * (Phase 3). The view is DB-authoritative: it encodes the movement_pattern → group join, the Press/
 * Pull/Carry leaf splits, AND the isolation + PPL affinity axis. Cached indefinitely (static taxonomy).
 *
 * COMPOUND (Patterns) lens: resolves a filled slot's exercise → group + leaf; an ISOLATION exercise
 * has `groupId: null` and contributes nothing there (accessories don't distort compound-balance).
 * PPL (affinity) lens: EVERY resolved exercise carries an `affinity` (+ `isolation` flag), so curls/
 * raises/flys DO count in the push/pull/legs rollup. Exercises absent from the view don't contribute.
 */

export interface ExerciseMovement {
  /** null for isolation/accessory patterns (no compound group). */
  groupId: string | null;
  leafId: string | null;
  isolation: boolean;
  /** push | pull | legs | core | full_body | neck (null only if the view has no affinity for it). */
  affinity: string | null;
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
        .select("exercise_id, movement_group_id, movement_leaf_id, is_isolation, affinity");
      if (error) throw error;
      const map = new Map<string, ExerciseMovement>();
      for (const r of data ?? []) {
        // Keep ALL resolved exercises (incl. isolation — null group) so the affinity lens sees them.
        if (r.exercise_id) {
          map.set(r.exercise_id, {
            groupId: r.movement_group_id ?? null,
            leafId: r.movement_leaf_id ?? r.movement_group_id ?? null,
            isolation: r.is_isolation ?? false,
            affinity: r.affinity ?? null,
          });
        }
      }
      return map;
    },
  });
}
