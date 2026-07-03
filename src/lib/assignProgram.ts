/**
 * Shared program assignment logic.
 * Used by both AssignProgramDialog (1:1) and AssignTeamProgramDialog (team fan-out).
 *
 * Canonical-only: creates a client_plan_assignment against the template's mirror
 * plan (1:1 via assign_template_to_client_canonical; team via assign_team_plan).
 * No legacy client_programs is ever written.
 */

import { supabase } from "@/integrations/supabase/client";
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
  /** Legacy client_programs.id — only set on the legacy write path (flag off / fallback). */
  clientProgramId?: string;
  /** Canonical client_plan_assignment.id — set on the canonical-primary path (board_v2). */
  assignmentId?: string;
  error?: string;
}

// Legacy client_programs default. New canonical assignments mirror it so board-day
// boundaries ("today") resolve in the client's wall-clock, same as before.
const LEGACY_PROGRAM_TIMEZONE = "Asia/Kuwait";

export async function assignProgramToClient(
  params: AssignProgramParams
): Promise<AssignProgramResult> {
  const { coachUserId, clientUserId, subscriptionId, programTemplateId, startDate, teamId } = params;

  try {
    // Canonical-only: create the client_plan_assignment as PRIMARY (no legacy
    // client_programs row). If the template was never materialised to a canonical
    // plan (never opened/saved in the Planning Board), fail with a fixable
    // user-facing error instead of silently doing nothing.
    const { data, error } = await supabase.rpc("assign_template_to_client_canonical", {
      p_coach_id: coachUserId,
      p_client_id: clientUserId,
      p_subscription_id: subscriptionId,
      p_template_id: programTemplateId,
      p_start_date: format(startDate, "yyyy-MM-dd"),
      p_team_id: teamId || null,
      p_timezone: LEGACY_PROGRAM_TIMEZONE,
    });
    if (error) throw error;
    const res = data as { skipped: boolean; reason?: string; assignment_id?: string };
    if (res.skipped) {
      throw new Error(
        "This program isn't ready for assignment yet. Open it once in the Planning Board, then try again.",
      );
    }
    return { success: true, assignmentId: res.assignment_id };
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
 * Resolve a program_templates.id to its canonical plan.id (the P1 mirror plan),
 * mirroring how assign_plan_to_client resolves template -> plan internally:
 *   program_templates.id  (= muscle_program_templates.converted_program_id)
 *     -> muscle_program_templates.id
 *     -> plan.source_muscle_template_id
 * Two direct queries (CLAUDE.md bans nested PostgREST FK joins here). Returns the
 * newest matching plan, or null when the program was never opened/saved in the
 * Planning Board (no mirror plan yet).
 */
async function resolveCanonicalPlanIdForProgram(programTemplateId: string): Promise<string | null> {
  const { data: mtps, error: mErr } = await supabase
    .from("muscle_program_templates")
    .select("id")
    .eq("converted_program_id", programTemplateId);
  if (mErr) throw mErr;
  const mtpIds = (mtps ?? []).map((m) => m.id);
  if (mtpIds.length === 0) return null;

  const { data: plans, error: pErr } = await supabase
    .from("plan")
    .select("id")
    .in("source_muscle_template_id", mtpIds)
    .order("created_at", { ascending: false })
    .limit(1);
  if (pErr) throw pErr;
  return plans?.[0]?.id ?? null;
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
  const startIso = format(params.startDate, "yyyy-MM-dd");
  try {
    // Canonical-only: bind the team to ONE shared CLONE as PRIMARY via
    // assign_team_plan (members get canonical assignments, no legacy client_programs
    // fan-out). If the program has no canonical plan yet (never opened in the
    // Planning Board), return a fixable user-facing error.
    const planId = await resolveCanonicalPlanIdForProgram(params.programTemplateId);
    if (!planId) {
      return {
        success: false,
        error:
          "This program isn't ready for team assignment yet. Open it once in the Planning Board, then try again.",
      };
    }
    const { data, error } = await supabase.rpc("assign_team_plan", {
      p_team_id: params.teamId,
      p_plan_id: planId,
      p_start_date: startIso,
      p_clone: true,
    });
    if (error) throw error;
    // Map assign_team_plan's shape → the dialog's legacy-shaped result.
    // It's atomic (any member failure rolls back the whole txn), so members_failed = 0.
    const tp = data as {
      members_total: number;
      members_assigned: number;
      members_skipped: number;
      members: { user_id: string; subscription_id: string; assignment_id: string; status: string }[];
    };
    return {
      success: true,
      data: {
        team_id: params.teamId,
        members_total: tp.members_total,
        members_inserted: tp.members_assigned,
        members_skipped_existing: tp.members_skipped,
        members_failed: 0,
        members: tp.members.map((m) => ({
          user_id: m.user_id,
          subscription_id: m.subscription_id,
          client_program_id: null,
          status: m.status === "skipped_existing" ? "skipped_existing" : "created",
          error: null,
        })),
      },
    };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
