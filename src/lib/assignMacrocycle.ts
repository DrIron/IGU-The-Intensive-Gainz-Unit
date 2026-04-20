// src/lib/assignMacrocycle.ts
// Thin wrapper over the assign_macrocycle_to_client RPC. Fans out one
// client_programs row per mesocycle in the macrocycle, with start_dates
// staggered by cumulative week counts. Shares shape with assignProgram.ts.

import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import type { AssignMacrocycleResult } from "@/types/macrocycle";

export interface AssignMacrocycleParams {
  coachUserId: string;
  clientUserId: string;
  subscriptionId: string;
  macrocycleId: string;
  startDate: Date;
  teamId?: string;
}

export async function assignMacrocycleToClient(
  params: AssignMacrocycleParams
): Promise<AssignMacrocycleResult> {
  const { coachUserId, clientUserId, subscriptionId, macrocycleId, startDate, teamId } = params;

  try {
    const { data, error } = await supabase.rpc("assign_macrocycle_to_client", {
      p_coach_id: coachUserId,
      p_client_id: clientUserId,
      p_subscription_id: subscriptionId,
      p_macrocycle_id: macrocycleId,
      p_start_date: format(startDate, "yyyy-MM-dd"),
      p_team_id: teamId || null,
    });

    if (error) throw error;

    const result = data as { client_program_ids: string[]; weeks_total: number };
    return {
      success: true,
      clientProgramIds: result.client_program_ids,
      weeksTotal: result.weeks_total,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
