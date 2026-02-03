import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus,
  ClipboardList,
  Apple,
  Library,
} from "lucide-react";

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

  const actions = [
    {
      icon: Plus,
      label: "Create Program",
      description: "Build a new workout program",
      onClick: () => navigate("/coach/programs?action=new"),
      color: "text-blue-600 bg-blue-100 dark:bg-blue-900/50",
    },
    {
      icon: ClipboardList,
      label: "Assign Program",
      description: "Assign program to client",
      onClick: () => navigate("/coach/clients"),
      color: "text-purple-600 bg-purple-100 dark:bg-purple-900/50",
    },
    {
      icon: Apple,
      label: "Nutrition",
      description: "Manage client nutrition",
      onClick: () => navigate("/coach-client-nutrition"),
      color: "text-green-600 bg-green-100 dark:bg-green-900/50",
    },
    {
      icon: Library,
      label: "Exercise Library",
      description: "Browse exercises",
      onClick: () => navigate("/workout-library"),
      color: "text-orange-600 bg-orange-100 dark:bg-orange-900/50",
    },
  ];

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <Card
            key={action.label}
            className="cursor-pointer hover:shadow-md transition-shadow hover:border-primary/30"
            onClick={action.onClick}
          >
            <CardContent className="p-4">
              <div className={`inline-flex p-2 rounded-lg ${action.color} mb-2`}>
                <action.icon className="h-4 w-4" />
              </div>
              <p className="font-medium text-sm">{action.label}</p>
              <p className="text-xs text-muted-foreground">{action.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
