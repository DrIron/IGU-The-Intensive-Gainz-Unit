import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClickableCard } from "@/components/ui/clickable-card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Activity, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientWorkoutsWeek } from "@/hooks/useClientWorkouts";

interface AdherenceSummaryCardProps {
  userId: string;
}

interface ModuleAdherence {
  module_type: string;
  completed: number;
  total: number;
  percent: number;
}

export function AdherenceSummaryCard({ userId }: AdherenceSummaryCardProps) {
  const navigate = useNavigate();
  const { data: modulesData, isLoading } = useClientWorkoutsWeek(userId);

  // Derive overall % and per-module-type breakdown from hook data.
  // Defensive completion check: `status === 'completed' || !!completed_at`
  // catches a row where the trigger flipped completed_at but status didn't
  // (or vice versa).
  const { overallPercent, moduleBreakdown } = useMemo(() => {
    const rows = modulesData ?? [];
    if (rows.length === 0) {
      return { overallPercent: 0, moduleBreakdown: [] as ModuleAdherence[] };
    }
    const isCompleted = (m: { status: string; completed_at: string | null }) =>
      m.status === "completed" || !!m.completed_at;

    const completedTotal = rows.filter(isCompleted).length;
    const totalModules = rows.length;
    const overall = totalModules > 0
      ? Math.round((completedTotal / totalModules) * 100)
      : 0;

    const byType: Record<string, { completed: number; total: number }> = {};
    for (const m of rows) {
      const type = m.module_type;
      if (!byType[type]) byType[type] = { completed: 0, total: 0 };
      byType[type].total++;
      if (isCompleted(m)) byType[type].completed++;
    }

    const breakdown: ModuleAdherence[] = Object.entries(byType)
      .map(([type, data]) => ({
        module_type: type,
        completed: data.completed,
        total: data.total,
        percent: Math.round((data.completed / data.total) * 100),
      }))
      .sort((a, b) => a.module_type.localeCompare(b.module_type));

    return { overallPercent: overall, moduleBreakdown: breakdown };
  }, [modulesData]);

  const loading = isLoading;

  const getModuleTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      primary_strength: "Strength",
      physio: "Physio",
      mobility: "Mobility",
      running: "Running",
      calisthenics: "Calisthenics",
    };
    return labels[type] || type.replace(/_/g, ' ');
  };

  const getAdherenceColor = (percent: number) => {
    if (percent >= 80) return "text-green-500";
    if (percent >= 50) return "text-yellow-500";
    return "text-red-500";
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <ClickableCard
      ariaLabel="View workout calendar"
      onClick={() => navigate("/client/workout/calendar")}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
            Weekly Adherence
          </CardTitle>
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
        <CardDescription>
          This week's workout completion
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* When there is no workout data for the week we skip the big percentage
            number entirely -- showing "0%" in red the moment the week starts
            feels punishing even though nothing's wrong yet. The empty state
            replaces the hero ring. */}
        {moduleBreakdown.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground bg-muted/30 rounded-lg">
            <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" aria-hidden="true" />
            <p className="text-sm">No workouts scheduled this week yet</p>
            <p className="text-[11px] mt-1">Tap to view your calendar.</p>
          </div>
        ) : (
          <>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className={`text-4xl font-bold ${getAdherenceColor(overallPercent)}`}>
                {overallPercent}%
              </p>
              <p className="text-sm text-muted-foreground mt-1">Overall Completion</p>
              <Progress value={overallPercent} className="mt-3 h-2" />
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">By Module Type</p>
              {moduleBreakdown.map((item) => (
                <div key={item.module_type} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {getModuleTypeLabel(item.module_type)}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {item.completed}/{item.total}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={item.percent} className="w-20 h-2" />
                    <span className={`text-sm font-medium w-10 text-right ${getAdherenceColor(item.percent)}`}>
                      {item.percent}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </ClickableCard>
  );
}
