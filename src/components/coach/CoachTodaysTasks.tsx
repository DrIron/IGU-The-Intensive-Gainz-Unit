import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, AlertCircle, Clock, UserCheck, Calendar, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface TaskItem {
  label: string;
  count: number;
  icon: React.ElementType;
  filter?: string;
  urgent?: boolean;
}

interface CoachTodaysTasksProps {
  checkInsDueToday: number;
  inactiveFor14Days: number;
  pendingApprovals: number;
  onNavigate?: (section: string, filter?: string) => void;
}

export function CoachTodaysTasks({ 
  checkInsDueToday, 
  inactiveFor14Days, 
  pendingApprovals,
  onNavigate 
}: CoachTodaysTasksProps) {
  const navigate = useNavigate();

  const handleNavigate = (filter?: string) => {
    if (onNavigate) {
      onNavigate('clients', filter);
    }
    // Navigate to role-scoped coach clients page
    const params = new URLSearchParams();
    if (filter) params.set('filter', filter);
    navigate(`/coach/clients${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const tasks: TaskItem[] = [
    {
      label: "check-ins due today",
      count: checkInsDueToday,
      icon: Calendar,
      filter: "needs_checkin_today",
      urgent: checkInsDueToday > 0,
    },
    {
      label: "clients inactive 14+ days",
      count: inactiveFor14Days,
      icon: Clock,
      filter: "inactive_14d",
      urgent: inactiveFor14Days > 0,
    },
    {
      label: "Approve pending clients",
      count: pendingApprovals,
      icon: UserCheck,
      filter: "pending",
      urgent: pendingApprovals > 0,
    },
  ];

  const hasAnyTasks = tasks.some(t => t.count > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ClipboardList className="h-5 w-5" />
          Today's Tasks
        </CardTitle>
        <CardDescription className="text-sm">
          Action items that need your attention
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasAnyTasks ? (
          <div className="text-center py-6 text-muted-foreground">
            <ClipboardList className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">All caught up! No pending tasks.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((task, index) => {
              const Icon = task.icon;
              const isActive = task.count > 0;
              
              return (
                <Button
                  key={index}
                  variant="ghost"
                  className={cn(
                    // Ensure minimum 44px tap target height on mobile
                    "w-full justify-between h-auto py-3 px-3 min-h-[48px]",
                    isActive 
                      ? "hover:bg-muted" 
                      : "opacity-50 cursor-default hover:bg-transparent"
                  )}
                  onClick={() => isActive && handleNavigate(task.filter)}
                  disabled={!isActive}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-full",
                      isActive && task.urgent ? "bg-destructive/10" : "bg-muted"
                    )}>
                      <Icon className={cn(
                        "h-4 w-4",
                        isActive && task.urgent ? "text-destructive" : "text-muted-foreground"
                      )} />
                    </div>
                    <div className="text-left">
                      <span className={cn(
                        "text-xl font-bold",
                        isActive && task.urgent ? "text-destructive" : ""
                      )}>
                        {task.count}
                      </span>
                      <span className="text-sm text-muted-foreground ml-2">
                        {task.label}
                      </span>
                    </div>
                  </div>
                  {isActive && (
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
