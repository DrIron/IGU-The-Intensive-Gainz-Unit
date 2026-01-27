import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Clock, CreditCard, Lock } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { useNavigate } from "react-router-dom";

interface GracePeriodBannerProps {
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

/**
 * Grace Period Banner Component
 * 
 * Displays context-aware banner based on billing status:
 * - Non-blocking warning during grace period (soft lock)
 * - Blocking message when account is locked (hard lock)
 */
export function GracePeriodBanner({ subscription, profile }: GracePeriodBannerProps) {
  const navigate = useNavigate();
  
  const isPastDue = subscription.status === "past_due";
  const isInactive = subscription.status === "inactive" || profile?.status === "inactive";
  const isSuspended = profile?.status === "suspended";
  
  const pastDueSince = subscription.past_due_since
    ? new Date(subscription.past_due_since)
    : null;
    
  const gracePeriodDays = subscription.grace_period_days ?? 7;
  const amount = subscription.billing_amount_kwd ?? subscription.services?.price_kwd ?? 0;
  
  // Calculate grace period progress
  let daysRemaining: number | null = null;
  let graceProgress = 0;
  
  if (pastDueSince) {
    const daysPastDue = differenceInDays(new Date(), pastDueSince);
    daysRemaining = Math.max(0, gracePeriodDays - daysPastDue);
    graceProgress = Math.min(100, (daysPastDue / gracePeriodDays) * 100);
  }

  // Suspended by admin
  if (isSuspended) {
    return (
      <Alert className="border-destructive bg-destructive/10 mb-6">
        <Lock className="h-5 w-5 text-destructive" />
        <AlertTitle className="text-destructive font-semibold">
          Account Suspended
        </AlertTitle>
        <AlertDescription className="text-destructive/90">
          Your account has been suspended by an administrator. Please contact support for assistance.
        </AlertDescription>
      </Alert>
    );
  }

  // Hard locked - subscription inactive
  if (isInactive) {
    return (
      <Alert className="border-destructive bg-destructive/10 mb-6">
        <Lock className="h-5 w-5 text-destructive" />
        <AlertTitle className="text-destructive font-semibold">
          Subscription Inactive
        </AlertTitle>
        <AlertDescription className="flex flex-col gap-4 mt-2">
          <p className="text-destructive/90">
            Your subscription is inactive due to non-payment. 
            Renew now to regain instant access to all your coaching features.
          </p>
          <Button 
            variant="gradient"
            size="sm"
            onClick={() => navigate("/billing/pay")}
            className="w-fit"
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Renew Now – {amount} KWD
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Grace period - soft lock with countdown
  if (isPastDue && daysRemaining !== null) {
    const isUrgent = daysRemaining <= 2;
    
    return (
      <Alert className={`mb-6 ${isUrgent ? 'border-destructive bg-destructive/10' : 'border-warning bg-warning/10'}`}>
        <AlertTriangle className={`h-5 w-5 ${isUrgent ? 'text-destructive' : 'text-warning'}`} />
        <AlertTitle className={`${isUrgent ? 'text-destructive' : 'text-warning'} font-semibold`}>
          Payment Past Due
        </AlertTitle>
        <AlertDescription className="flex flex-col gap-4 mt-2">
          <div>
            <p className={`${isUrgent ? 'text-destructive/90' : 'text-warning/90'} mb-3`}>
              Your payment of <strong>{amount} KWD</strong> is past due. 
              {daysRemaining > 0 
                ? ` You have ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} to pay before your access is suspended.`
                : ' Your access will be suspended today if payment is not received.'
              }
            </p>
            
            {/* Grace period progress bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className={isUrgent ? 'text-destructive/70' : 'text-warning/70'}>Grace Period</span>
                <span className={isUrgent ? 'text-destructive/70' : 'text-warning/70'}>
                  {daysRemaining} of {gracePeriodDays} days remaining
                </span>
              </div>
              <Progress 
                value={100 - graceProgress} 
                className={`h-2 ${isUrgent ? '[&>div]:bg-destructive' : '[&>div]:bg-warning'}`}
              />
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <Button 
              variant="gradient"
              size="sm"
              onClick={() => navigate("/billing/pay")}
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Pay Now
            </Button>
            
            <span className="text-xs text-muted-foreground">
              <Clock className="h-3 w-3 inline mr-1" />
              Some features are temporarily restricted
            </span>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  // No banner needed
  return null;
}
