// src/hooks/useCoachRosterAttention.ts
//
// One batched "who needs me" read for the calling coach, backed by the
// get_coach_roster_attention() RPC (RO1/CO5 / CO1 consolidation). The headline
// `total` is deduped server-side; `tiles` carries the per-bucket breakdown. The
// sidebar badge, dashboard, and roster all read THIS number — never recompute
// the headline client-side.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RosterAttentionTiles {
  payment_failed: number;
  inactive: number;
  check_in_overdue: number;
  pending_approval: number;
  adjustments_pending: number;
}

/** Per-bucket flagged client ids, so consumers can deep-link to the single
 *  flagged client without a second query. */
export type RosterAttentionClientIds = Record<keyof RosterAttentionTiles, string[]>;

export interface RosterAttention {
  total: number;
  most_overdue_days: number;
  tiles: RosterAttentionTiles;
  client_ids: RosterAttentionClientIds;
}

const EMPTY: RosterAttention = {
  total: 0,
  most_overdue_days: 0,
  tiles: { payment_failed: 0, inactive: 0, check_in_overdue: 0, pending_approval: 0, adjustments_pending: 0 },
  client_ids: { payment_failed: [], inactive: [], check_in_overdue: [], pending_approval: [], adjustments_pending: [] },
};

export function useCoachRosterAttention(): {
  attention: RosterAttention;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [attention, setAttention] = useState<RosterAttention>(EMPTY);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  const fetchAttention = useCallback(async () => {
    setLoading(true);
    // Supplementary badge read: destructure the error, but degrade to the empty
    // headline rather than throwing — a roster-count read must never take down
    // the coach sidebar (same convention as useCoachDeloadRequestCounts).
    const { data, error } = await supabase.rpc("get_coach_roster_attention");
    if (error) {
      console.warn("[useCoachRosterAttention]", error.message);
      setAttention(EMPTY);
    } else {
      setAttention((data as unknown as RosterAttention) ?? EMPTY);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchAttention();
  }, [fetchAttention]);

  return { attention, loading, refresh: fetchAttention };
}
