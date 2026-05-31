import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SubroleDefinition {
  slug: string;
  display_name: string;
}

/**
 * Tiny cache of subrole_definitions for slug -> display_name lookups.
 * Used by SessionsTab's eligibility tooltip ("Only Physiotherapist can
 * log this add-on"). Public-readable table -- no auth dependency.
 */
export function useSubroleDefinitions() {
  return useQuery({
    queryKey: ["subrole-definitions"],
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase
        .from("subrole_definitions")
        .select("slug, display_name");
      if (error) throw error;
      const map = new Map<string, string>();
      for (const row of data ?? []) {
        map.set(row.slug as string, row.display_name as string);
      }
      return map;
    },
    staleTime: Infinity,
  });
}
