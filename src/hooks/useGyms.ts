import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Gym {
  id: string;
  name: string;
  area: string | null;
  sort_order: number;
  is_active: boolean;
}

interface UseGymsOptions {
  /** Include inactive gyms (admin management). Default: false (active only). */
  includeInactive?: boolean;
}

/**
 * Managed gyms vocabulary — mirrors useSpecializationTags. Powers the onboarding
 * "Preferred gym" picker (active only, anon+authenticated readable) and the admin
 * GymManager (includeInactive). RLS scopes inactive rows to admins.
 */
export function useGyms({ includeInactive = false }: UseGymsOptions = {}) {
  const query = useQuery({
    queryKey: ["gyms", { includeInactive }],
    queryFn: async (): Promise<Gym[]> => {
      let q = supabase
        .from("gyms")
        .select("id, name, area, sort_order, is_active")
        .order("sort_order", { ascending: true });
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data as Gym[]) ?? [];
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return {
    gyms: query.data ?? [],
    loading: query.isLoading,
    error: query.error as Error | null,
  };
}

export default useGyms;
