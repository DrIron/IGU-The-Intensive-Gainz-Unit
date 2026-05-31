import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UnusedAddonRow {
  purchase_id: string;
  addon_service_id: string;
  service_name: string;
  service_type: string;
  sessions_remaining: number;
  sessions_total: number;
  expires_at: string;
  purchased_at: string;
}

export interface UnusedAddonsByService {
  total_unused: number;
  oldest_expires_at: string;
  purchases: UnusedAddonRow[];
}

export interface UseUnusedAddonsResult {
  byServiceId: Map<string, UnusedAddonsByService>;
  totalUnused: number;
  rows: UnusedAddonRow[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Reads the addon_purchases_with_remaining view (Phase 0 migration
 * 20260524130400) filtered to the calling user's usable packs with
 * sessions left. Groups by addon_service_id so a catalog card can show
 * "You have N unused" without a second query.
 *
 * View RLS inherits from addon_purchases + addon_session_logs, so the
 * query implicitly scopes to auth.uid().
 *
 * Pass `null` / `undefined` for `userId` to skip fetching.
 */
export function useUnusedAddons(
  userId: string | null | undefined,
): UseUnusedAddonsResult {
  const query = useQuery({
    queryKey: ["unused-addons", userId],
    enabled: !!userId,
    queryFn: async (): Promise<UnusedAddonRow[]> => {
      const { data, error } = await supabase
        .from("addon_purchases_with_remaining")
        .select(
          "id, addon_service_id, service_name, service_type, sessions_remaining, sessions_total, expires_at, purchased_at, is_usable",
        )
        .eq("client_id", userId!)
        .eq("is_usable", true)
        .gt("sessions_remaining", 0)
        .order("expires_at", { ascending: true });

      if (error) throw error;
      return (data ?? []).map((r) => ({
        purchase_id: r.id as string,
        addon_service_id: r.addon_service_id as string,
        service_name: (r.service_name as string) ?? "",
        service_type: (r.service_type as string) ?? "",
        sessions_remaining: Number(r.sessions_remaining ?? 0),
        sessions_total: Number(r.sessions_total ?? 0),
        expires_at: r.expires_at as string,
        purchased_at: r.purchased_at as string,
      }));
    },
  });

  const rows = query.data ?? [];
  const byServiceId = new Map<string, UnusedAddonsByService>();
  for (const row of rows) {
    const existing = byServiceId.get(row.addon_service_id);
    if (existing) {
      existing.total_unused += row.sessions_remaining;
      existing.purchases.push(row);
      // rows ordered by expires_at ASC already -- first one wins.
    } else {
      byServiceId.set(row.addon_service_id, {
        total_unused: row.sessions_remaining,
        oldest_expires_at: row.expires_at,
        purchases: [row],
      });
    }
  }

  const totalUnused = rows.reduce((sum, r) => sum + r.sessions_remaining, 0);

  return {
    byServiceId,
    totalUnused,
    rows,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
