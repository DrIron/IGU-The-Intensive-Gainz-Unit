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
    // P5 write cutover (board_v2): create the canonical assignment as PRIMARY and
    // write NO legacy client_programs row. Falls back to the legacy write only when
    // the template has no canonical plan yet (never opened/saved in the Planning
    // Board) so an assignment is never blocked. Flag off → legacy write, byte-identical.
    if (isBoardV2Enabled()) {
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
      if (!res.skipped) {
        return { success: true, assignmentId: res.assignment_id };
      }
      // no_mirror_plan: the template was never materialised to a canonical plan.
      // Fall through to the legacy write so the assignment still happens, and flag
      // it (every active template must have a canonical plan before the legacy drop).
      captureException(new Error("assign canonical skipped: " + (res.reason ?? "unknown")), {
        source: "assign_template_to_client_canonical_fallback",
        severity: "warning",
        metadata: { programTemplateId, clientUserId },
      });
    }

    // Legacy write path (flag off, OR canonical fallback above).
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
    // P5 write cutover (board_v2): bind the team to ONE canonical shared CLONE as
    // PRIMARY via assign_team_plan (members get canonical assignments, no legacy
    // client_programs fan-out). T5: canonical-ONLY under board_v2 — no legacy
    // fallback. If the program has no canonical plan yet (never opened in the
    // Planning Board), return a fixable user-facing error instead of silently
    // writing legacy. Flag off → legacy fan-out, byte-identical (removed in Drop A).
    if (isBoardV2Enabled()) {
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
    }

    // Legacy fan-out — board_v2 OFF only (removed wholesale in Drop Stage A).
    const { data, error } = await supabase.rpc("assign_team_program_atomic", {
      p_team_id: params.teamId,
      p_template_id: params.programTemplateId,
      p_start_date: startIso,
    });
    if (error) throw error;
    return { success: true, data: data as unknown as AssignTeamProgramResult["data"] };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
