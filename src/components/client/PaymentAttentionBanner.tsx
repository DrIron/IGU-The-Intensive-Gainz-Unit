import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, AlertTriangle, Clock, CreditCard } from "lucide-react";
import { differenceInDays, format, addDays } from "date-fns";
import { useNavigate } from "react-router-dom";

interface PaymentAttentionBannerProps {
  subscription: {
    status?: string;
    next_billing_date?: string | null;
    past_due_since?: string | null;
    grace_period_days?: number | null;
    billing_amount_kwd?: number | null;
    services?: {
      name?: string;
      price_kwd?: number;
    };
  };
  profile?: {
    status?: string;
  };
}

export function PaymentAttentionBanner({ subscription, profile }: PaymentAttentionBannerProps) {
  const navigate = useNavigate();
  
  const nextBillingDate = subscription.next_billing_date 
    ? new Date(subscription.next_billing_date) 
    : null;
  
  const pastDueSince = subscription.past_due_since
    ? new Date(subscription.past_due_since)
    : null;
    
  const gracePeriodDays = subscription.grace_period_days ?? 7;
  const amount = subscription.billing_amount_kwd ?? subscription.services?.price_kwd ?? 0;
  
  const isPastDue = subscription.status === "past_due" || !!pastDueSince;
  const isInactive = subscription.status === "inactive" || profile?.status === "inactive";
  
  // Calculate days until due or past due
  const daysUntilDue = nextBillingDate 
    ? differenceInDays(nextBillingDate, new Date())
    : null;
  
  // Calculate grace period deadline if past due
  const graceDeadline = pastDueSince 
    ? addDays(pastDueSince, gracePeriodDays)
    : null;
  
  const daysUntilGraceEnd = graceDeadline
    ? differenceInDays(graceDeadline, new Date())
    : null;

  // Inactive - subscription terminated
  if (isInactive) {
    return (
      <Alert className="border-destructive bg-destructive/10 mb-6">
        <AlertCircle className="h-5 w-5 text-destructive" />
        <AlertTitle className="text-destructive font-semibold">
          Subscription Inactive
        </AlertTitle>
        <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-2">
          <span className="text-destructive/90">
            Your subscription has been deactivated due to non-payment. 
            Reactivate now to restore access to all features.
          </span>
          <Button 
            variant="gradient"
            size="sm"
            onClick={() => navigate("/billing/pay")}
            className="shrink-0"
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Reactivate Now
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Past due - in grace period
  if (isPastDue && daysUntilGraceEnd !== null && daysUntilGraceEnd > 0) {
    return (
      <Alert className="border-destructive bg-destructive/10 mb-6">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <AlertTitle className="text-destructive font-semibold">
          Payment Required - {daysUntilGraceEnd} {daysUntilGraceEnd === 1 ? "day" : "days"} left
        </AlertTitle>
        <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-2">
          <span className="text-destructive/90">
            Your payment of <strong>{amount} KWD</strong> is past due. 
            Pay before {graceDeadline ? format(graceDeadline, "MMM dd") : "the deadline"} to avoid service interruption.
          </span>
          <Button 
            variant="gradient"
            size="sm"
            onClick={() => navigate("/billing/pay")}
            className="shrink-0"
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Pay Now
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Due in 1-3 days - urgent
  if (daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 3) {
    const dueText = daysUntilDue === 0 
      ? "today" 
      : daysUntilDue === 1 
        ? "tomorrow" 
        : `in ${daysUntilDue} days`;
    
    return (
      <Alert className="border-warning bg-warning/10 mb-6">
        <Clock className="h-5 w-5 text-warning" />
        <AlertTitle className="text-warning font-semibold">
          Payment Due {dueText.charAt(0).toUpperCase() + dueText.slice(1)}
        </AlertTitle>
        <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-2">
          <span className="text-warning/90">
            Your next payment of <strong>{amount} KWD</strong> is due {dueText}. 
            Pay now to avoid any service interruption.
          </span>
          <Button 
            variant="gradient"
            size="sm"
            onClick={() => navigate("/billing/pay")}
            className="shrink-0"
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Pay Now
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Due in 4-7 days - reminder
  if (daysUntilDue !== null && daysUntilDue <= 7) {
    return (
      <Alert className="border-muted-foreground/30 bg-muted/50 mb-6">
        <Clock className="h-5 w-5 text-muted-foreground" />
        <AlertTitle className="text-foreground font-medium">
          Payment Due Soon
        </AlertTitle>
        <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-2">
          <span className="text-muted-foreground">
            Your next payment of <strong>{amount} KWD</strong> is due on{" "}
            {nextBillingDate ? format(nextBillingDate, "MMMM dd, yyyy") : "soon"}.
          </span>
          <Button 
            variant="outline"
            size="sm"
            onClick={() => navigate("/billing/pay")}
            className="shrink-0"
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Pay Early
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // No banner needed
  return null;
}
