import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Flame, Utensils, CalendarCheck } from "lucide-react";
import {
  PhaseAnnotatedTrendChart,
  type TrendSeries,
} from "@/components/client-overview/charts/PhaseAnnotatedTrendChart";
import { STATUS_DOT } from "@/components/nutrition/adherenceBandStyles";
import { useNutritionIntakeHistory } from "./useNutritionIntakeHistory";
import { NutritionMicroTrends } from "./NutritionMicroTrends";

/**
 * Nutrition intake History & Trends (P5b) — reusable on the coach nutrition History tab and on
 * the client's /nutrition page. Three panels: calories vs target, macro trends, and a compact
 * 8-week logging & adherence strip.
 *
 * The honesty rules from P5a hold here too: an unlogged day is a hollow dot (never red), and an
 * empty adherence window is a neutral note, never an off-track verdict. All of that lives in
 * the pure adherence module and the shared STATUS_DOT map — this component only arranges it.
 *
 * `viewerRole` gates the dietitian/admin-only micronutrient trends panel (P5b extension):
 * calories + macros are visible to coach and client alike, but per-nutrient micro trends render
 * only for a dietitian/admin — and the hook only hands this component a micros map for those
 * roles, so the gate is enforced at the data source, not just in the markup.
 */

// Chart line colours (recharts needs literal strings). Crimson = intake, muted slate = target
// reference; macros use the app's macro palette hexes.
const COLOR_INTAKE = "#d81b2a";
const COLOR_TARGET = "#94a3b8";
const COLOR_PROTEIN = "#dc2626";
const COLOR_FAT = "#f59e0b";
const COLOR_CARBS = "#3b82f6";

export interface NutritionIntakeHistoryProps {
  clientUserId: string;
  viewerRole?: "client" | "coach" | "dietitian" | "admin";
}

export function NutritionIntakeHistory({ clientUserId, viewerRole }: NutritionIntakeHistoryProps) {
  const { intake, target, protein, fat, carbs, phases, adherence, hasTargetHistory, microsByDay, loading } =
    useNutritionIntakeHistory(clientUserId, viewerRole);

  const showMicros = viewerRole === "dietitian" || viewerRole === "admin";

  const calorieSeries: TrendSeries[] = [
    { key: "intake", name: "Intake", color: COLOR_INTAKE, points: intake },
    { key: "target", name: "Target", color: COLOR_TARGET, points: target },
  ];
  const macroSeries: TrendSeries[] = [
    { key: "protein", name: "Protein", color: COLOR_PROTEIN, points: protein },
    { key: "fat", name: "Fat", color: COLOR_FAT, points: fat },
    { key: "carbs", name: "Carbs", color: COLOR_CARBS, points: carbs },
  ];

  return (
    <div className="space-y-5">
      <PhaseAnnotatedTrendChart
        title="Calorie intake vs target"
        description="daily logged calories against the coach target in effect"
        icon={Flame}
        series={calorieSeries}
        phases={phases}
        unit="kcal"
        formatValue={(v) => Math.round(v).toLocaleString()}
        emptyLabel="Not enough logged days yet to chart calorie intake."
      />

      <PhaseAnnotatedTrendChart
        title="Macro trends"
        description="daily logged protein, fat and carbs"
        icon={Utensils}
        series={macroSeries}
        phases={phases}
        unit="g"
        formatValue={(v) => `${Math.round(v)}`}
        emptyLabel="Not enough logged days yet to chart macros."
      />

      <AdherenceStrip
        adherence={adherence}
        hasTargetHistory={hasTargetHistory}
        loading={loading}
      />

      {/* Dietitian/admin only. A coach's `microsByDay` is empty by construction (gated in the
          hook), so even if this rendered for a coach it would show nothing — but we gate here
          too so the panel doesn't appear at all. */}
      {showMicros && (
        <NutritionMicroTrends clientUserId={clientUserId} microsByDay={microsByDay} phases={phases} />
      )}
    </div>
  );
}

function AdherenceStrip({
  adherence,
  hasTargetHistory,
  loading,
}: {
  adherence: ReturnType<typeof useNutritionIntakeHistory>["adherence"];
  hasTargetHistory: boolean;
  loading: boolean;
}) {
  const { perDay, adherentPct, loggedDays, totalDays, streak } = adherence;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
          Logging &amp; adherence · last 8 weeks
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-10" />
        ) : loggedDays === 0 ? (
          // Empty window — NEUTRAL, never an off-track/red verdict. Nothing failed; nothing
          // was logged.
          <p className="py-1 text-sm text-muted-foreground" data-empty-adherence>
            No food logged in the last 8 weeks.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-sm tabular-nums">
              <span>
                <span className="text-foreground">{loggedDays}</span>
                <span className="text-muted-foreground">/{totalDays} days logged</span>
              </span>
              {hasTargetHistory && adherentPct != null && (
                <span>
                  <span className="text-foreground">{adherentPct}%</span>
                  <span className="text-muted-foreground"> on target when logged</span>
                </span>
              )}
              {streak > 0 && (
                <span>
                  <span className="text-foreground">{streak}</span>
                  <span className="text-muted-foreground"> day streak</span>
                </span>
              )}
            </div>

            {/* One dot per day, oldest → newest. not_logged is a hollow ring, never red. */}
            <div
              className="flex flex-wrap gap-1"
              role="img"
              aria-label="Daily logging over the last 8 weeks, oldest to newest"
            >
              {perDay.map((band, i) => (
                <span
                  key={i}
                  data-day-dot={band}
                  aria-hidden
                  className={cn("h-2.5 w-2.5 rounded-full", STATUS_DOT[band])}
                />
              ))}
            </div>

            {!hasTargetHistory && (
              // Logged, but no coach phase to measure against (e.g. team-plan self-service).
              <p className="text-xs text-muted-foreground" data-no-target>
                No target set to measure against — showing logging only.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
