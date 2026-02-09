import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CreditCard, Calendar, Ban } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { useNavigate } from "react-router-dom";

interface AlertsCardProps {
  profile: any;
  subscription: any;
  weeklyLogsCount?: number;
}

export function AlertsCard({ profile, subscription, weeklyLogsCount }: AlertsCardProps) {
  const navigate = useNavigate();
  const alerts: {
    icon: typeof AlertCircle;
    title: string;
    description: string;
    variant: "destructive" | "default";
    onClick?: () => void;
  }[] = [];

  // Check for cancelled subscription
  if (subscription?.cancel_at_period_end && subscription?.end_date) {
    const daysUntilEnd = differenceInDays(
      new Date(subscription.end_date),
      new Date()
    );
    
    if (daysUntilEnd >= 0) {
      alerts.push({
        icon: Ban,
        title: "Subscription Cancelled",
        description: `Your subscription will end on ${format(new Date(subscription.end_date), 'PPP')}${daysUntilEnd > 0 ? ` (${daysUntilEnd} day${daysUntilEnd !== 1 ? 's' : ''} remaining)` : ' (today)'}. To continue after this date, you will need to sign up again and go through the approval process.`,
        variant: "destructive" as const,
      });
    }
  }

  // Check for payment issues
  if (subscription?.status === "failed" || profile?.status === "failed_payment") {
    alerts.push({
      icon: CreditCard,
      title: "Payment Issue",
      description: "Your last payment attempt failed. Click to try again.",
      variant: "destructive" as const,
      onClick: () => navigate("/billing/pay"),
    });
  }

  // Check for upcoming manual payment
  if (subscription?.next_billing_date) {
    const daysUntilRenewal = differenceInDays(
      new Date(subscription.next_billing_date),
      new Date()
    );
    if (daysUntilRenewal <= 7 && daysUntilRenewal > 0) {
      alerts.push({
        icon: Calendar,
        title: "Payment Due Soon",
        description: `Your next payment is due in ${daysUntilRenewal} day${daysUntilRenewal !== 1 ? 's' : ''}. Click "Pay Now" to renew.`,
        variant: "default" as const,
        onClick: () => navigate("/billing/pay"),
      });
    }
  }

  // Check for missing weight logs (minimum 3 per week)
  if (weeklyLogsCount !== undefined && weeklyLogsCount < 3) {
    alerts.push({
      icon: AlertCircle,
      title: "Missing Weight Logs",
      description: `You need ${3 - weeklyLogsCount} more weight log${3 - weeklyLogsCount !== 1 ? 's' : ''} this week (minimum 3). Tap to log now.`,
      variant: "default",
      onClick: () => navigate("/nutrition"),
    });
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-3">
      {alerts.map((alert, index) => (
        <Alert 
          key={index} 
          variant={alert.variant}
          className={alert.onClick ? "cursor-pointer transition-all hover:shadow-md hover:opacity-90 active:opacity-80" : ""}
          onClick={alert.onClick}
        >
          <alert.icon className="h-4 w-4" />
          <AlertTitle>{alert.title}</AlertTitle>
          <AlertDescription>{alert.description}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
