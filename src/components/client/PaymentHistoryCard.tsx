import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { History, CheckCircle2, XCircle, Clock, CreditCard } from "lucide-react";

interface PaymentRecord {
  id: string;
  amount_kwd: number;
  status: "initiated" | "paid" | "failed" | "cancelled";
  is_renewal: boolean;
  billing_period_start: string | null;
  billing_period_end: string | null;
  created_at: string;
  paid_at: string | null;
}

interface PaymentHistoryCardProps {
  userId: string;
  maxRecords?: number;
}

export function PaymentHistoryCard({ userId, maxRecords = 10 }: PaymentHistoryCardProps) {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPaymentHistory();
  }, [userId]);

  const loadPaymentHistory = async () => {
    try {
      const { data, error } = await supabase
        .from("subscription_payments")
        .select("id, amount_kwd, status, is_renewal, billing_period_start, billing_period_end, created_at, paid_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(maxRecords);

      if (error) throw error;
      setPayments((data || []) as PaymentRecord[]);
    } catch (error) {
      console.error("Error loading payment history:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: PaymentRecord["status"]) => {
    switch (status) {
      case "paid":
        return <CheckCircle2 className="h-4 w-4 text-status-success" />;
      case "failed":
      case "cancelled":
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: PaymentRecord["status"]) => {
    switch (status) {
      case "paid":
        return <Badge variant="outline" className="text-status-success border-status-success/30">Paid</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "cancelled":
        return <Badge variant="secondary">Cancelled</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5" />
            Payment History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          Payment History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No payment history yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted/80 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(payment.status)}
                  <div>
                    <p className="font-medium">
                      {payment.amount_kwd} KWD
                      {payment.is_renewal && (
                        <span className="text-xs text-muted-foreground ml-2">(Renewal)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {payment.paid_at
                        ? format(new Date(payment.paid_at), "MMM dd, yyyy 'at' h:mm a")
                        : format(new Date(payment.created_at), "MMM dd, yyyy")}
                    </p>
                    {payment.billing_period_start && payment.billing_period_end && (
                      <p className="text-xs text-muted-foreground">
                        Period: {format(new Date(payment.billing_period_start), "MMM dd")} – {format(new Date(payment.billing_period_end), "MMM dd, yyyy")}
                      </p>
                    )}
                  </div>
                </div>
                {getStatusBadge(payment.status)}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
