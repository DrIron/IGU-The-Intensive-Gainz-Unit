/**
 * Shared program assignment logic.
 * Used by both AssignProgramDialog (1:1) and AssignTeamProgramDialog (team fan-out).
 *
 * Calls the assign_program_to_client RPC which deep-copies the entire program
 * template hierarchy (days, modules, exercises, prescriptions, threads) in a
 * single atomic transaction.
 */

import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/errorLogging";
import { isBoardV2Enabled } from "@/lib/featureFlags";
import { format } from "date-fns";

export interface AssignProgramParams {
  coachUserId: string;
  clientUserId: string;
  subscriptionId: string;
  programTemplateId: string;
  startDate: Date;
  teamId?: string;
}

export interface AssignProgramResult {
  success: boolean;
  clientProgramId?: string;
  error?: string;
}

export async function assignProgramToClient(
  params: AssignProgramParams
): Promise<AssignProgramResult> {
  const { coachUserId, clientUserId, subscriptionId, programTemplateId, startDate, teamId } = params;

  try {
    const { data, error } = await supabase.rpc("assign_program_to_client", {
      p_coach_id: coachUserId,
      p_client_id: clientUserId,
      p_subscription_id: subscriptionId,
      p_template_id: programTemplateId,
      p_start_date: format(startDate, "yyyy-MM-dd"),
      p_team_id: teamId || null,
    });

    if (error) throw error;

    const result = data as { client_program_id: string };

    // P2 (program system unification): dual-write the canonical client_plan_assignment
    // for the 1:1 path only. Team assignments (teamId set) are out of scope — the Teams
    // track owns the shared team plan + fan-out. Best-effort/fire-and-forget like P1:
    // legacy client_programs stays authoritative, so a mirror failure (or a template with
    // no P1 mirror plan yet) must never fail the assignment. assign_plan_to_client copies
    // straight from the legacy row and skips gracefully when no mirror plan exists.
    if (!teamId && result.client_program_id) {
      try {
        // S1 own-your-copy: under board_v2, the canonical assignment follows a
        // CLONE of the template plan (assignee owns their copy). Off (prod
        // default) keeps the legacy shared-reference path — assignment.plan_id =
        // the template's mirror plan. See docs/PROGRAM_ASSIGNMENT_SYNC.md §S1.
        const { error: mirrorError } = await supabase.rpc("assign_plan_to_client", {
          p_client_program_id: result.client_program_id,
          p_clone: isBoardV2Enabled(),
        });
        if (mirrorError) throw mirrorError;
      } catch (mirrorError: unknown) {
        captureException(mirrorError, {
          source: "assign_plan_to_client_mirror",
          severity: "warning",
          metadata: { clientProgramId: result.client_program_id },
        });
      }
    }

    return { success: true, clientProgramId: result.client_program_id };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export interface TeamProgramMemberResult {
  user_id: string;
  subscription_id: string;
  client_program_id: string | null;
  status: "created" | "skipped_existing" | "failed";
  error: string | null;
}

export interface AssignTeamProgramResult {
  success: boolean;
  data?: {
    team_id: string;
    members_total: number;
    members_inserted: number;
    members_skipped_existing: number;
    members_failed: number;
    members: TeamProgramMemberResult[];
  };
  error?: string;
}

/**
 * Team fan-out via the atomic RPC (B7-N7). One locked server round-trip:
 * assigns the program to every active member, sets coach_teams.current_program_template_id,
 * and returns per-member status. Idempotent re-runs report skipped_existing.
 */
export async function assignTeamProgram(params: {
  teamId: string;
  programTemplateId: string;
  startDate: Date;
}): Promise<AssignTeamProgramResult> {
  try {
    const { data, error } = await supabase.rpc("assign_team_program_atomic", {
      p_team_id: params.teamId,
      p_template_id: params.programTemplateId,
      p_start_date: format(params.startDate, "yyyy-MM-dd"),
    });

    if (error) throw error;

    return { success: true, data: data as AssignTeamProgramResult["data"] };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
