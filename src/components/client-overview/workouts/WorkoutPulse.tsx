// src/components/client-overview/workouts/WorkoutPulse.tsx
//
// Coach Workouts "Pulse" (redesign B3): the week at a glance — Adherence ·
// Tonnage · TUST (estimated) · PRs — then a "Needs your eyes" digest and this
// week's sessions with per-exercise progression flags + PRs. Data + logic come
// from useWorkoutPulse / prEngine / workoutFlags.

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/ui/metric-card";
import { Eye, TrendingUp, ArrowUp, ArrowDown, Minus, AlertTriangle, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { useWorkoutPulse, type PulseExerciseRow } from "./useWorkoutPulse";
import type { ProgressionFlag } from "@/utils/workoutFlags";
import type { Interpretation } from "@/lib/interpret";

export function WorkoutPulse({ clientUserId }: { clientUserId: string }) {
  const pulse = useWorkoutPulse(clientUserId);

  if (pulse.loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metric row — Direction 3 MetricCards. Tonnage + TUST live in History. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Adherence"
          value={pulse.adherencePct != null ? `${pulse.adherencePct}%` : "—"}
          interpretation={interpAdherence(pulse.adherencePct, pulse.weeklyCompleted, pulse.weeklyScheduled)}
        />
        <MetricCard
          label="PRs"
          value={String(pulse.prCount)}
          timeframe="this week"
          interpretation={interpPRs(pulse.prCount)}
        />
        <MetricCard
          label="Needs attention"
          value={String(pulse.flagCount)}
          interpretation={interpAttention(pulse.flagCount)}
        />
        <MetricCard
          label="Progressing"
          value={
            <>
              {pulse.progressingCount}
              <span className="text-sm text-muted-foreground">/{pulse.progressingTotal}</span>
            </>
          }
          interpretation={interpProgressing(pulse.progressingCount, pulse.progressingTotal)}
        />
      </div>

      {/* Needs your eyes */}
      {pulse.needsEyes.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">
              <Eye className="h-4 w-4" aria-hidden="true" />
              Needs your eyes · {pulse.needsEyes.length}
            </div>
            <div className="space-y-1.5 text-sm">
              {pulse.needsEyes.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <FlagGlyph flag={item.flag} />
                  <span>
                    <span className="font-medium">{item.exerciseName}</span>{" "}
                    <span className="text-muted-foreground">
                      {item.detail} · {item.sessionTitle}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* This week's sessions */}
      {pulse.sessions.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            <TrendingUp className="h-6 w-6 mx-auto mb-2 opacity-50" aria-hidden="true" />
            No completed sessions this week yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            This week's sessions vs last
          </p>
          {pulse.sessions.map((s) => (
            <Card key={s.moduleId} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="font-medium text-sm">
                    {s.title}{" "}
                    <span className="text-xs text-muted-foreground font-normal">
                      · {fmtDate(s.date)}
                    </span>
                  </span>
                  {s.prCount > 0 ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    >
                      Done · {s.prCount} PR{s.prCount === 1 ? "" : "s"}
                    </Badge>
                  ) : s.flagged > 0 ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    >
                      {s.flagged} flag{s.flagged === 1 ? "" : "s"}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      Done
                    </Badge>
                  )}
                </div>
                <div className="space-y-1.5">
                  {s.exercises.map((ex) => (
                    <ExerciseRow key={ex.exerciseId} row={ex} />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground pt-1">
            <LegendItem flag="up" label="up" />
            <LegendItem flag="stale" label="stale (2+ same)" />
            <LegendItem flag="down" label="down" />
            <LegendItem flag="off_prescription" label="off-prescription" />
          </div>
        </div>
      )}
    </div>
  );
}

function ExerciseRow({ row }: { row: PulseExerciseRow }) {
  const topPr = row.prs.find((p) => p.celebrate);
  return (
    <div className="flex items-center gap-2 text-sm">
      <FlagGlyph flag={row.flag} />
      <span className="truncate">{row.name}</span>
      {topPr && (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 shrink-0">
          <Trophy className="h-3 w-3" aria-hidden="true" />
          {topPr.label}
        </span>
      )}
      {row.summary && (
        <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums shrink-0">
          {row.summary}
        </span>
      )}
    </div>
  );
}

function interpAdherence(pct: number | null, done: number, scheduled: number): Interpretation {
  const sentence = `${done} of ${scheduled} sessions this week.`;
  if (pct == null) return { tone: "neutral", label: "", sentence: "No sessions scheduled." };
  if (pct >= 80) return { tone: "on_track", label: "On track", sentence };
  if (pct >= 50) return { tone: "attention", label: "Slipping", sentence };
  return { tone: "risk", label: "Low", sentence };
}

function interpPRs(count: number): Interpretation {
  if (count > 0)
    return { tone: "on_track", label: "PRs", sentence: `${count} personal record${count === 1 ? "" : "s"} this week.` };
  return { tone: "neutral", label: "", sentence: "No PRs yet this week." };
}

function interpAttention(flags: number): Interpretation {
  if (flags <= 0) return { tone: "on_track", label: "Clear", sentence: "Nothing flagged this week." };
  return {
    tone: flags >= 3 ? "risk" : "attention",
    label: `${flags}`,
    sentence: `${flags} flag${flags === 1 ? "" : "s"} to review.`,
  };
}

function interpProgressing(up: number, total: number): Interpretation {
  if (total <= 0) return { tone: "neutral", label: "", sentence: "No lifts to compare yet." };
  const sentence = `${up} of ${total} lifts up vs last session.`;
  return { tone: up / total >= 0.5 ? "on_track" : "attention", label: `${up}/${total}`, sentence };
}

function FlagGlyph({ flag }: { flag: ProgressionFlag }) {
  switch (flag) {
    case "up":
      return <ArrowUp className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="up" />;
    case "down":
      return <ArrowDown className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="down" />;
    case "stale":
      return <Minus className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="stale" />;
    case "off_prescription":
      return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="off prescription" />;
    case "none":
      return <span className="w-3.5 shrink-0" aria-hidden="true" />;
  }
}

function LegendItem({ flag, label }: { flag: ProgressionFlag; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <FlagGlyph flag={flag} />
      {label}
    </span>
  );
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}
