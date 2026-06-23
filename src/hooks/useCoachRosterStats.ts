// src/hooks/useCoachRosterStats.ts
//
// RO Phase 2 — per-active-client roster stats (adherence %, weigh-ins this week,
// last weigh-in, has-program) for the calling coach, backed by the
// get_coach_roster_stats() SECURITY DEFINER RPC. Coach RLS hides
// weight_logs / weekly_progress / adherence_logs from a client-side read, so
// these MUST come from the gated RPC. Batched + degrade-safe (empty map on
// error) + hasFetched guard, mirroring useCoachRosterAttention.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RosterStat {
  /** Share of the last ~4 weekly check-ins that were adherent; null when no recent weeks. */
  adherence_pct: number | null;
  weigh_ins_this_week: number;
  expected_weigh_ins: number;
  /** ISO date string (YYYY-MM-DD) of the last weigh-in, or null. */
  last_weigh_in_date: string | null;
  has_program: boolean;
}

/** Map keyed by client user_id; only active clients of the coach are present. */
export type RosterStatsMap = Record<string, RosterStat>;

export function useCoachRosterStats(): {
  stats: RosterStatsMap;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [stats, setStats] = useState<RosterStatsMap>({});
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    // Supplementary roster read: degrade to an empty map rather than throwing —
    // a stats read must never take down the coach roster (same convention as
    // useCoachRosterAttention / useCoachDeloadRequestCounts).
    const { data, error } = await supabase.rpc("get_coach_roster_stats");
    if (error) {
      console.warn("[useCoachRosterStats]", error.message);
      setStats({});
    } else {
      setStats((data as unknown as RosterStatsMap) ?? {});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, refresh: fetchStats };
}
