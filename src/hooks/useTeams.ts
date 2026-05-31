import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/errorLogging";

export interface EnrichedTeam {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  max_members: number;
  coachName: string;
  coachAvatarUrl: string | null;
  memberCount: number;
  spotsRemaining: number;
  training_goal: string | null;
  sessions_per_week: number | null;
  session_duration_min: number | null;
  cycle_start_date: string | null;
  cycle_weeks: number | null;
  cover_image_url: string | null;
  waitlist_enabled: boolean;
  statusBadge: "open" | "almost_full" | "closed";
}

/**
 * Row shape returned by both list_public_teams_for_browser() (public browser,
 * anon + authenticated) and list_active_teams_for_client() (authed onboarding).
 * The client-side RPC omits the browser-only extras (avatar, cadence, cycle,
 * cover image, waitlist flag); those arrive undefined and fall back to defaults.
 */
interface TeamRpcRow {
  id: string;
  name: string;
  description: string | null;
  tags: string[] | null;
  max_members: number;
  coach_id: string;
  coach_first_name: string | null;
  coach_last_name: string | null;
  coach_profile_picture_url?: string | null;
  training_goal?: string | null;
  sessions_per_week?: number | null;
  session_duration_min?: number | null;
  cycle_start_date?: string | null;
  cycle_weeks?: number | null;
  cover_image_url?: string | null;
  waitlist_enabled?: boolean | null;
  member_count: number;
}

function computeStatusBadge(memberCount: number, maxMembers: number): EnrichedTeam["statusBadge"] {
  const ratio = memberCount / maxMembers;
  if (ratio >= 1) return "closed";
  if (ratio >= 0.8) return "almost_full";
  return "open";
}

function enrichRow(row: TeamRpcRow): EnrichedTeam {
  const memberCount = row.member_count ?? 0;
  // coaches_public is LEFT JOINed in the RPC, so first_name can be null for a
  // team whose coach has no public profile row. Keep the legacy "Coach" fallback.
  const coachName = row.coach_first_name
    ? `${row.coach_first_name}${row.coach_last_name ? ` ${row.coach_last_name}` : ""}`
    : "Coach";

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tags: row.tags || [],
    max_members: row.max_members,
    coachName,
    coachAvatarUrl: row.coach_profile_picture_url ?? null,
    memberCount,
    spotsRemaining: Math.max(0, row.max_members - memberCount),
    training_goal: row.training_goal ?? null,
    sessions_per_week: row.sessions_per_week ?? null,
    session_duration_min: row.session_duration_min ?? null,
    cycle_start_date: row.cycle_start_date ?? null,
    cycle_weeks: row.cycle_weeks ?? null,
    cover_image_url: row.cover_image_url ?? null,
    waitlist_enabled: row.waitlist_enabled ?? true,
    statusBadge: computeStatusBadge(memberCount, row.max_members),
  };
}

interface UseTeamsOptions {
  /** Only return public teams (for /teams page). Default true. */
  publicOnly?: boolean;
}

/**
 * Shared hook for fetching teams with capacity enrichment.
 * Used by both TeamSelectionSection (onboarding) and TeamsPage (public).
 *
 * Each path bundles team rows + head-coach name + member count in a single
 * SECURITY DEFINER RPC round-trip (no N+1, no anon-broken get_coach_for_client):
 * - publicOnly: true  -> list_public_teams_for_browser() (anon + authenticated)
 * - publicOnly: false -> list_active_teams_for_client()  (authenticated onboarding)
 */
export function useTeams(options: UseTeamsOptions = {}) {
  const { publicOnly = true } = options;
  const [teams, setTeams] = useState<EnrichedTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  const loadTeams = useCallback(async () => {
    try {
      const { data, error: rpcError } = publicOnly
        ? await supabase.rpc("list_public_teams_for_browser")
        : await supabase.rpc("list_active_teams_for_client");

      if (rpcError) throw rpcError;

      const rows = (data ?? []) as unknown as TeamRpcRow[];
      setTeams(rows.map(enrichRow));
      setError(null);
    } catch (err) {
      captureException(err, { source: "useTeams.loadTeams", metadata: { publicOnly } });
      setError("Failed to load teams");
    } finally {
      setLoading(false);
    }
  }, [publicOnly]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadTeams();
  }, [loadTeams]);

  return { teams, loading, error, refetch: loadTeams };
}
