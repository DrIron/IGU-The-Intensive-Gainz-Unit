import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TeamPulse } from "./team-types";

type PulseState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; pulse: TeamPulse };

/**
 * Fetch the team Pulse aggregate (get_team_pulse RPC) once per team. Used by both
 * the Pulse and Nutrition tabs — the RPC is one round-trip and tabs aren't mounted
 * simultaneously, so the Nutrition split reads the same payload shape without
 * re-deriving from raw tables (docs/TEAMS_T3_BUILD.md §2).
 */
export function useTeamPulse(teamId: string): PulseState {
  const [state, setState] = useState<PulseState>({ kind: "loading" });
  const fetchedFor = useRef<string | null>(null);

  useEffect(() => {
    if (fetchedFor.current === teamId) return;
    fetchedFor.current = teamId;
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      const { data, error } = await supabase.rpc("get_team_pulse", { p_team_id: teamId });
      if (cancelled) return;
      if (error) {
        setState({ kind: "error", message: error.message });
        return;
      }
      setState({ kind: "ready", pulse: data as unknown as TeamPulse });
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  return state;
}
