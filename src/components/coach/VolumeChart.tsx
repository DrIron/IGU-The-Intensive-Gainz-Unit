import { useVolumeTracking } from "@/hooks/useVolumeTracking";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, BarChart3 } from "lucide-react";

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Weekly Volume
        </CardTitle>
        <CardDescription>
          Week of {new Date(latestWeek.week_start).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </CardDescription>
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

        {/* Total summary */}
        <div className="pt-2 border-t flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-medium">
            {latestWeek.muscle_groups.reduce((sum, mg) => sum + mg.total_sets, 0)} sets
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
