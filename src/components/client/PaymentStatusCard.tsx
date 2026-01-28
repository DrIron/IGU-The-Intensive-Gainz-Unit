import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  CreditCard, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ExternalLink,
  Receipt,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { PaymentButton } from "@/components/PaymentButton";
import { 
  PaymentRecord, 
  getPaymentStatusDisplay,
  getTapReceiptUrl,
  formatCurrency,
  calculatePaymentSummary,
} from "@/lib/payments";
import { cn } from "@/lib/utils";

interface PaymentStatusCardProps {
  userId: string;
  subscription: {
    id: string;
    service_id: string;
    status: string;
    next_billing_date?: string | null;
    billing_amount_kwd?: number | null;
    past_due_since?: string | null;
    services?: {
      name?: string;
      price_kwd?: number;
    };
  };
  userEmail: string;
  userName: string;
}

/**
 * Client payment status card showing:
 * - Current status
 * - Due date with countdown
 * - Payment button (when due)
 * - Recent payment history with receipts
 */
export function PaymentStatusCard({ 
  userId, 
  subscription, 
  userEmail, 
  userName 
}: PaymentStatusCardProps) {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const fetchPayments = async () => {
      const { data, error } = await supabase
        .from("subscription_payments")
        .select("*")
        .eq("user_id", userId)
        .eq("subscription_id", subscription.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (!error && data) {
        setPayments(data as PaymentRecord[]);
      }
      setLoading(false);
    };

    fetchPayments();
  }, [userId, subscription.id]);

  const nextBillingDate = subscription.next_billing_date 
    ? new Date(subscription.next_billing_date) 
    : null;
  
  const amount = subscription.billing_amount_kwd ?? subscription.services?.price_kwd ?? 0;
  const serviceName = subscription.services?.name ?? "Your Plan";
  
  const daysUntilDue = nextBillingDate ? differenceInDays(nextBillingDate, new Date()) : null;
  const isPastDue = daysUntilDue !== null && daysUntilDue < 0;
  const isDueSoon = daysUntilDue !== null && daysUntilDue <= 7 && daysUntilDue >= 0;
  
  const summary = calculatePaymentSummary(payments, subscription);

  // Determine status badge
  const getStatusBadge = () => {
    if (subscription.status === "active" && !isPastDue) {
      return <Badge variant="default">Active</Badge>;
    }
    if (isPastDue) {
      return <Badge variant="destructive">Past Due</Badge>;
    }
    if (subscription.status === "past_due") {
      return <Badge variant="destructive">Payment Required</Badge>;
    }
    if (isDueSoon) {
      return <Badge variant="secondary">Due Soon</Badge>;
    }
    return <Badge variant="outline">{subscription.status}</Badge>;
  };

  // Show payment button conditions
  const showPayButton = isPastDue || isDueSoon || subscription.status === "past_due";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Payment Status
          </CardTitle>
          {getStatusBadge()}
        </div>
        <CardDescription>{serviceName}</CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Amount and Due Date */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Amount</p>
            <p className="text-2xl font-bold">{formatCurrency(amount)}</p>
          </div>
          {nextBillingDate && (
            <div className="text-right">
              <p className="text-sm text-muted-foreground">
                {isPastDue ? "Was Due" : "Due Date"}
              </p>
              <p className="font-medium">
                {format(nextBillingDate, "MMM dd, yyyy")}
              </p>
              {daysUntilDue !== null && (
                <p className={cn(
                  "text-xs",
                  isPastDue && "text-destructive",
                  isDueSoon && !isPastDue && "text-yellow-600"
                )}>
                  {isPastDue 
                    ? `${Math.abs(daysUntilDue)} days overdue`
                    : daysUntilDue === 0 
                      ? "Due today"
                      : `${daysUntilDue} days remaining`
                  }
                </p>
              )}
            </div>
          )}
        </div>

        {/* Past Due Warning */}
        {isPastDue && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-destructive">Payment Overdue</p>
              <p className="text-sm text-muted-foreground">
                Please complete your payment to maintain access to your subscription.
              </p>
            </div>
          </div>
        )}

        {/* Payment Button */}
        {showPayButton && (
          <PaymentButton
            serviceId={subscription.service_id}
            userId={userId}
            userEmail={userEmail}
            userName={userName}
            isRenewal={subscription.status !== "pending"}
            className="w-full"
          />
        )}

        {/* Summary Stats */}
        {summary.totalPaid > 0 && (
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm">Total Paid</span>
            </div>
            <span className="font-medium">{formatCurrency(summary.totalPaid)}</span>
          </div>
        )}

        {/* Recent Payments Toggle */}
        {payments.length > 0 && (
          <div>
            <Button
              variant="ghost"
              className="w-full justify-between"
              onClick={() => setShowHistory(!showHistory)}
            >
              <span className="flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Recent Payments ({payments.length})
              </span>
              {showHistory ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>

            {showHistory && (
              <div className="mt-2 space-y-2">
                {payments.slice(0, 5).map((payment) => (
                  <PaymentHistoryItem key={payment.id} payment={payment} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-4">
            <Clock className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Individual payment history item with receipt link.
 */
function PaymentHistoryItem({ payment }: { payment: PaymentRecord }) {
  const statusDisplay = getPaymentStatusDisplay(payment.status);
  const hasReceipt = payment.status === "paid" && payment.tap_charge_id;

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-2 h-2 rounded-full",
          payment.status === "paid" && "bg-green-500",
          payment.status === "failed" && "bg-red-500",
          payment.status === "cancelled" && "bg-gray-500",
          ["initiated", "pending"].includes(payment.status) && "bg-yellow-500"
        )} />
        <div>
          <p className="font-medium">{formatCurrency(payment.amount_kwd)}</p>
          <p className="text-xs text-muted-foreground">
            {payment.paid_at 
              ? format(new Date(payment.paid_at), "MMM dd, yyyy")
              : format(new Date(payment.created_at), "MMM dd, yyyy")
            }
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <Badge variant={statusDisplay.variant} className="text-xs">
          {statusDisplay.label}
        </Badge>
        
        {hasReceipt && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            asChild
          >
            <a 
              href={getTapReceiptUrl(payment.tap_charge_id!)} 
              target="_blank" 
              rel="noopener noreferrer"
              title="View Receipt"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
