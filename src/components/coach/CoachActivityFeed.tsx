import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, Users, CheckCircle2, AlertCircle, CreditCard, XCircle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ActivityItem {
  id: string;
  type: 'new_client' | 'check_in' | 'approval' | 'nutrition_update' | 'payment_failed' | 'cancelled';
  clientName: string;
  timestamp: string;
  description: string;
}

interface CoachActivityFeedProps {
  activities: ActivityItem[];
  maxItems?: number;
}

type FilterType = 'all' | 'clients' | 'payments';

export function CoachActivityFeed({ activities, maxItems = 5 }: CoachActivityFeedProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const navigate = useNavigate();

  const handleReviewPending = () => {
    navigate('/coach/clients?filter=pending');
  };

  const filterOptions: { value: FilterType; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'clients', label: 'Clients' },
    { value: 'payments', label: 'Payments' },
  ];

  const filteredActivities = activities.filter(activity => {
    if (filter === 'all') return true;
    if (filter === 'clients') {
      return ['new_client', 'approval', 'check_in', 'nutrition_update', 'cancelled'].includes(activity.type);
    }
    if (filter === 'payments') {
      return ['payment_failed'].includes(activity.type);
    }
    return true;
  }).slice(0, maxItems);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'new_client':
        return <Users className="h-4 w-4 text-primary" />;
      case 'check_in':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'approval':
        return <AlertCircle className="h-4 w-4 text-amber-500" />;
      case 'nutrition_update':
        return <Activity className="h-4 w-4 text-blue-500" />;
      case 'payment_failed':
        return <CreditCard className="h-4 w-4 text-destructive" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription className="text-sm">
              Latest updates from your clients
            </CardDescription>
          </div>
          <div className="flex gap-1">
            {filterOptions.map(option => (
              <Button
                key={option.value}
                variant={filter === option.value ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredActivities.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Activity className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">
              {activities.length === 0 
                ? "No activity yet – once clients are assigned to you, updates will appear here."
                : "No matching activities"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredActivities.map((activity) => (
              <div 
                key={activity.id} 
                className="flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0"
              >
                <div className="mt-0.5 p-1.5 rounded-full bg-muted">
                  {getActivityIcon(activity.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{activity.clientName}</p>
                  <p className="text-xs text-muted-foreground">{activity.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {activity.type === 'approval' && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-7 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                      onClick={handleReviewPending}
                    >
                      Review
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatTimestamp(activity.timestamp)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
