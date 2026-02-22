import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

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

function computeStatusBadge(memberCount: number, maxMembers: number): EnrichedTeam["statusBadge"] {
  const ratio = memberCount / maxMembers;
  if (ratio >= 1) return "closed";
  if (ratio >= 0.8) return "almost_full";
  return "open";
}

interface UseTeamsOptions {
  /** Only return public teams (for /teams page). Default true. */
  publicOnly?: boolean;
  /** Only active teams. Default true. */
  activeOnly?: boolean;
}

/**
 * Shared hook for fetching teams with capacity enrichment.
 * Used by both TeamSelectionSection (onboarding) and TeamsPage (public).
 */
export function useTeams(options: UseTeamsOptions = {}) {
  const { publicOnly = true, activeOnly = true } = options;
  const [teams, setTeams] = useState<EnrichedTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  const loadTeams = useCallback(async () => {
    try {
      let query = supabase
        .from("coach_teams")
        .select("id, name, description, tags, max_members, coach_id, training_goal, sessions_per_week, session_duration_min, cycle_start_date, cycle_weeks, cover_image_url, waitlist_enabled, is_public")
        .order("name");

      if (activeOnly) {
        query = query.eq("is_active", true);
      }
      if (publicOnly) {
        query = query.eq("is_public", true);
      }

      const { data: teamsData, error: teamsError } = await query;

      if (teamsError) throw teamsError;

      const enriched: EnrichedTeam[] = await Promise.all(
        (teamsData || []).map(async (team) => {
          // Coach name + avatar from coaches_client_safe
          const { data: coach } = await supabase
            .from("coaches_client_safe")
            .select("first_name, last_name, profile_picture_url")
            .eq("user_id", team.coach_id)
            .maybeSingle();

          // Member count from subscriptions
          const { count } = await supabase
            .from("subscriptions")
            .select("id", { count: "exact", head: true })
            .eq("team_id", team.id)
            .in("status", ["pending", "active"]);

          const memberCount = count || 0;
          const coachName = coach
            ? `${coach.first_name}${coach.last_name ? ` ${coach.last_name}` : ""}`
            : "Coach";

          return {
            id: team.id,
            name: team.name,
            description: team.description,
            tags: team.tags || [],
            max_members: team.max_members,
            coachName,
            coachAvatarUrl: coach?.profile_picture_url || null,
            memberCount,
            spotsRemaining: Math.max(0, team.max_members - memberCount),
            training_goal: team.training_goal,
            sessions_per_week: team.sessions_per_week,
            session_duration_min: team.session_duration_min,
            cycle_start_date: team.cycle_start_date,
            cycle_weeks: team.cycle_weeks,
            cover_image_url: team.cover_image_url,
            waitlist_enabled: team.waitlist_enabled ?? true,
            statusBadge: computeStatusBadge(memberCount, team.max_members),
          };
        })
      );

      setTeams(enriched);
      setError(null);
    } catch (err) {
      console.error("Error loading teams:", err);
      setError("Failed to load teams");
    } finally {
      setLoading(false);
    }
  }, [publicOnly, activeOnly]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadTeams();
  }, [loadTeams]);

  return { teams, loading, error, refetch: loadTeams };
}
