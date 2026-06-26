// src/components/client-overview/workouts/WorkoutTrendCards.tsx
//
// Tonnage + TUST trend cards for the Workouts History tab (redesign RD3). These
// were demoted from the Pulse headline -- they read better as 6-week trends
// than as single glance numbers. Reuses useWorkoutPulse (mounts only when the
// History tab is active).

import { MetricCard } from "@/components/ui/metric-card";
import { useWorkoutPulse } from "./useWorkoutPulse";
import type { Interpretation } from "@/lib/interpret";

export function WorkoutTrendCards({ clientUserId }: { clientUserId: string }) {
  const p = useWorkoutPulse(clientUserId);

  if (p.loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="h-28 rounded-xl bg-muted animate-pulse" />
        <div className="h-28 rounded-xl bg-muted animate-pulse" />
      </div>
    );
  }

  const tonWoW =
    p.prevTonnageKg > 0
      ? Math.round(((p.tonnageKg - p.prevTonnageKg) / p.prevTonnageKg) * 100)
      : null;
  const tonInterp: Interpretation = {
    tone: tonWoW == null ? "neutral" : tonWoW >= 0 ? "on_track" : "attention",
    label: "",
    sentence: "",
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <MetricCard
        label="Tonnage"
        value={fmtTonnage(p.tonnageKg)}
        timeframe="6 wk"
        spark={p.weeklyTonnage}
        delta={tonWoW != null ? { value: tonWoW, suffix: "%" } : undefined}
        interpretation={tonInterp}
      />
      <MetricCard
        label="TUST · est"
        value={fmtMinutes(p.tustSeconds)}
        timeframe="6 wk"
        spark={p.weeklyTust}
        interpretation={{ tone: "neutral", label: "", sentence: "Working-set time under tension, estimated from tempo." }}
      />
    </div>
  );
}

function fmtTonnage(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`;
  return `${kg}kg`;
}

function fmtMinutes(seconds: number): string {
  if (seconds <= 0) return "—";
  return `${Math.round(seconds / 60)}m`;
}
