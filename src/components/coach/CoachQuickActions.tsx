import { Button } from "@/components/ui/button";
import { UserCheck, Users, ClipboardCheck, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface QuickAction {
  label: string;
  icon: React.ElementType;
  filter?: string;
  count?: number;
  variant?: "default" | "secondary" | "outline";
  highlight?: boolean;
}

interface CoachQuickActionsProps {
  pendingCount?: number;
  activeCount?: number;
  checkInsCount?: number;
}

export function CoachQuickActions({ 
  pendingCount = 0, 
  activeCount = 0, 
  checkInsCount = 0 
}: CoachQuickActionsProps) {
  const navigate = useNavigate();

  const handleNavigate = (filter?: string) => {
    const params = new URLSearchParams();
    if (filter) params.set('filter', filter);
    navigate(`/coach/clients${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const actions: QuickAction[] = [
    {
      label: "Review Pending",
      icon: UserCheck,
      filter: "pending",
      count: pendingCount,
      variant: pendingCount > 0 ? "default" : "outline",
      highlight: pendingCount > 0,
    },
    {
      label: "My Active Clients",
      icon: Users,
      filter: "active",
      count: activeCount,
      variant: "outline",
    },
    {
      label: "Client Check-ins",
      icon: ClipboardCheck,
      filter: "needs_checkin",
      count: checkInsCount,
      variant: checkInsCount > 0 ? "secondary" : "outline",
      highlight: checkInsCount > 0,
    },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Button
            key={action.label}
            variant={action.variant}
            size="sm"
            onClick={() => handleNavigate(action.filter)}
            className={cn(
              // Ensure minimum 44px tap target height on mobile
              "gap-2 h-11 min-h-[44px] px-4",
              action.highlight && action.variant === "default" && "bg-amber-600 hover:bg-amber-700"
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{action.label}</span>
            {action.count !== undefined && action.count > 0 && (
              <span className={cn(
                "ml-1 text-xs font-bold px-1.5 py-0.5 rounded-full",
                action.variant === "default" 
                  ? "bg-white/20 text-white" 
                  : "bg-muted text-muted-foreground"
              )}>
                {action.count}
              </span>
            )}
            <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        );
      })}
    </div>
  );
}
