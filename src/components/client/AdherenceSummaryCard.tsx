import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { startOfWeek, endOfWeek, format } from "date-fns";

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
  const [overallPercent, setOverallPercent] = useState(0);
  const [moduleBreakdown, setModuleBreakdown] = useState<ModuleAdherence[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAdherenceData();
  }, [userId]);

  const fetchAdherenceData = async () => {
    try {
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
      const weekEnd = endOfWeek(new Date(), { weekStartsOn: 0 });

      // Get all modules for this week
      const { data: modulesData, error } = await supabase
        .from("client_day_modules")
        .select(`
          id,
          module_type,
          status,
          client_program_days!inner (
            date,
            client_programs!inner (
              user_id,
              status
            )
          )
        `)
        .eq("client_program_days.client_programs.user_id", userId)
        .eq("client_program_days.client_programs.status", "active")
        .gte("client_program_days.date", format(weekStart, 'yyyy-MM-dd'))
        .lte("client_program_days.date", format(weekEnd, 'yyyy-MM-dd'));

      if (error) throw error;

      if (!modulesData || modulesData.length === 0) {
        setOverallPercent(0);
        setModuleBreakdown([]);
        setLoading(false);
        return;
      }

      // Calculate overall adherence
      const completedTotal = modulesData.filter(m => m.status === 'completed').length;
      const totalModules = modulesData.length;
      setOverallPercent(totalModules > 0 ? Math.round((completedTotal / totalModules) * 100) : 0);

      // Calculate per-module-type breakdown
      const byType: Record<string, { completed: number; total: number }> = {};
      
      modulesData.forEach(m => {
        const type = m.module_type;
        if (!byType[type]) {
          byType[type] = { completed: 0, total: 0 };
        }
        byType[type].total++;
        if (m.status === 'completed') {
          byType[type].completed++;
        }
      });

      const breakdown: ModuleAdherence[] = Object.entries(byType).map(([type, data]) => ({
        module_type: type,
        completed: data.completed,
        total: data.total,
        percent: Math.round((data.completed / data.total) * 100),
      }));

      // Sort by type name
      breakdown.sort((a, b) => a.module_type.localeCompare(b.module_type));
      setModuleBreakdown(breakdown);

    } catch (error) {
      console.error("Error fetching adherence data:", error);
    } finally {
      setLoading(false);
    }
  };

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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Weekly Adherence
        </CardTitle>
        <CardDescription>
          This week's workout completion
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Progress */}
        <div className="text-center p-4 bg-muted/50 rounded-lg">
          <p className={`text-4xl font-bold ${getAdherenceColor(overallPercent)}`}>
            {overallPercent}%
          </p>
          <p className="text-sm text-muted-foreground mt-1">Overall Completion</p>
          <Progress value={overallPercent} className="mt-3 h-2" />
        </div>

        {/* Per-Module Breakdown */}
        {moduleBreakdown.length > 0 && (
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
        )}

        {moduleBreakdown.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No workout data this week yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
