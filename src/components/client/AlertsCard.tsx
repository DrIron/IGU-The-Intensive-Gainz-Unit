import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CreditCard, Ban } from "lucide-react";
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

  // Payment due reminders handled by PaymentAttentionBanner above — no duplication here

  // Check for missing weight logs (minimum 3 per week)
  if (weeklyLogsCount !== undefined && weeklyLogsCount < 3) {
    const isTeamPlan = subscription?.services?.type === "team" || subscription?.service?.type === "team";
    const nutritionPath = isTeamPlan ? "/nutrition-team?tab=progress" : "/nutrition";
    alerts.push({
      icon: AlertCircle,
      title: "Missing Weight Logs",
      description: `You need ${3 - weeklyLogsCount} more weight log${3 - weeklyLogsCount !== 1 ? 's' : ''} this week (minimum 3). Tap to log now.`,
      variant: "default",
      onClick: () => navigate(nutritionPath),
    });
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-3">
      {alerts.map((alert, index) => {
        const content = (
          <>
            <alert.icon className="h-4 w-4" />
            <AlertTitle>{alert.title}</AlertTitle>
            <AlertDescription>{alert.description}</AlertDescription>
          </>
        );

        // An actionable alert becomes a real <button> — keyboard-operable (Enter/Space) with a
        // visible focus ring, which a bare onClick on the <Alert> div lacked. Flat hover (DS3):
        // a border + background shift, no shadow.
        if (alert.onClick) {
          return (
            <button
              key={index}
              type="button"
              onClick={alert.onClick}
              aria-label={alert.title}
              className="block w-full rounded-lg text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Alert variant={alert.variant} className="cursor-pointer hover:border-primary/40 hover:bg-muted/40 active:opacity-80">
                {content}
              </Alert>
            </button>
          );
        }

        return (
          <Alert key={index} variant={alert.variant}>
            {content}
          </Alert>
        );
      })}
    </div>
  );
}
