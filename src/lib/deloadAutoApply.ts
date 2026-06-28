/**
 * Deload auto-apply — when a coach APPROVES a deload request, write a week-level
 * client_plan_override so the client's canonical program actually deloads (previously the
 * approval recorded approved_week_offset / applied_preset_id but did nothing).
 *
 * Offset semantics (DOCUMENTED): despite the column name `approved_week_offset`, the coach UI
 * (DeloadRequestPanel "Week" input, 1–52, "W4" copy) and this code treat it as the ABSOLUTE
 * 1-based plan week_index to deload. When omitted, we default to the client's CURRENT week by
 * date (floor((today − start_date)/7)+1). Always clamped to [1, weekCount].
 *
 * Best-effort + additive: a missing canonical assignment (not yet seeded) just logs and skips —
 * the legacy deload_requests update is unaffected.
 */

import { supabase } from "@/integrations/supabase/client";
import { resolveWeekIndexForDate } from "@/lib/canonicalSessionResolver";

/** Resolve the 1-based plan week_index to deload. Pure + clamped. */
export function resolveDeloadTargetWeekIndex(
  approvedWeekOffset: number | null | undefined,
  startDateIso: string,
  todayIso: string,
  weekCount: number,
): number {
  const clamp = (n: number) => Math.max(1, weekCount > 0 ? Math.min(n, weekCount) : n);
  if (approvedWeekOffset != null && Number.isFinite(approvedWeekOffset)) {
    return clamp(Math.floor(approvedWeekOffset));
  }
  return resolveWeekIndexForDate(startDateIso, todayIso, weekCount); // current week by date
}

export interface ApplyApprovedDeloadResult {
  applied: boolean;
  reason?: string;
  planWeekId?: string;
  weekIndex?: number;
}

/**
 * Resolve the client's active assignment + target plan_week, then write a week-level deload
 * override via save_client_plan_override. Never throws — returns a result the caller can log.
 */
export async function applyApprovedDeload(
  clientUserId: string,
  approvedWeekOffset: number | null | undefined,
  appliedPresetId: string | null | undefined,
): Promise<ApplyApprovedDeloadResult> {
  try {
    const { data: assignment } = await supabase
      .from("client_plan_assignment")
      .select("id, plan_id, start_date")
      .eq("client_id", clientUserId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!assignment) return { applied: false, reason: "no_active_assignment" };

    const { data: weeks } = await supabase
      .from("plan_weeks")
      .select("id, week_index")
      .eq("plan_id", assignment.plan_id)
      .order("week_index");
    if (!weeks || weeks.length === 0) return { applied: false, reason: "no_plan_weeks" };

    const todayIso = new Date().toISOString().slice(0, 10);
    const targetIndex = resolveDeloadTargetWeekIndex(
      approvedWeekOffset,
      assignment.start_date,
      todayIso,
      weeks.length,
    );
    const week = weeks.find((w) => w.week_index === targetIndex) ?? weeks[weeks.length - 1];

    const { error } = await supabase.rpc("save_client_plan_override", {
      p_assignment_id: assignment.id,
      p_target_type: "week",
      p_target_id: week.id,
      p_override_json: { is_deload: true, deload_preset_id: appliedPresetId ?? null } as never,
      p_removed: false,
    });
    if (error) return { applied: false, reason: error.message };

    return { applied: true, planWeekId: week.id, weekIndex: week.week_index };
  } catch (e) {
    return { applied: false, reason: e instanceof Error ? e.message : "unknown" };
  }
}
