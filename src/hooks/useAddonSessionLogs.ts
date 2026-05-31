import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AddonSessionLogRow {
  id: string;
  addon_purchase_id: string;
  session_date: string;
  notes: string | null;
  addon_name: string | null;
}

/**
 * Past addon session logs for a given client, joined client-side to the
 * addon catalog name (no FK joins per CLAUDE.md rule on fragile join
 * paths). Pulls the client's purchases first, then logs filtered to those
 * purchase ids, then a separate addon_services lookup for the names.
 *
 * Used by SessionsTab's "Past Sessions" section.
 */
export function useAddonSessionLogs(clientUserId: string | null | undefined) {
  return useQuery({
    queryKey: ["addon-session-logs", clientUserId],
    enabled: !!clientUserId,
    queryFn: async (): Promise<AddonSessionLogRow[]> => {
      const { data: purchases, error: purchaseError } = await supabase
        .from("addon_purchases")
        .select("id, addon_service_id")
        .eq("client_id", clientUserId!);
      if (purchaseError) throw purchaseError;

      const purchaseRows = purchases ?? [];
      const purchaseIds = purchaseRows.map((p) => p.id as string);
      if (purchaseIds.length === 0) return [];

      const serviceIds = Array.from(
        new Set(purchaseRows.map((p) => p.addon_service_id as string)),
      );

      const [logsRes, servicesRes] = await Promise.all([
        supabase
          .from("addon_session_logs")
          .select("id, addon_purchase_id, session_date, notes")
          .in("addon_purchase_id", purchaseIds)
          .order("session_date", { ascending: false })
          .limit(50),
        supabase
          .from("addon_services")
          .select("id, name")
          .in("id", serviceIds),
      ]);

      if (logsRes.error) throw logsRes.error;
      if (servicesRes.error) throw servicesRes.error;

      const purchaseToService = new Map<string, string>();
      for (const p of purchaseRows) {
        purchaseToService.set(p.id as string, p.addon_service_id as string);
      }
      const serviceName = new Map<string, string>();
      for (const s of servicesRes.data ?? []) {
        serviceName.set(s.id as string, s.name as string);
      }

      return (logsRes.data ?? []).map((log) => ({
        id: log.id as string,
        addon_purchase_id: log.addon_purchase_id as string,
        session_date: log.session_date as string,
        notes: (log.notes as string | null) ?? null,
        addon_name:
          serviceName.get(
            purchaseToService.get(log.addon_purchase_id as string) ?? "",
          ) ?? null,
      }));
    },
  });
}
