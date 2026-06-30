// src/components/client-overview/useClientVitals.ts
//
// Data source for the persistent Client Vitals rail (redesign B1 --
// docs/COACH_CLIENT_REDESIGN.md). Answers "is this client on track?" at a
// glance: next check-in, weight -> target, adherence, last workout.
//
// RLS split (verified against prod 2026-06-26):
//   - Coaches read weight_logs / adherence_logs / nutrition_adjustments ONLY
//     when the linked phase's coach_id matches them (the "phase.coach_id trap").
//     nutrition_phases itself is visible via the broader
//     is_active_coach_for_client(), so a phase can be visible while its weigh-in
//     series silently returns empty.
//   - To keep the HEADLINE gated numbers (adherence %, last weigh-in -> next
//     check-in) parity-safe with the coach roster AND immune to the trap, they
//     come from the SECURITY DEFINER get_coach_roster_stats() RPC (reused via
//     useCoachRosterStats). It also folds in the team (weekly_progress) vs 1:1
//     (adherence_logs) adherence split so we never reimplement it here.
//   - Phase details, the weigh-in sparkline series and last-workout time use
//     degrade-safe direct reads, mirroring the shipped OverviewTab. Empty reads
//     render a calm "no data" state rather than crashing.
//
// PRs are intentionally absent: PR detection is in-session only (no persisted
// record). Generalising the A3 detector for a coach-side query is B3 -- the rail
// leaves a structured slot for the PR chips to drop into then.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCoachRosterStats } from "@/hooks/useCoachRosterStats";
import { isBoardV2Enabled } from "@/lib/featureFlags";
import { resolveActiveAssignment, canonicalLastWorkoutAt } from "@/lib/canonicalScheduleAdapter";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SPARKLINE_POINTS = 12;

export interface ClientVitals {
  loading: boolean;
  /** Active nutrition phase. */
  phaseName: string | null;
  phaseWeek: number | null;
  goalType: string | null;
  targetWeightKg: number | null;
  /** Latest weigh-in value + the recent series (oldest -> newest) for the sparkline. */
  latestWeightKg: number | null;
  weightSeries: number[];
  /** Gated roster-stats numbers (parity with the coach roster). */
  adherencePct: number | null;
  lastWeighInDate: string | null;
  /** Derived: last weigh-in + 7d. Matches get_coach_roster_attention's overdue rule. */
  nextCheckInDate: string | null;
  hasProgram: boolean;
  /** Most recent completed workout module. */
  lastWorkoutAt: string | null;
  /** Pending nutrition adjustments on the active phase. */
  pendingAdjustments: number;
}

const EMPTY: ClientVitals = {
  loading: true,
  phaseName: null,
  phaseWeek: null,
  goalType: null,
  targetWeightKg: null,
  latestWeightKg: null,
  weightSeries: [],
  adherencePct: null,
  lastWeighInDate: null,
  nextCheckInDate: null,
  hasProgram: false,
  lastWorkoutAt: null,
  pendingAdjustments: 0,
};

interface DirectReads {
  phaseName: string | null;
  phaseWeek: number | null;
  goalType: string | null;
  targetWeightKg: number | null;
  latestWeightKg: number | null;
  weightSeries: number[];
  lastWorkoutAt: string | null;
  pendingAdjustments: number;
}

const EMPTY_DIRECT: DirectReads = {
  phaseName: null,
  phaseWeek: null,
  goalType: null,
  targetWeightKg: null,
  latestWeightKg: null,
  weightSeries: [],
  lastWorkoutAt: null,
  pendingAdjustments: 0,
};

/**
 * Persistent client vitals for the coach detail rail. Composes the gated
 * roster-stats RPC (adherence, last weigh-in) with degrade-safe direct reads
 * (phase, weigh-in series, last workout, pending adjustments).
 */
export function useClientVitals(clientUserId: string): ClientVitals {
  const { stats: rosterStats, loading: rosterLoading } = useCoachRosterStats();
  const [direct, setDirect] = useState<DirectReads>(EMPTY_DIRECT);
  const [directLoading, setDirectLoading] = useState(true);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async (userId: string) => {
    setDirectLoading(true);

    // Active phase first -- pending adjustments hinge on its id.
    const { data: phase, error: phaseErr } = await supabase
      .from("nutrition_phases")
      .select("id, phase_name, goal_type, start_date, target_weight_kg")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (phaseErr) console.warn("[useClientVitals] phase:", phaseErr.message);

    // board_v2: the last-workout time comes from the canonical assignment's set
    // logs (deload-aware), so the legacy client_programs lookup is skipped.
    const boardV2 = isBoardV2Enabled();

    // The remaining reads are independent -- fan out in parallel.
    const programIdsPromise = boardV2
      ? Promise.resolve({ data: [] as { id: string }[], error: null })
      : supabase
          .from("client_programs")
          .select("id")
          .eq("user_id", userId)
          .eq("status", "active");

    const weightPromise = supabase
      .from("weight_logs")
      .select("weight_kg, log_date")
      .eq("user_id", userId)
      .order("log_date", { ascending: false })
      .limit(SPARKLINE_POINTS);

    const adjustmentsPromise = phase?.id
      ? supabase
          .from("nutrition_adjustments")
          .select("id")
          .eq("phase_id", phase.id)
          .eq("status", "pending")
      : Promise.resolve({ data: [], error: null });

    const [programRes, weightRes, adjRes] = await Promise.all([
      programIdsPromise,
      weightPromise,
      adjustmentsPromise,
    ]);

    if (programRes.error)
      console.warn("[useClientVitals] client_programs:", programRes.error.message);
    if (weightRes.error)
      console.warn("[useClientVitals] weight_logs:", weightRes.error.message);
    if (adjRes.error)
      console.warn("[useClientVitals] nutrition_adjustments:", adjRes.error.message);

    // Last workout. board_v2: newest logged set on the active canonical
    // assignment (deload-aware; the legacy snapshot goes stale post-deload).
    // Flag off: legacy program -> day -> module chain (no nested FK joins per
    // CLAUDE.md). Coach-context canonical read relies on the
    // exercise_set_logs_canonical_coach_select RLS policy (20260630061546).
    let lastWorkoutAt: string | null = null;
    if (boardV2) {
      const assignment = await resolveActiveAssignment(userId);
      lastWorkoutAt = assignment ? await canonicalLastWorkoutAt(assignment.id) : null;
    } else {
      const programIds = (programRes.data ?? []).map((p) => p.id);
      if (programIds.length > 0) {
        const { data: dayRows, error: daysErr } = await supabase
          .from("client_program_days")
          .select("id")
          .in("client_program_id", programIds);
        if (daysErr) console.warn("[useClientVitals] client_program_days:", daysErr.message);

        const dayIds = (dayRows ?? []).map((d) => d.id);
        if (dayIds.length > 0) {
          const { data: modRows, error: modsErr } = await supabase
            .from("client_day_modules")
            .select("completed_at")
            .in("client_program_day_id", dayIds)
            .not("completed_at", "is", null)
            .order("completed_at", { ascending: false })
            .limit(1);
          if (modsErr) console.warn("[useClientVitals] client_day_modules:", modsErr.message);
          lastWorkoutAt = modRows?.[0]?.completed_at ?? null;
        }
      }
    }

    // weight_logs came back newest-first; the series renders oldest -> newest.
    const weightRows = (weightRes.data ?? []) as Array<{ weight_kg: number; log_date: string }>;
    const latestWeightKg = weightRows[0]?.weight_kg ?? null;
    const weightSeries = weightRows
      .map((w) => w.weight_kg)
      .filter((n): n is number => typeof n === "number")
      .reverse();

    const phaseWeek = phase?.start_date
      ? Math.max(
          1,
          Math.floor((Date.now() - new Date(phase.start_date).getTime()) / WEEK_MS) + 1,
        )
      : null;

    setDirect({
      phaseName: phase?.phase_name ?? null,
      phaseWeek,
      goalType: phase?.goal_type ?? null,
      targetWeightKg: phase?.target_weight_kg ?? null,
      latestWeightKg,
      weightSeries,
      lastWorkoutAt,
      pendingAdjustments: adjRes.data?.length ?? 0,
    });
    setDirectLoading(false);
  }, []);

  useEffect(() => {
    if (hasFetched.current === clientUserId) return;
    hasFetched.current = clientUserId;
    load(clientUserId).catch((err) => {
      console.error("[useClientVitals] unexpected:", err);
      setDirectLoading(false);
    });
  }, [clientUserId, load]);

  const stat = rosterStats[clientUserId];
  const lastWeighInDate = stat?.last_weigh_in_date ?? null;
  const nextCheckInDate = lastWeighInDate
    ? new Date(new Date(lastWeighInDate).getTime() + WEEK_MS).toISOString()
    : null;

  return {
    loading: directLoading || rosterLoading,
    phaseName: direct.phaseName,
    phaseWeek: direct.phaseWeek,
    goalType: direct.goalType,
    targetWeightKg: direct.targetWeightKg,
    latestWeightKg: direct.latestWeightKg,
    weightSeries: direct.weightSeries,
    adherencePct: stat?.adherence_pct ?? null,
    lastWeighInDate,
    nextCheckInDate,
    hasProgram: stat?.has_program ?? false,
    lastWorkoutAt: direct.lastWorkoutAt,
    pendingAdjustments: direct.pendingAdjustments,
  };
}
