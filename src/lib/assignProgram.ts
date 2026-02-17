/**
 * Shared program assignment logic.
 * Used by both AssignProgramDialog (1:1) and AssignTeamProgramDialog (team fan-out).
 *
 * Calls the assign_program_to_client RPC which deep-copies the entire program
 * template hierarchy (days, modules, exercises, prescriptions, threads) in a
 * single atomic transaction.
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
    return { success: true, clientProgramId: result.client_program_id };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
