import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SubroleSlug, UserSubrole } from "@/auth/roles";

interface UseUserSubrolesReturn {
  data: UserSubrole[];
  approvedSlugs: SubroleSlug[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * React Query hook to fetch a user's subroles.
 * Uses 5-minute stale time for caching (matches useSpecializationTags pattern).
 */
export function useUserSubroles(userId?: string): UseUserSubrolesReturn {
  const query = useQuery({
    queryKey: ["user-subroles", userId],
    queryFn: async (): Promise<UserSubrole[]> => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from("user_subroles")
        .select(`
          id,
          user_id,
          subrole_id,
          status,
          credential_notes,
          credential_document_url,
          admin_notes,
          reviewed_at,
          created_at,
          subrole_definitions!inner (
            slug,
            display_name
          )
        `)
        .eq("user_id", userId);

      if (error) {
        console.error("[useUserSubroles] Error:", error);
        throw error;
      }

      // Flatten the join
      return (data || []).map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        subrole_id: row.subrole_id,
        slug: row.subrole_definitions.slug as SubroleSlug,
        display_name: row.subrole_definitions.display_name,
        status: row.status,
        credential_notes: row.credential_notes,
        credential_document_url: row.credential_document_url,
        admin_notes: row.admin_notes,
        reviewed_at: row.reviewed_at,
        created_at: row.created_at,
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
    enabled: !!userId,
  });

  const data = query.data || [];
  const approvedSlugs = data
    .filter((s) => s.status === "approved")
    .map((s) => s.slug);

  return {
    data,
    approvedSlugs,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
