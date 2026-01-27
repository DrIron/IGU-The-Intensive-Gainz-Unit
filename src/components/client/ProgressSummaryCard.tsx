import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Target, Flame, Drumstick, Droplet, Wheat } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ProgressSummaryCardProps {
  phase: any;
  latestAdherence?: boolean;
}

interface CircularProgressProps {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
}

function CircularProgress({ value, max, size = 120, strokeWidth = 8, children }: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const percentage = Math.min((value / max) * 100, 100);
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-muted/20"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-primary transition-all duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}

export function ProgressSummaryCard({ phase, latestAdherence }: ProgressSummaryCardProps) {
  const navigate = useNavigate();

  if (!phase) {
    return (
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-lg">Your Targets</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No active nutrition phase</p>
        </CardContent>
      </Card>
    );
  }

  const macros = [
    {
      icon: Flame,
      label: "Calories",
      value: Math.round(phase.daily_calories),
      unit: "kcal",
      max: 3000,
      color: "text-orange-500"
    },
    {
      icon: Drumstick,
      label: "Protein",
      value: Math.round(phase.protein_grams),
      unit: "g",
      max: 300,
      color: "text-red-500"
    },
    {
      icon: Droplet,
      label: "Fat",
      value: Math.round(phase.fat_grams),
      unit: "g",
      max: 150,
      color: "text-yellow-500"
    },
    {
      icon: Wheat,
      label: "Carbs",
      value: Math.round(phase.carb_grams),
      unit: "g",
      max: 400,
      color: "text-blue-500"
    }
  ];

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Target className="h-5 w-5" />
          Your Targets
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-6">
          {macros.map((macro) => {
            const Icon = macro.icon;
            return (
              <div key={macro.label} className="flex flex-col items-center gap-2 animate-fade-in">
                <CircularProgress value={macro.value} max={macro.max} size={100} strokeWidth={8}>
                  <Icon className={`h-6 w-6 ${macro.color}`} />
                </CircularProgress>
                <div className="text-center">
                  <p className="text-2xl font-bold">
                    {macro.value}
                    <span className="text-sm font-normal text-muted-foreground ml-1">{macro.unit}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{macro.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {latestAdherence !== undefined && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <span className="text-sm text-muted-foreground">Last Week:</span>
            <Badge variant={latestAdherence ? "default" : "secondary"}>
              {latestAdherence ? "On Track" : "Missed Check-In"}
            </Badge>
          </div>
        )}

        <div className="space-y-2">
          <Button 
            className="w-full font-semibold text-base" 
            onClick={() => navigate("/nutrition")}
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            Open Progress Tracker
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            These targets are based on your current phase. You can adjust them in Nutrition → Goal Setting.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
