// src/lib/assignMacrocycle.ts
// Thin wrapper over the assign_macrocycle_to_client RPC. Fans out one
// client_programs row per mesocycle in the macrocycle, with start_dates
// staggered by cumulative week counts. Shares shape with assignProgram.ts.

import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/errorLogging";
import { isBoardV2Enabled } from "@/lib/featureFlags";
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
    // P5 macrocycle write cutover (board_v2): create N canonical client_plan_assignment
    // rows (one per mesocycle, staggered) as PRIMARY and write NO legacy client_programs.
    // All-or-nothing: if any mesocycle has no canonical plan, the RPC returns skipped and
    // we fall back to the legacy fan-out. Flag off → legacy fan-out, byte-identical.
    if (isBoardV2Enabled()) {
      const { data, error } = await supabase.rpc("assign_macrocycle_to_client_canonical", {
        p_coach_id: coachUserId,
        p_client_id: clientUserId,
        p_subscription_id: subscriptionId,
        p_macrocycle_id: macrocycleId,
        p_start_date: startIso,
        p_team_id: teamId || null,
        p_timezone: LEGACY_PROGRAM_TIMEZONE,
      });
      const res = data as { skipped: boolean; reason?: string; assignment_ids?: string[]; weeks_total?: number } | null;
      if (!error && res && !res.skipped) {
        // clientProgramIds now carries canonical assignment ids — the dialog only
        // uses it for the created count/toast (weeksTotal drives the preview).
        return {
          success: true,
          clientProgramIds: res.assignment_ids ?? [],
          weeksTotal: res.weeks_total ?? 0,
        };
      }
      // skipped:no_mirror_plan OR error → flag + fall through to the legacy fan-out.
      captureException(
        new Error("assign_macrocycle_to_client_canonical fell back to legacy"),
        {
          source: "assignMacrocycle_canonical_fallback",
          severity: "warning",
          metadata: {
            macrocycleId,
            reason: res?.skipped ? (res.reason ?? "no_mirror_plan") : error?.message ?? "unknown",
          },
        },
      );
    }

    // Legacy fan-out (flag off, OR canonical fallback above) — unchanged.
    const { data, error } = await supabase.rpc("assign_macrocycle_to_client", {
      p_coach_id: coachUserId,
      p_client_id: clientUserId,
      p_subscription_id: subscriptionId,
      p_macrocycle_id: macrocycleId,
      p_start_date: startIso,
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
