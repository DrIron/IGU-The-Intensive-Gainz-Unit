import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Calculator, Dumbbell, CalendarDays } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface QuickActionsGridProps {
  profile?: any;
  subscription?: any;
  sessionBookingEnabled?: boolean;
}

export function QuickActionsGrid({ profile, subscription, sessionBookingEnabled }: QuickActionsGridProps) {
  const navigate = useNavigate();

  // Only show Exercise Library for active clients
  const isActiveClient = profile?.status === "active" && subscription?.status === "active";

  const actions = [
    {
      icon: Calendar,
      title: "Weekly Check-In",
      description: "Submit this week's progress",
      onClick: () => navigate("/nutrition"),
    },
    {
      icon: Calculator,
      title: "Nutrition & Calculator",
      description: "View or update your nutrition goal",
      onClick: () => navigate("/nutrition"),
    },
    ...(isActiveClient ? [{
      icon: Dumbbell,
      title: "Exercise Library",
      description: "Browse exercises with instructions",
      onClick: () => navigate("/workout-library"),
    }] : []),
    ...(isActiveClient && sessionBookingEnabled ? [{
      icon: CalendarDays,
      title: "Sessions",
      description: "Book & manage",
      onClick: () => navigate("/sessions"),
    }] : []),
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {actions.map((action, index) => (
        <Card 
          key={index}
          className="cursor-pointer hover:shadow-md transition-shadow border-border"
          onClick={action.onClick}
        >
          <CardContent className="p-4 flex flex-col items-center text-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <action.icon className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">{action.title}</h3>
              <p className="text-xs text-muted-foreground">{action.description}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
