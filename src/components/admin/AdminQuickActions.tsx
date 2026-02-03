import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import {
  Users,
  UserCog,
  CreditCard,
  Video,
  Dumbbell,
  Settings,
} from "lucide-react";

export function AdminQuickActions() {
  const navigate = useNavigate();

  const actions = [
    {
      icon: Users,
      label: "Client Directory",
      onClick: () => navigate("/admin/clients"),
      color: "text-blue-600 bg-blue-100 dark:bg-blue-900/50",
    },
    {
      icon: UserCog,
      label: "Manage Coaches",
      onClick: () => navigate("/admin/coaches"),
      color: "text-green-600 bg-green-100 dark:bg-green-900/50",
    },
    {
      icon: CreditCard,
      label: "Billing & Pricing",
      onClick: () => navigate("/admin/billing"),
      color: "text-purple-600 bg-purple-100 dark:bg-purple-900/50",
    },
    {
      icon: Dumbbell,
      label: "Exercise Library",
      onClick: () => navigate("/admin/exercises"),
      color: "text-orange-600 bg-orange-100 dark:bg-orange-900/50",
    },
    {
      icon: Video,
      label: "Educational Videos",
      onClick: () => navigate("/admin/content"),
      color: "text-pink-600 bg-pink-100 dark:bg-pink-900/50",
    },
    {
      icon: Settings,
      label: "System Settings",
      onClick: () => navigate("/admin/system-health"),
      color: "text-gray-600 bg-gray-100 dark:bg-gray-900/50",
    },
  ];

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Quick Actions</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {actions.map((action) => (
          <Card
            key={action.label}
            className="cursor-pointer hover:shadow-md transition-shadow hover:border-primary/30"
            onClick={action.onClick}
          >
            <CardContent className="p-4 flex flex-col items-center text-center gap-2">
              <div className={`inline-flex p-2 rounded-lg ${action.color}`}>
                <action.icon className="h-5 w-5" />
              </div>
              <p className="font-medium text-sm">{action.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
