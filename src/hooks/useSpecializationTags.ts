import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SpecializationTag {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

// Fallback specializations when database table is empty
const SPECIALIZATION_OPTIONS: SpecializationTag[] = [
  { id: 'fallback-1', name: 'Strength Training', display_order: 1, is_active: true, created_at: '' },
  { id: 'fallback-2', name: 'Weight Loss', display_order: 2, is_active: true, created_at: '' },
  { id: 'fallback-3', name: 'Muscle Building', display_order: 3, is_active: true, created_at: '' },
  { id: 'fallback-4', name: 'Sports Performance', display_order: 4, is_active: true, created_at: '' },
  { id: 'fallback-5', name: 'Powerlifting', display_order: 5, is_active: true, created_at: '' },
  { id: 'fallback-6', name: 'Bodybuilding', display_order: 6, is_active: true, created_at: '' },
  { id: 'fallback-7', name: 'Functional Fitness', display_order: 7, is_active: true, created_at: '' },
  { id: 'fallback-8', name: 'Nutrition Coaching', display_order: 8, is_active: true, created_at: '' },
  { id: 'fallback-9', name: 'Injury Rehabilitation', display_order: 9, is_active: true, created_at: '' },
  { id: 'fallback-10', name: 'Mobility & Flexibility', display_order: 10, is_active: true, created_at: '' },
  { id: 'fallback-11', name: 'HIIT & Conditioning', display_order: 11, is_active: true, created_at: '' },
  { id: 'fallback-12', name: 'Senior Fitness', display_order: 12, is_active: true, created_at: '' },
  { id: 'fallback-13', name: 'Youth Athletics', display_order: 13, is_active: true, created_at: '' },
  { id: 'fallback-14', name: 'Pre/Postnatal Fitness', display_order: 14, is_active: true, created_at: '' },
  { id: 'fallback-15', name: 'Contest Prep', display_order: 15, is_active: true, created_at: '' },
];

interface UseSpecializationTagsOptions {
  includeInactive?: boolean;
}

const QUERY_TIMEOUT_MS = 5000;

/**
 * Wraps a promise with a timeout. If the promise doesn't resolve within
 * the timeout, rejects with a timeout error.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Hook to fetch specialization tags from the database.
 * Uses React Query with 5-minute stale time for caching.
 * Includes a 5-second timeout to prevent hanging on session issues.
 *
 * @param options.includeInactive - If true, includes inactive tags (for admin management). Default: false
 * @returns Query result with typed SpecializationTag array
 */
export function useSpecializationTags({ includeInactive = false }: UseSpecializationTagsOptions = {}) {
  return useQuery({
    queryKey: ['specialization-tags', { includeInactive }],
    queryFn: async (): Promise<SpecializationTag[]> => {
      const executeQuery = async (): Promise<SpecializationTag[]> => {
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

        // Use fallback if database table is empty
        const tags = (data as SpecializationTag[]) || [];
        return tags.length > 0 ? tags : SPECIALIZATION_OPTIONS;
      };

      try {
        return await withTimeout(executeQuery(), QUERY_TIMEOUT_MS, 'specialization_tags query');
      } catch (error) {
        if (error instanceof Error && error.message.includes('timed out')) {
          console.warn('[useSpecializationTags] Query timed out, retrying after session check...');

          // Force a session refresh and retry once
          const { error: sessionError } = await supabase.auth.getSession();
          if (sessionError) {
            console.error('[useSpecializationTags] Session refresh failed:', sessionError);
          }

          // Retry the query (without timeout wrapper to avoid infinite loop)
          return await executeQuery();
        }
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1, // Only retry once on failure
  });
}
