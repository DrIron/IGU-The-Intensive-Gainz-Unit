import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SpecializationTag {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

interface UseSpecializationTagsOptions {
  includeInactive?: boolean;
}

/**
 * Hook to fetch specialization tags from the database.
 * Uses React Query with 5-minute stale time for caching.
 *
 * @param options.includeInactive - If true, includes inactive tags (for admin management). Default: false
 * @returns Query result with typed SpecializationTag array
 */
export function useSpecializationTags({ includeInactive = false }: UseSpecializationTagsOptions = {}) {
  return useQuery({
    queryKey: ['specialization-tags', { includeInactive }],
    queryFn: async (): Promise<SpecializationTag[]> => {
      let query = supabase
        .from('specialization_tags')
        .select('id, name, display_order, is_active, created_at')
        .order('display_order', { ascending: true });

      if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching specialization tags:', error);
        throw error;
      }

      return (data as SpecializationTag[]) || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
