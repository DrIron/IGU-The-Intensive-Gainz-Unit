import { useNavigate } from "react-router-dom";
import { Activity, Dumbbell, TrendingDown, Users, AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { ClickableCard } from "@/components/ui/clickable-card";
import type { Interpretation, Tone } from "@/lib/interpret";
import type { TeamDetailTabProps, TeamPulse } from "../team-types";
import { useTeamPulse } from "../useTeamPulse";

/** Tone for a "share of total" metric: >=70% on-track, >=40% attention, else risk. */
function shareTone(n: number, total: number): Tone {
  if (total === 0) return "neutral";
  const r = n / total;
  return r >= 0.7 ? "on_track" : r >= 0.4 ? "attention" : "risk";
}

/** Short badge label per tone (Interpretation.label). */
const TONE_LABEL: Record<Tone, string> = {
  on_track: "On track",
  attention: "Watch",
  risk: "At risk",
  neutral: "—",
};

/** Stable needs-attention reason keys -> coach-facing labels. */
const REASON_LABELS: Record<string, string> = {
  no_recent_workout: "No workout in 7+ days",
  no_active_phase: "No active nutrition phase",
  pending_adjustment: "Pending nutrition adjustment",
};

export function TeamPulseTab({ context }: TeamDetailTabProps) {
  const navigate = useNavigate();
  const state = useTeamPulse(context.teamId);

  if (state.kind === "loading") {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-destructive">
          Couldn't load team pulse: {state.message}
        </CardContent>
      </Card>
    );
  }

  const p: TeamPulse = state.pulse;
  const onTrackTone = shareTone(p.on_track.n, p.on_track.total);
  const workoutsTone =
    p.workouts_this_week.pct >= 70 ? "on_track" : p.workouts_this_week.pct >= 40 ? "attention" : "risk";
  const weight = p.weight_trend_avg_kg;
  const weightInterp: Interpretation =
    weight == null
      ? { tone: "neutral", label: "No data", sentence: "No weight data yet." }
      : { tone: "neutral", label: "Trend", sentence: "Avg change vs phase start across members with data." };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="On track"
          icon={Activity}
          value={`${p.on_track.n}/${p.on_track.total}`}
          interpretation={{
            tone: onTrackTone,
            label: TONE_LABEL[onTrackTone],
            sentence: "Active phase + a workout in the last 7 days.",
          }}
        />
        <MetricCard
          label="Workouts this week"
          icon={Dumbbell}
          value={`${p.workouts_this_week.pct}%`}
          interpretation={{
            tone: workoutsTone,
            label: TONE_LABEL[workoutsTone],
            sentence: `${p.workouts_this_week.completed}/${p.workouts_this_week.scheduled} sessions completed.`,
          }}
        />
        <MetricCard
          label="Avg weight trend"
          icon={TrendingDown}
          value={weight == null ? "--" : weight.toFixed(1)}
          unit={weight == null ? undefined : "kg"}
          interpretation={weightInterp}
        />
        <MetricCard
          label="Members"
          icon={Users}
          value={p.member_count}
          interpretation={{
            tone: "neutral",
            label: "Split",
            sentence: `${p.nutrition_split.deficit} cutting · ${p.nutrition_split.maintenance} maintaining · ${p.nutrition_split.surplus} gaining · ${p.nutrition_split.none} no phase.`,
          }}
        />
      </div>

      {/* Needs attention — worst first; each links to the member's (view-only) detail. */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
          Needs attention
          <span className="text-xs text-muted-foreground">({p.needs_attention.length})</span>
        </div>
        {p.needs_attention.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Everyone's on track — no members flagged.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {p.needs_attention.map((m) => (
              <ClickableCard
                key={m.user_id}
                ariaLabel={`Open ${m.first_name}'s detail`}
                onClick={() => navigate(`/coach/clients/${m.user_id}`)}
              >
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{m.first_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.reasons.map((r) => REASON_LABELS[r] ?? r).join(" · ")}
                    </p>
                  </div>
                  {m.most_overdue_days != null && (
                    <span className="shrink-0 text-xs font-mono text-amber-600 dark:text-amber-400 tabular-nums">
                      {m.most_overdue_days}d
                    </span>
                  )}
                </CardContent>
              </ClickableCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
