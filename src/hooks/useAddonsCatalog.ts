import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AddonServiceType =
  | "session_pack"
  | "specialist"
  | "one_time"
  | "monthly_addon";

export interface AddonServiceCatalogRow {
  id: string;
  name: string;
  type: AddonServiceType;
  base_price_kwd: number;
  pack_size: number | null;
  pack_price_kwd: number | null;
  pack_expiry_months: number | null;
  tier_restrictions: string[] | null;
  is_active: boolean;
}

/**
 * Pulls the active addon_services catalog. RLS already filters to
 * is_active=true via `public_read_active_addon_services` policy, but we
 * also pass the filter explicitly for clarity. Cached via React Query
 * defaults (5 min staleTime per QueryClient config in App.tsx).
 */
export function useAddonsCatalog() {
  return useQuery({
    queryKey: ["addons-catalog"],
    queryFn: async (): Promise<AddonServiceCatalogRow[]> => {
      const { data, error } = await supabase
        .from("addon_services")
        .select(
          "id, name, type, base_price_kwd, pack_size, pack_price_kwd, pack_expiry_months, tier_restrictions, is_active",
        )
        .eq("is_active", true)
        .order("type", { ascending: true })
        .order("base_price_kwd", { ascending: true });

      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        type: row.type as AddonServiceType,
        base_price_kwd: Number(row.base_price_kwd),
        pack_size: row.pack_size as number | null,
        pack_price_kwd: row.pack_price_kwd === null ? null : Number(row.pack_price_kwd),
        pack_expiry_months: row.pack_expiry_months as number | null,
        tier_restrictions: (row.tier_restrictions as string[] | null) ?? null,
        is_active: row.is_active as boolean,
      }));
    },
  });
}
