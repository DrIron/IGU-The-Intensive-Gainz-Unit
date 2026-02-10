import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SpecializationTag {
  id: string;
  value: string;      // snake_case key for matching (e.g., "strength_training")
  label: string;      // Display name (e.g., "Strength Training")
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Fallback specializations aligned with client FOCUS_OPTIONS for coach-client matching
const FALLBACK_TAGS: SpecializationTag[] = [
  { id: 'fb-1', value: 'general_fitness', label: 'General Fitness', sort_order: 1, is_active: true, created_at: '', updated_at: '' },
  { id: 'fb-2', value: 'strength_training', label: 'Strength Training', sort_order: 2, is_active: true, created_at: '', updated_at: '' },
  { id: 'fb-3', value: 'bodybuilding', label: 'Bodybuilding', sort_order: 3, is_active: true, created_at: '', updated_at: '' },
  { id: 'fb-4', value: 'powerlifting', label: 'Powerlifting', sort_order: 4, is_active: true, created_at: '', updated_at: '' },
  { id: 'fb-5', value: 'body_recomposition', label: 'Body Recomposition', sort_order: 5, is_active: true, created_at: '', updated_at: '' },
  { id: 'fb-6', value: 'weight_loss', label: 'Weight Loss', sort_order: 6, is_active: true, created_at: '', updated_at: '' },
  { id: 'fb-7', value: 'nutrition_coaching', label: 'Nutrition Coaching', sort_order: 7, is_active: true, created_at: '', updated_at: '' },
  { id: 'fb-8', value: 'athletic_performance', label: 'Athletic Performance', sort_order: 8, is_active: true, created_at: '', updated_at: '' },
  { id: 'fb-9', value: 'mobility_flexibility', label: 'Mobility & Flexibility', sort_order: 9, is_active: true, created_at: '', updated_at: '' },
  { id: 'fb-10', value: 'running_endurance', label: 'Running & Endurance', sort_order: 10, is_active: true, created_at: '', updated_at: '' },
  { id: 'fb-11', value: 'rehab_injury_prevention', label: 'Rehab & Injury Prevention', sort_order: 11, is_active: true, created_at: '', updated_at: '' },
  { id: 'fb-12', value: 'contest_prep', label: 'Contest Prep', sort_order: 12, is_active: true, created_at: '', updated_at: '' },
  { id: 'fb-13', value: 'womens_training', label: "Women's Training", sort_order: 13, is_active: true, created_at: '', updated_at: '' },
  { id: 'fb-14', value: 'senior_fitness', label: 'Senior Fitness', sort_order: 14, is_active: true, created_at: '', updated_at: '' },
  { id: 'fb-15', value: 'youth_training', label: 'Youth Training', sort_order: 15, is_active: true, created_at: '', updated_at: '' },
];

interface UseSpecializationTagsOptions {
  includeInactive?: boolean;
}

import { withTimeout } from '@/lib/withTimeout';

interface UseSpecializationTagsReturn {
  tags: SpecializationTag[];
  loading: boolean;
  error: Error | null;
  /** Map a value to its display label */
  getLabel: (value: string) => string;
}

const QUERY_TIMEOUT_MS = 5000;

/**
 * Hook to fetch specialization tags from the database.
 * Uses React Query with 5-minute stale time for caching.
 * Returns tags with value/label pairs for consistent coach-client matching.
 *
 * @param options.includeInactive - If true, includes inactive tags (for admin management). Default: false
 * @returns { tags, loading, error, getLabel }
 */
export function useSpecializationTags({ includeInactive = false }: UseSpecializationTagsOptions = {}): UseSpecializationTagsReturn {
  const query = useQuery({
    queryKey: ['specialization-tags', { includeInactive }],
    queryFn: async (): Promise<SpecializationTag[]> => {
      const executeQuery = async (): Promise<SpecializationTag[]> => {
        let q = supabase
          .from('specialization_tags')
          .select('id, value, label, sort_order, is_active, created_at, updated_at')
          .order('sort_order', { ascending: true });

        if (!includeInactive) {
          q = q.eq('is_active', true);
        }

        const { data, error } = await q;

        if (error) {
          console.error('[useSpecializationTags] Query error:', error);
          throw error;
        }

        const tags = (data as SpecializationTag[]) || [];
        return tags.length > 0 ? tags : FALLBACK_TAGS;
      };

      try {
        return await withTimeout(executeQuery(), QUERY_TIMEOUT_MS, 'specialization_tags query');
      } catch (error) {
        if (error instanceof Error && error.message.includes('timed out')) {
          console.warn('[useSpecializationTags] Query timed out, using fallback tags');
          return FALLBACK_TAGS;
        }
        // On any error, return fallback to keep UI functional
        console.error('[useSpecializationTags] Error, using fallback:', error);
        return FALLBACK_TAGS;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  const tags = query.data || FALLBACK_TAGS;

  // Helper to map value to label
  const getLabel = (value: string): string => {
    const tag = tags.find(t => t.value === value);
    if (tag) return tag.label;
    // Fallback: convert snake_case to Title Case
    return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return {
    tags,
    loading: query.isLoading,
    error: query.error as Error | null,
    getLabel,
  };
}

export default useSpecializationTags;
