import { useVolumeTracking } from "@/hooks/useVolumeTracking";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneClasses, type Interpretation } from "@/lib/interpret";
import { DeltaChip } from "@/components/ui/delta-chip";
import { Sparkline } from "@/components/ui/sparkline";

interface VolumeChartProps {
  clientUserId: string;
}

export function VolumeChart({ clientUserId }: VolumeChartProps) {
  const { weeklyVolume, loading } = useVolumeTracking(clientUserId, 4);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Get the latest week's data
  const latestWeek = weeklyVolume[weeklyVolume.length - 1];
  const previousWeek = weeklyVolume.length > 1 ? weeklyVolume[weeklyVolume.length - 2] : null;

  if (!latestWeek || latestWeek.muscle_groups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Weekly Volume
          </CardTitle>
          <CardDescription>Sets per muscle group this week</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No workout data yet
          </p>
        </CardContent>
      </Card>
    );
  }

  // Build comparison map from previous week
  const prevMap = new Map<string, number>();
  if (previousWeek) {
    for (const mg of previousWeek.muscle_groups) {
      prevMap.set(mg.muscle_group, mg.total_sets);
    }
  }

  // Find max sets for bar width calculation
  const maxSets = Math.max(...latestWeek.muscle_groups.map((mg) => mg.total_sets));

  // MetricCard-pattern summary: total sets this week + WoW delta + 4-week trend.
  const weeklyTotals = weeklyVolume.map((w) => w.muscle_groups.reduce((s, mg) => s + mg.total_sets, 0));
  const latestTotal = weeklyTotals[weeklyTotals.length - 1];
  const prevTotal = weeklyTotals.length > 1 ? weeklyTotals[weeklyTotals.length - 2] : null;
  const totalDelta = prevTotal != null ? latestTotal - prevTotal : null;
  const interpretation: Interpretation =
    totalDelta == null
      ? { tone: "neutral", label: "", sentence: "First tracked week of volume." }
      : totalDelta > 0
        ? { tone: "on_track", label: "", sentence: `Up ${totalDelta} sets vs last week.` }
        : totalDelta < 0
          ? { tone: "attention", label: "", sentence: `Down ${Math.abs(totalDelta)} sets vs last week.` }
          : { tone: "neutral", label: "", sentence: "Same total sets as last week." };

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Weekly Volume
          </CardTitle>
          <CardDescription className="m-0">
            Week of {new Date(latestWeek.week_start).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </CardDescription>
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-semibold tabular-nums">{latestTotal}</span>
            <span className="text-sm text-muted-foreground">sets</span>
          </div>
          {totalDelta != null && <DeltaChip value={totalDelta} tone={interpretation.tone} />}
        </div>
        {weeklyTotals.length >= 2 && (
          <div className="w-24">
            <Sparkline data={weeklyTotals} height={28} />
          </div>
        )}
        {interpretation.sentence && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden
              className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", toneClasses(interpretation.tone).dot)}
            />
            {interpretation.sentence}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {latestWeek.muscle_groups.map((mg) => {
          const prevSets = prevMap.get(mg.muscle_group) || 0;
          const diff = mg.total_sets - prevSets;
          const barWidth = maxSets > 0 ? (mg.total_sets / maxSets) * 100 : 0;

          return (
            <div key={mg.muscle_group}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{mg.muscle_group}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {mg.total_sets} sets
                  </span>
                  {previousWeek && diff !== 0 && (
                    <Badge
                      variant={diff > 0 ? "default" : "secondary"}
                      className="text-xs px-1.5 py-0"
                    >
                      {diff > 0 ? `+${diff}` : diff}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
