import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, TrendingDown, TrendingUp, Calendar, Target } from "lucide-react";
import { format } from "date-fns";

interface PhaseSummaryReportProps {
  phase: any;
  summary: {
    startWeight: number;
    endWeight: number;
    totalChange: number;
    targetChange: number;
    percentOfTarget: number;
    averageAdherence: number;
    dietBreaksTaken: number;
    avgDailyCalories: number;
    avgProtein: number;
    avgFat: number;
    avgCarbs: number;
  };
}

export function PhaseSummaryReport({ phase, summary }: PhaseSummaryReportProps) {
  const handleDownload = () => {
    const content = `
Nutrition Phase Summary Report
${phase.phase_name}
${format(new Date(phase.start_date), 'MMM dd, yyyy')} - ${format(new Date(), 'MMM dd, yyyy')}

WEIGHT PROGRESS
Starting Weight: ${summary.startWeight} kg
Ending Weight: ${summary.endWeight} kg
Total Change: ${summary.totalChange > 0 ? '+' : ''}${summary.totalChange.toFixed(1)} kg (${summary.percentOfTarget.toFixed(0)}% of target)

ADHERENCE
Average Adherence: ${summary.averageAdherence.toFixed(0)}%
Diet Break Weeks: ${summary.dietBreaksTaken}

NUTRITION AVERAGES
Calories: ${Math.round(summary.avgDailyCalories)} kcal
Protein: ${Math.round(summary.avgProtein)}g
Fat: ${Math.round(summary.avgFat)}g
Carbs: ${Math.round(summary.avgCarbs)}g
    `.trim();

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${phase.phase_name.replace(/\s+/g, '_')}_Summary.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Phase Summary Report</CardTitle>
            <CardDescription>{phase.phase_name}</CardDescription>
          </div>
          <Button onClick={handleDownload} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Timeline */}
        <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm text-muted-foreground">Duration</p>
            <p className="font-medium">
              {format(new Date(phase.start_date), 'MMM dd, yyyy')} - {format(new Date(), 'MMM dd, yyyy')}
            </p>
          </div>
        </div>

        {/* Weight Progress */}
        <div className="space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Target className="h-4 w-4" />
            Weight Progress
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <p className="text-xs text-muted-foreground">Starting</p>
              <p className="text-2xl font-bold">{summary.startWeight} kg</p>
            </div>
            <div className="p-3 rounded-lg bg-primary/10">
              <p className="text-xs text-muted-foreground">Ending</p>
              <p className="text-2xl font-bold">{summary.endWeight} kg</p>
            </div>
            <div className="p-3 rounded-lg bg-primary/10">
              <p className="text-xs text-muted-foreground">Change</p>
              <p className="text-2xl font-bold flex items-center gap-1">
                {summary.totalChange > 0 ? (
                  <TrendingUp className="h-5 w-5 text-green-500" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-500" />
                )}
                {summary.totalChange > 0 ? '+' : ''}{summary.totalChange.toFixed(1)} kg
              </p>
            </div>
            <div className="p-3 rounded-lg bg-primary/10">
              <p className="text-xs text-muted-foreground">vs Target</p>
              <p className="text-2xl font-bold">{summary.percentOfTarget.toFixed(0)}%</p>
            </div>
          </div>
        </div>

        {/* Adherence & Nutrition */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <h3 className="font-semibold">Adherence</h3>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Average</span>
                <span className="font-medium">{summary.averageAdherence.toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Diet Breaks</span>
                <span className="font-medium">{summary.dietBreaksTaken} weeks</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">Nutrition Averages</h3>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Calories</span>
                <span className="font-medium">{Math.round(summary.avgDailyCalories)} kcal</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">P / F / C</span>
                <span className="font-medium">
                  {Math.round(summary.avgProtein)}g / {Math.round(summary.avgFat)}g / {Math.round(summary.avgCarbs)}g
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
