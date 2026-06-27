// src/components/client-overview/workouts/WorkoutAdherencePulse.tsx
// At-a-glance hero for the coach's Workouts tab. Four MetricCards (the CC1
// Direction-3 standard shared with Pulse + Overview) so the Programs subsection
// reads continuously with the rest of the client shell.

import { MetricCard } from "@/components/ui/metric-card";
import type { Interpretation } from "@/lib/interpret";
import { Dumbbell, CalendarRange, TrendingUp, Timer } from "lucide-react";
import {
  type AdherencePulse,
  type ClientProgramSummary,
  weeksIntoProgram,
} from "./useClientWorkouts";

interface WorkoutAdherencePulseProps {
  pulse: AdherencePulse;
  loading: boolean;
}

export function WorkoutAdherencePulse({ pulse, loading }: WorkoutAdherencePulseProps) {
  const pct = pulse.weeklyCompletionPct;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      <MetricCard
        label="Active Program"
        icon={Dumbbell}
        value={loading ? "…" : pulse.activeProgram ? weeksLabel(pulse.activeProgram) : "—"}
        interpretation={
          loading
            ? undefined
            : pulse.activeProgram
              ? { tone: "on_track", label: "Active", sentence: pulse.activeProgram.title }
              : { tone: "neutral", label: "", sentence: "None assigned." }
        }
      />
      <MetricCard
        label="Last Workout"
        icon={Timer}
        value={loading ? "…" : pulse.lastWorkoutAt ? compactRelative(pulse.lastWorkoutAt) : "—"}
        interpretation={loading ? undefined : recencyInterp(pulse.lastWorkoutAt)}
      />
      <MetricCard
        label="This Week"
        icon={TrendingUp}
        value={loading ? "…" : pct != null ? `${pct}%` : "—"}
        interpretation={loading ? undefined : weeklyInterp(pct, pulse.weeklyCompleted, pulse.weeklyScheduled)}
      />
      <MetricCard
        label="Macrocycle"
        icon={CalendarRange}
        value={loading ? "…" : pulse.activeProgram?.macrocycleName ?? "Standalone"}
        interpretation={
          loading
            ? undefined
            : pulse.activeProgram?.macrocycleName
              ? { tone: "neutral", label: "Block", sentence: "Part of a training block." }
              : { tone: "neutral", label: "", sentence: "No block linked." }
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function weeksLabel(p: ClientProgramSummary): string {
  const w = weeksIntoProgram(p);
  if (w == null) return p.title.slice(0, 18);
  return `Week ${w}`;
}

function compactRelative(iso: string): string {
  const d = daysSince(iso);
  if (d == null) return "—";
  if (d === 0) {
    const hrs = Math.floor((Date.now() - new Date(iso).getTime()) / (60 * 60 * 1000));
    return hrs <= 0 ? "Just now" : `${hrs}h ago`;
  }
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d}d ago`;
  const wks = Math.floor(d / 7);
  return `${wks}w ago`;
}

function recencyInterp(iso: string | null): Interpretation {
  if (!iso) return { tone: "neutral", label: "", sentence: "No completions yet." };
  const d = daysSince(iso);
  if (d == null) return { tone: "neutral", label: "", sentence: "" };
  const when = absolute(iso);
  if (d <= 3) return { tone: "on_track", label: "Recent", sentence: `Logged ${when}.` };
  if (d <= 7) return { tone: "attention", label: "Slowing", sentence: `Logged ${when}.` };
  return { tone: "risk", label: "Stale", sentence: `Last logged ${when}.` };
}

function weeklyInterp(pct: number | null, done: number, scheduled: number): Interpretation {
  if (pct == null) return { tone: "neutral", label: "", sentence: "Nothing scheduled." };
  const sentence = `${done} / ${scheduled} done.`;
  if (pct >= 80) return { tone: "on_track", label: "On pace", sentence };
  if (pct >= 50) return { tone: "attention", label: "Behind", sentence };
  return { tone: "risk", label: "Off pace", sentence };
}

function absolute(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
