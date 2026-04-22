import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

    // Last workout requires program -> day -> module chain (no nested FK joins
    // per CLAUDE.md). Fetch active program ids first, then modules.
    const { data: programRows, error: programsErr } = await supabase
      .from("client_programs")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active");
    if (programsErr) console.warn("[OverviewTab] client_programs:", programsErr.message);

    let lastWorkoutAt: string | null = null;
    const programIds = (programRows ?? []).map((p) => p.id);
    if (programIds.length > 0) {
      const { data: dayRows, error: daysErr } = await supabase
        .from("client_program_days")
        .select("id")
        .in("client_program_id", programIds);
      if (daysErr) console.warn("[OverviewTab] client_program_days:", daysErr.message);

      const dayIds = (dayRows ?? []).map((d) => d.id);
      if (dayIds.length > 0) {
        const { data: modRows, error: modsErr } = await supabase
          .from("client_day_modules")
          .select("completed_at")
          .in("client_program_day_id", dayIds)
          .not("completed_at", "is", null)
          .order("completed_at", { ascending: false })
          .limit(1);
        if (modsErr) console.warn("[OverviewTab] client_day_modules:", modsErr.message);
        lastWorkoutAt = modRows?.[0]?.completed_at ?? null;
      }
    }

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
      {stats.pendingAdjustments > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex items-center gap-3">
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatTile
          icon={<Apple className="h-4 w-4" aria-hidden="true" />}
          label="Nutrition Phase"
          railColor={stats.phaseName ? "bg-emerald-500" : "bg-muted"}
          loading={loading}
          empty={!stats.phaseName}
          emptyLabel="No active phase"
          primary={stats.phaseWeek != null ? `Week ${stats.phaseWeek}` : "--"}
          secondary={stats.phaseName ?? undefined}
          tag={stats.phaseGoal ? goalBadge(stats.phaseGoal) : undefined}
        />

        <StatTile
          icon={<Dumbbell className="h-4 w-4" aria-hidden="true" />}
          label="Last Workout"
          railColor={workoutRail(stats.lastWorkoutAt)}
          loading={loading}
          empty={!stats.lastWorkoutAt}
          emptyLabel="No completions yet"
          primary={stats.lastWorkoutAt ? relative(stats.lastWorkoutAt) : "--"}
          secondary={stats.lastWorkoutAt ? absolute(stats.lastWorkoutAt) : undefined}
        />

        <StatTile
          icon={<Scale className="h-4 w-4" aria-hidden="true" />}
          label="Last Weigh-in"
          railColor={weightRail(stats.lastWeighInAt)}
          loading={loading}
          empty={!stats.lastWeighInKg}
          emptyLabel="No weigh-ins yet"
          primary={
            stats.lastWeighInKg != null ? `${stats.lastWeighInKg.toFixed(1)} kg` : "--"
          }
          secondary={stats.lastWeighInAt ? relative(stats.lastWeighInAt) : undefined}
        />
      </div>

      {!loading && !stats.phaseName && !stats.lastWorkoutAt && !stats.lastWeighInKg && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <Calendar className="h-6 w-6 mx-auto mb-2 opacity-50" aria-hidden="true" />
            Nothing recorded for this client yet. Start a nutrition phase or assign a
            program from the relevant tabs.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface StatTileProps {
  icon: React.ReactNode;
  label: string;
  railColor: string;
  primary: string;
  secondary?: string;
  tag?: React.ReactNode;
  loading: boolean;
  empty: boolean;
  emptyLabel: string;
}

function StatTile({
  icon,
  label,
  railColor,
  primary,
  secondary,
  tag,
  loading,
  empty,
  emptyLabel,
}: StatTileProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex">
          <div aria-hidden="true" className={cn("w-1 shrink-0", railColor)} />
          <div className="flex-1 p-4 md:p-5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
                {icon}
                <span>{label}</span>
              </div>
              {tag}
            </div>
            {loading ? (
              <div className="h-7 w-24 rounded bg-muted animate-pulse" />
            ) : empty ? (
              <p className="text-sm text-muted-foreground">{emptyLabel}</p>
            ) : (
              <div className="space-y-0.5">
                <p className="font-mono tabular-nums text-2xl md:text-3xl font-display leading-none">
                  {primary}
                </p>
                {secondary && (
                  <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                    {secondary}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function goalBadge(goalType: string): React.ReactNode {
  const map: Record<string, string> = {
    fat_loss: "Fat Loss",
    loss: "Fat Loss",
    muscle_gain: "Muscle Gain",
    gain: "Muscle Gain",
    maintenance: "Maintenance",
  };
  const label = map[goalType] ?? goalType;
  return (
    <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
      {label}
    </Badge>
  );
}

function relative(iso: string): string {
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

function absolute(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
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

function workoutRail(iso: string | null): string {
  const d = daysSince(iso);
  if (d == null) return "bg-muted";
  if (d <= 3) return "bg-emerald-500";
  if (d <= 7) return "bg-amber-500";
  return "bg-destructive";
}

function weightRail(iso: string | null): string {
  const d = daysSince(iso);
  if (d == null) return "bg-muted";
  if (d <= 7) return "bg-emerald-500";
  if (d <= 14) return "bg-amber-500";
  return "bg-destructive";
}
