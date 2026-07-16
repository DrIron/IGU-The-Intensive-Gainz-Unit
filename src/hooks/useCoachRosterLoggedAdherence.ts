// src/hooks/useCoachRosterLoggedAdherence.ts
//
// Roster real-adherence (flag: roster_logged_adherence) — logged-intake adherence computed from
// food_log_daily_rollup vs the coach target, via the get_coach_roster_logged_adherence()
// SECURITY DEFINER RPC. This is ADDITIVE and opt-in: get_coach_roster_stats (the load-bearing
// self-report roster) is untouched. When the flag is off the hook fetches nothing and returns an
// empty map, so the roster stays on pure self-report.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LoggedAdherence {
  /** Logged-intake adherence % over the last 28 days; null on the honesty gate (see below). */
  logged_adherence_pct: number | null;
  /** How many of the last 28 days the client actually logged. */
  logged_days: number;
}

/** Map keyed by client user_id; only the coach's active clients are present. */
export type LoggedAdherenceMap = Record<string, LoggedAdherence>;

export function useCoachRosterLoggedAdherence(enabled: boolean): {
  logged: LoggedAdherenceMap;
  loading: boolean;
} {
  const [logged, setLogged] = useState<LoggedAdherenceMap>({});
  const [loading, setLoading] = useState(enabled);
  const hasFetched = useRef(false);

  const fetchLogged = useCallback(async () => {
    setLoading(true);
    // Supplementary read: degrade to an empty map rather than throwing — a logged-adherence read
    // must never take down the roster (same convention as useCoachRosterStats). Empty map → every
    // row falls back to self-report.
    const { data, error } = await supabase.rpc("get_coach_roster_logged_adherence");
    if (error) {
      console.warn("[useCoachRosterLoggedAdherence]", error.message);
      setLogged({});
    } else {
      setLogged((data as unknown as LoggedAdherenceMap) ?? {});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Flag off: no fetch at all, empty map — the roster stays exactly on self-report.
      setLogged({});
      setLoading(false);
      return;
    }
    if (hasFetched.current) return;
    hasFetched.current = true;
    void fetchLogged();
  }, [enabled, fetchLogged]);

  return { logged, loading };
}

export type AdherenceSource = "logged" | "self";

export interface ResolvedAdherence {
  /** The % to show (null → em-dash). */
  pct: number | null;
  /** Which source produced it. */
  source: AdherenceSource;
  /** Show the subtle "self-reported" hint (only when the flag is on AND we're showing a proxy). */
  selfReportedHint: boolean;
}

/**
 * Merge the two adherence sources for one roster row. When the flag is on, prefer a non-null
 * LOGGED value; otherwise fall back to the self-report proxy. The hint distinguishes a real
 * logged % from a self-report proxy — but only when the feature is active (flag off → identical
 * to today, no hint).
 */
export function resolveRosterAdherence(
  loggedEnabled: boolean,
  loggedPct: number | null,
  selfReportPct: number | null,
): ResolvedAdherence {
  const usingLogged = loggedEnabled && loggedPct != null;
  const pct = usingLogged ? loggedPct : selfReportPct;
  return {
    pct,
    source: usingLogged ? "logged" : "self",
    selfReportedHint: loggedEnabled && !usingLogged && pct != null,
  };
}
