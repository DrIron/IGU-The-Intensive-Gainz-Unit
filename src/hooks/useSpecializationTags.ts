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

        return (data as SpecializationTag[]) || [];
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
