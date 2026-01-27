import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, CheckCircle2, Clock, AlertCircle, Percent, UserCheck, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface KPIMetrics {
  totalClients: number;
  activeClients: number;
  pendingApprovals: number;
  checkInsDue: number;
  capacityUsedPercent: number | null;
}

interface CoachKPIRowProps {
  metrics: KPIMetrics;
  onNavigate?: (section: string, filter?: string) => void;
}

export function CoachKPIRow({ metrics, onNavigate }: CoachKPIRowProps) {
  const navigate = useNavigate();

  const handleNavigate = (filter?: string) => {
    if (onNavigate) {
      onNavigate('clients', filter);
    }
    // Navigate to role-scoped coach clients page
    const params = new URLSearchParams();
    if (filter) params.set('filter', filter);
    navigate(`/coach/clients${params.toString() ? `?${params.toString()}` : ''}`);
  }

  const kpis = [
    {
      label: "Total Clients",
      value: metrics.totalClients,
      icon: Users,
      onClick: () => handleNavigate(),
      colorClass: "text-muted-foreground",
    },
    {
      label: "Active Clients",
      value: metrics.activeClients,
      icon: CheckCircle2,
      onClick: () => handleNavigate('active'),
      colorClass: "text-green-600",
    },
    {
      label: "Pending Approvals",
      value: metrics.pendingApprovals,
      icon: UserCheck,
      onClick: () => handleNavigate('pending'),
      colorClass: metrics.pendingApprovals > 0 ? "text-amber-600" : "text-muted-foreground",
      highlight: metrics.pendingApprovals > 0,
      secondaryLabel: metrics.pendingApprovals > 0 ? "Action required" : undefined,
      tooltip: "Review and approve clients who selected you as their coach",
    },
    {
      label: "Check-ins Due",
      value: metrics.checkInsDue,
      icon: AlertCircle,
      onClick: () => handleNavigate('needs_checkin'),
      colorClass: metrics.checkInsDue > 0 ? "text-destructive" : "text-muted-foreground",
      highlight: metrics.checkInsDue > 0,
    },
    {
      label: "Capacity Used",
      value: metrics.capacityUsedPercent !== null ? `${Math.round(metrics.capacityUsedPercent)}%` : "—",
      icon: Percent,
      onClick: () => handleNavigate(),
      colorClass: metrics.capacityUsedPercent !== null && metrics.capacityUsedPercent >= 90 
        ? "text-destructive" 
        : metrics.capacityUsedPercent !== null && metrics.capacityUsedPercent >= 70 
          ? "text-amber-600" 
          : "text-muted-foreground",
    },
  ];

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          
          const cardContent = (
            <Card 
              key={kpi.label}
              className={cn(
                "cursor-pointer transition-all",
                "hover:shadow-md hover:border-primary/30 hover:scale-[1.02]",
                "active:scale-[0.98] active:shadow-sm",
                kpi.highlight && "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 ring-1 ring-amber-200/50"
              )}
              onClick={kpi.onClick}
            >
              {/* Ensure minimum 44px tap target on mobile */}
              <CardContent className="p-4 min-h-[88px]">
                <div className="flex items-center justify-between mb-2">
                  <Icon className={cn("h-4 w-4", kpi.colorClass)} />
                  {kpi.highlight && (
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                        Action
                      </Badge>
                      <ArrowRight className="h-3 w-3 text-amber-600" />
                    </div>
                  )}
                </div>
                <div className="text-2xl font-bold">{kpi.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
                {kpi.secondaryLabel && (
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mt-0.5">
                    {kpi.secondaryLabel}
                  </p>
                )}
              </CardContent>
            </Card>
          );

          // Wrap with tooltip if tooltip text exists
          if (kpi.tooltip) {
            return (
              <Tooltip key={kpi.label} delayDuration={300}>
                <TooltipTrigger asChild>
                  {cardContent}
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[200px] text-center">
                  <p>{kpi.tooltip}</p>
                </TooltipContent>
              </Tooltip>
            );
          }

          return cardContent;
        })}
      </div>
    </TooltipProvider>
  );
}
