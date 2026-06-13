import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shared exercise taxonomy lookups (Exercise Library Redesign — Phase 5b).
 *
 * Single source for the controlled vocabularies that drive faceted browse,
 * authoring dropdowns, and the program-builder picker. See
 * docs/EXERCISE_LIBRARY_REDESIGN.md.
 *
 * NOTE: these lookup tables post-date src/integrations/supabase/types.ts.
 * Until that file is regenerated (`supabase gen types`), they are queried through
 * the localized `fetchLookup` helper below. After regen, swap to typed
 * `supabase.from(...)` calls and delete the helper.
 */

export interface TaxonomyNode {
  id: string;
  slug: string;
  display_name: string;
  sort_order: number;
  is_active: boolean;
}
export interface Muscle extends TaxonomyNode {
  primary_region_id: string;
}
export interface Subdivision extends TaxonomyNode {
  muscle_id: string;
}

interface LookupResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

// Localized escape hatch for not-yet-typed lookup tables (see file header).
// NOTE: call `.from` through the client receiver — detaching it
// (`const from = supabase.from`) loses the `this` binding and throws
// "Cannot read properties of undefined (reading 'rest')".
async function fetchLookup<T extends { sort_order: number }>(table: string): Promise<T[]> {
  const client = supabase as unknown as {
    from: (t: string) => { select: (cols: string) => PromiseLike<LookupResult<T>> };
  };
  const { data, error } = await client.from(table).select("*");
  if (error) throw new Error(error.message);
  return (data ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
}

export interface ExerciseTaxonomy {
  regions: TaxonomyNode[];
  muscles: Muscle[];
  subdivisions: Subdivision[];
  cardioMovements: TaxonomyNode[];
  energySystems: TaxonomyNode[];
  techniques: TaxonomyNode[];
  targetRegions: TaxonomyNode[];
  physioPurposes: TaxonomyNode[];
  /** muscles grouped by their primary region id */
  musclesByRegion: Map<string, Muscle[]>;
  /** subdivisions grouped by their muscle id */
  subdivisionsByMuscle: Map<string, Subdivision[]>;
}

export function useExerciseTaxonomy() {
  return useQuery<ExerciseTaxonomy>({
    queryKey: ["exercise-taxonomy"],
    // Lookups change rarely (admin edits only) — keep them warm.
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 120,
    queryFn: async () => {
      const [
        regions,
        muscles,
        subdivisions,
        cardioMovements,
        energySystems,
        techniques,
        targetRegions,
        physioPurposes,
      ] = await Promise.all([
        fetchLookup<TaxonomyNode>("body_regions"),
        fetchLookup<Muscle>("muscles"),
        fetchLookup<Subdivision>("muscle_subdivisions"),
        fetchLookup<TaxonomyNode>("cardio_movements"),
        fetchLookup<TaxonomyNode>("energy_systems"),
        fetchLookup<TaxonomyNode>("activity_techniques"),
        fetchLookup<TaxonomyNode>("target_regions"),
        fetchLookup<TaxonomyNode>("physio_purposes"),
      ]);

      const musclesByRegion = new Map<string, Muscle[]>();
      for (const m of muscles) {
        const list = musclesByRegion.get(m.primary_region_id) ?? [];
        list.push(m);
        musclesByRegion.set(m.primary_region_id, list);
      }

      const subdivisionsByMuscle = new Map<string, Subdivision[]>();
      for (const s of subdivisions) {
        const list = subdivisionsByMuscle.get(s.muscle_id) ?? [];
        list.push(s);
        subdivisionsByMuscle.set(s.muscle_id, list);
      }

      return {
        regions,
        muscles,
        subdivisions,
        cardioMovements,
        energySystems,
        techniques,
        targetRegions,
        physioPurposes,
        musclesByRegion,
        subdivisionsByMuscle,
      };
    },
  });
}
