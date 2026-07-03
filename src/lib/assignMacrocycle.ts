// src/lib/assignMacrocycle.ts
// Thin wrapper over the assign_macrocycle_to_client_canonical RPC. Creates one
// canonical client_plan_assignment per mesocycle in the macrocycle, with
// start_dates staggered by cumulative week counts. Shares shape with assignProgram.ts.

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

// Legacy client_programs default. New canonical assignments mirror it so board-day
// boundaries ("today") resolve in the client's wall-clock, same as the 1:1/team cutover.
const LEGACY_PROGRAM_TIMEZONE = "Asia/Kuwait";

export async function assignMacrocycleToClient(
  params: AssignMacrocycleParams
): Promise<AssignMacrocycleResult> {
  const { coachUserId, clientUserId, subscriptionId, macrocycleId, startDate, teamId } = params;
  const startIso = format(startDate, "yyyy-MM-dd");

  try {
    // Canonical-only: create N client_plan_assignment rows (one per mesocycle,
    // staggered) as PRIMARY (no legacy client_programs fan-out). All-or-nothing —
    // if any mesocycle has no canonical plan the RPC returns skipped → fail with a
    // fixable user-facing error instead of silently doing nothing.
    const { data, error } = await supabase.rpc("assign_macrocycle_to_client_canonical", {
      p_coach_id: coachUserId,
      p_client_id: clientUserId,
      p_subscription_id: subscriptionId,
      p_macrocycle_id: macrocycleId,
      p_start_date: startIso,
      p_team_id: teamId || null,
      p_timezone: LEGACY_PROGRAM_TIMEZONE,
    });
    if (error) throw error;
    const res = data as { skipped: boolean; reason?: string; assignment_ids?: string[]; weeks_total?: number } | null;
    if (!res || res.skipped) {
      throw new Error(
        "This macrocycle isn't ready for assignment yet. Open each mesocycle once in the Planning Board, then try again.",
      );
    }
    // clientProgramIds now carries canonical assignment ids — the dialog only uses
    // it for the created count/toast (weeksTotal drives the preview).
    return {
      success: true,
      clientProgramIds: res.assignment_ids ?? [],
      weeksTotal: res.weeks_total ?? 0,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
