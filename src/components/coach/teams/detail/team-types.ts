/**
 * Stable contract for the Team Detail shell (Teams T3), mirroring the
 * client-overview `types.ts`. The shell (`TeamDetailShell`) is the ONLY place
 * that resolves team metadata + the active-member set; tabs receive `context`
 * via props and never re-resolve team identity. Tab-scoped data (the Pulse
 * aggregate, roster details) is each tab's own fetch.
 */

export interface TeamContext {
  teamId: string;
  teamName: string;
  /** Resolved from coach_teams.coach_id (the head coach), not trusted from elsewhere. */
  coachUserId: string;
  /** Active members (pending + active subscriptions on the team). */
  memberCount: number;
  currentProgramTemplateId: string | null;
  /** Canonical shared plan (board_v2); may be null. */
  currentProgramPlanId: string | null;
  description: string | null;
  tags: string[];
  maxMembers: number;
  isActive: boolean;
  coverImageUrl: string | null;
}

export interface TeamDetailTabProps {
  context: TeamContext;
}

/** A member flagged by the Pulse "needs attention" check (reasons are stable keys). */
export interface TeamPulseNeedsAttention {
  user_id: string;
  first_name: string;
  reasons: string[];
  most_overdue_days: number | null;
}

/** Payload returned by the get_team_pulse(p_team_id) RPC (see docs/TEAMS_T3_BUILD.md §2). */
export interface TeamPulse {
  member_count: number;
  on_track: { n: number; total: number };
  workouts_this_week: { pct: number; completed: number; scheduled: number };
  weight_trend_avg_kg: number | null;
  nutrition_split: { deficit: number; maintenance: number; surplus: number; none: number };
  needs_attention: TeamPulseNeedsAttention[];
}
