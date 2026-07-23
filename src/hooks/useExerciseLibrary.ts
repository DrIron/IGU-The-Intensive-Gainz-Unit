import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/**
 * Shared exercise-library data layer (Exercise Library Redesign — Phase 5b).
 *
 * ONE query path for every consumer (admin manager, program-builder picker,
 * client browse). Fetches active exercises once (cached) and filters in memory —
 * the library is small (~350 rows) so faceted filtering needs no per-filter
 * round-trips. See docs/EXERCISE_LIBRARY_REDESIGN.md.
 */

type BaseRow = Database["public"]["Tables"]["exercise_library"]["Row"];

// Augment the generated Row with the Phase 2/3 facet FKs and widen `category`
// to include 'sport_specific' (both post-date types.ts; remove after regen).
export interface ExerciseRow extends Omit<BaseRow, "category"> {
  category: string;
  muscle_id: string | null;
  subdivision_id: string | null;
  cardio_movement_id: string | null;
  technique_id: string | null;
  target_region_id: string | null;
  physio_purpose_id: string | null;
}

export interface ExerciseFilters {
  category?: string;
  search?: string;
  muscleId?: string;
  subdivisionId?: string;
  cardioMovementId?: string;
  techniqueId?: string;
  targetRegionId?: string;
  physioPurposeId?: string;
  equipment?: string;
}

/** Fetch all active exercises once (RLS scopes to global + own-coach). Cached. */
export function useExerciseLibraryData(enabled = true) {
  return useQuery<ExerciseRow[]>({
    queryKey: ["exercise-library", "all-active"],
    enabled,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercise_library")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as unknown as ExerciseRow[];
    },
  });
}

/** Pure faceted filter — same logic for every surface. */
export function filterExercises(rows: ExerciseRow[], filters: ExerciseFilters): ExerciseRow[] {
  let out = rows;
  if (filters.category) out = out.filter((r) => r.category === filters.category);
  if (filters.muscleId) out = out.filter((r) => r.muscle_id === filters.muscleId);
  if (filters.subdivisionId) out = out.filter((r) => r.subdivision_id === filters.subdivisionId);
  if (filters.cardioMovementId) out = out.filter((r) => r.cardio_movement_id === filters.cardioMovementId);
  if (filters.techniqueId) out = out.filter((r) => r.technique_id === filters.techniqueId);
  if (filters.targetRegionId) out = out.filter((r) => r.target_region_id === filters.targetRegionId);
  if (filters.physioPurposeId) out = out.filter((r) => r.physio_purpose_id === filters.physioPurposeId);
  if (filters.equipment) out = out.filter((r) => r.equipment === filters.equipment);
  if (filters.search) {
    const q = filters.search.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.primary_muscle ?? "").toLowerCase().includes(q) ||
          (r.equipment ?? "").toLowerCase().includes(q),
      );
    }
  }
  return out.slice().sort((a, b) => a.name.localeCompare(b.name));
}
