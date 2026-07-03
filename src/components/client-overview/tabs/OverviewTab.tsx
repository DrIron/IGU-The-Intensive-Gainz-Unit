import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Interpretation } from "@/lib/interpret";
import {
  Apple,
  Dumbbell,
  Scale,
  AlertCircle,
  ArrowRight,
  Calendar,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import type { ClientOverviewTabProps } from "../types";
import { DeloadRequestPanel } from "@/components/coach/clients/DeloadRequestPanel";
import { isBoardV2Enabled } from "@/lib/featureFlags";
import { resolveActiveAssignment, canonicalLastWorkoutAt } from "@/lib/canonicalScheduleAdapter";

interface OverviewStats {
  phaseName: string | null;
  phaseWeek: number | null;
  phaseGoal: string | null;
  lastWorkoutAt: string | null;
  lastWeighInKg: number | null;
  lastWeighInAt: string | null;
  pendingAdjustments: number;
}

const EMPTY: OverviewStats = {
  phaseName: null,
  phaseWeek: null,
  phaseGoal: null,
  lastWorkoutAt: null,
  lastWeighInKg: null,
  lastWeighInAt: null,
  pendingAdjustments: 0,
};

/**
 * At-a-glance client health: is this person on track? Three pillars --
 * nutrition phase, last workout, last weigh-in -- plus a pending-review nudge.
 * Each stat links or anchors into the tab that can action it.
 */
export function OverviewTab({ context }: ClientOverviewTabProps) {
  const navigate = useNavigate();
  const { clientUserId } = context;
  const [stats, setStats] = useState<OverviewStats>(EMPTY);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async (userId: string) => {
    setLoading(true);

    // Phase + pending adjustments hinge on the active phase id, so phase first.
    const { data: phase, error: phaseErr } = await supabase
      .from("nutrition_phases")
      .select("id, phase_name, goal_type, start_date")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (phaseErr) console.warn("[OverviewTab] phase:", phaseErr.message);

    // Last workout: the canonical "last logged set" (deload-aware) for the client's
    // active assignment. Null when there's no assignment, or a genuine "no workouts yet".
    const assignment = await resolveActiveAssignment(userId);
    const lastWorkoutAt = assignment ? await canonicalLastWorkoutAt(assignment.id) : null;

    // Latest weigh-in (across all phases; surface even if phase just rolled).
    const { data: weight, error: weightErr } = await supabase
      .from("weight_logs")
      .select("weight_kg, log_date")
      .eq("user_id", userId)
      .order("log_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (weightErr) console.warn("[OverviewTab] weight_logs:", weightErr.message);

    // Pending adjustments only meaningful if a phase exists.
    let pendingAdjustments = 0;
    if (phase?.id) {
      const { data: adj, error: adjErr } = await supabase
        .from("nutrition_adjustments")
        .select("id")
        .eq("phase_id", phase.id)
        .eq("status", "pending");
      if (adjErr) console.warn("[OverviewTab] nutrition_adjustments:", adjErr.message);
      pendingAdjustments = adj?.length ?? 0;
    }

    const phaseWeek = phase?.start_date
      ? Math.max(
          1,
          Math.floor((Date.now() - new Date(phase.start_date).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1,
        )
      : null;

    setStats({
      phaseName: phase?.phase_name ?? null,
      phaseWeek,
      phaseGoal: phase?.goal_type ?? null,
      lastWorkoutAt,
      lastWeighInKg: weight?.weight_kg ?? null,
      lastWeighInAt: weight?.log_date ?? null,
      pendingAdjustments,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (hasFetched.current === clientUserId) return;
    hasFetched.current = clientUserId;
    load(clientUserId).catch((err) => {
      console.error("[OverviewTab] unexpected:", err);
      setLoading(false);
    });
  }, [clientUserId, load]);

  return (
    <div className="space-y-6">
      {/* Phase 6 — client-initiated deload request panel. Self-hides when no pending.
          Deload v2 (docs/DELOAD_V2.md): retired under board_v2 — the request→approve gate is replaced
          by the on-demand insert flow (TakeDeloadCard in Workouts; coach notified via the thread). */}
      {!isBoardV2Enabled() && (
        <DeloadRequestPanel
          clientUserId={clientUserId}
          clientFirstName={context.profile.firstName}
        />
      )}

      {stats.pendingAdjustments > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 md:p-6 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">
                {stats.pendingAdjustments} nutrition{" "}
                {stats.pendingAdjustments === 1 ? "adjustment" : "adjustments"} awaiting review
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Approve or reject pending changes to keep the plan on track.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                navigate(`/coach/clients/${clientUserId}?tab=nutrition`)
              }
            >
              Review
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}

      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        At a glance
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 -mt-2">
        <MetricCard
          label="Nutrition Phase"
          icon={Apple}
          value={loading ? "…" : stats.phaseWeek != null ? `Week ${stats.phaseWeek}` : "—"}
          interpretation={loading ? undefined : phaseInterp(stats.phaseName, stats.phaseGoal)}
        />
        <MetricCard
          label="Last Workout"
          icon={Dumbbell}
          value={loading ? "…" : stats.lastWorkoutAt ? relative(stats.lastWorkoutAt) : "—"}
          interpretation={loading ? undefined : recencyInterp(stats.lastWorkoutAt, "workout", 3, 7)}
        />
        <MetricCard
          label="Last Weigh-in"
          icon={Scale}
          value={loading ? "…" : stats.lastWeighInKg != null ? `${stats.lastWeighInKg.toFixed(1)} kg` : "—"}
          interpretation={loading ? undefined : recencyInterp(stats.lastWeighInAt, "weigh-in", 7, 14)}
        />
      </div>

      {!loading && !stats.phaseName && !stats.lastWorkoutAt && !stats.lastWeighInKg && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            <Calendar className="h-6 w-6 mx-auto mb-2 opacity-50" aria-hidden="true" />
            Nothing recorded for this client yet. Start a nutrition phase or assign a
            program from the relevant tabs.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const GOAL_LABEL: Record<string, string> = {
  fat_loss: "Fat Loss",
  muscle_gain: "Muscle Gain",
  maintenance: "Maintenance",
};

function phaseInterp(name: string | null, goal: string | null): Interpretation {
  if (!name) return { tone: "neutral", label: "", sentence: "No active phase." };
  const goalLabel = goal ? GOAL_LABEL[goal] ?? goal : null;
  return { tone: "on_track", label: "Active", sentence: goalLabel ? `${name} · ${goalLabel}` : name };
}

function recencyInterp(
  iso: string | null,
  noun: string,
  okDays: number,
  warnDays: number,
): Interpretation {
  if (!iso) return { tone: "neutral", label: "", sentence: `No ${noun} yet.` };
  const d = daysSince(iso);
  if (d == null) return { tone: "neutral", label: "", sentence: "" };
  const when = d === 0 ? "today" : `${d}d ago`;
  if (d <= okDays) return { tone: "on_track", label: "Recent", sentence: `Last ${noun} ${when}.` };
  if (d <= warnDays) return { tone: "attention", label: "Slowing", sentence: `Last ${noun} ${when}.` };
  return { tone: "risk", label: "Stale", sentence: `Last ${noun} ${when}.` };
}

function relative(iso: string): string {
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}
