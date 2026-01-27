import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, CreditCard } from "lucide-react";
import { format, differenceInDays, addDays } from "date-fns";
import { useNavigate } from "react-router-dom";

interface PaymentDueCardProps {
  subscription: {
    next_billing_date?: string | null;
    billing_amount_kwd?: number | null;
    past_due_since?: string | null;
    grace_period_days?: number | null;
    services?: {
      name?: string;
      price_kwd?: number;
    };
  };
}

export function PaymentDueCard({ subscription }: PaymentDueCardProps) {
  const navigate = useNavigate();
  
  const nextBillingDate = subscription.next_billing_date 
    ? new Date(subscription.next_billing_date) 
    : null;
  
  const amount = subscription.billing_amount_kwd ?? subscription.services?.price_kwd ?? 0;
  const serviceName = subscription.services?.name ?? "Your Plan";
  
  if (!nextBillingDate) return null;
  
  const daysUntilDue = differenceInDays(nextBillingDate, new Date());
  const isPastDue = daysUntilDue < 0;
  
  // Determine badge variant based on days until due
  const getBadgeVariant = () => {
    if (isPastDue) return "destructive";
    if (daysUntilDue <= 3) return "destructive";
    if (daysUntilDue <= 7) return "secondary";
    return "outline";
  };
  
  const getStatusText = () => {
    if (isPastDue) return "Past Due";
    if (daysUntilDue === 0) return "Due Today";
    if (daysUntilDue === 1) return "Due Tomorrow";
    return `Due in ${daysUntilDue} days`;
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Next Payment Due
          </CardTitle>
          <Badge variant={getBadgeVariant()}>
            {getStatusText()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{serviceName}</p>
            <p className="text-2xl font-bold">{amount} KWD</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Due Date</p>
            <p className="font-medium">
              {format(nextBillingDate, "MMM dd, yyyy")}
            </p>
          </div>
        </div>
        
        {daysUntilDue <= 7 && (
          <Button 
            className="w-full" 
            variant={isPastDue || daysUntilDue <= 3 ? "gradient" : "default"}
            onClick={() => navigate("/billing/pay")}
          >
            <CreditCard className="h-4 w-4 mr-2" />
            {isPastDue ? "Pay Now" : "Pay Early"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
