import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Calendar, CreditCard, AlertTriangle, Tag } from "lucide-react";
import { format } from "date-fns";
import { sanitizeErrorForUser } from '@/lib/errorSanitizer';

interface SubscriptionManagementProps {
  subscription: {
    id: string;
    status: string;
    next_billing_date: string | null;
    cancel_at_period_end: boolean;
    discount_code_id?: string | null;
    services: {
      name: string;
      price_kwd: number;
    };
  };
  userId: string;
  isAdminView?: boolean;
}

interface DiscountInfo {
  code: string;
  discount_type: string;
  discount_value: number;
  duration_type: string;
  duration_cycles: number | null;
}

interface RedemptionInfo {
  cycles_applied: number;
  cycles_remaining: number | null;
  status: string;
  total_saved_kwd: number;
}

export function SubscriptionManagement({ subscription, userId, isAdminView = false }: SubscriptionManagementProps) {
  const navigate = useNavigate();
  const [cancelling, setCancelling] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancellationInfo, setCancellationInfo] = useState<any>(null);
  const [discountInfo, setDiscountInfo] = useState<DiscountInfo | null>(null);
  const [redemptionInfo, setRedemptionInfo] = useState<RedemptionInfo | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchCancellationInfo = async () => {
      if (subscription.cancel_at_period_end) {
        const { data } = await supabase
          .from('form_submissions')
          .select('cancellation_reason')
          .eq('user_id', userId)
          .single();
        
        setCancellationInfo(data);
      }
    };
    fetchCancellationInfo();
  }, [subscription.cancel_at_period_end, userId]);

  // Load discount info for admin view
  useEffect(() => {
    const loadDiscountInfo = async () => {
      if (!isAdminView || !subscription.discount_code_id) return;

      try {
        // Load discount code details
        const { data: discountCode } = await supabase
          .from('discount_codes')
          .select('code, discount_type, discount_value, duration_type, duration_cycles')
          .eq('id', subscription.discount_code_id)
          .single();

        if (discountCode) {
          setDiscountInfo(discountCode as DiscountInfo);
        }

        // Load redemption info
        const { data: redemption } = await supabase
          .from('discount_redemptions')
          .select('cycles_applied, cycles_remaining, status, total_saved_kwd')
          .eq('subscription_id', subscription.id)
          .eq('status', 'active')
          .maybeSingle();

        if (redemption) {
          setRedemptionInfo(redemption as RedemptionInfo);
        }
      } catch (error) {
        console.error('Error loading discount info:', error);
      }
    };

    loadDiscountInfo();
  }, [isAdminView, subscription.discount_code_id, subscription.id]);

  const handleCancelSubscription = async () => {
    setCancelling(true);
    try {
      const { data, error } = await supabase.functions.invoke('cancel-subscription', {
        body: { userId, reason: cancelReason },
      });

      if (error) throw error;

      toast({
        title: "Subscription Cancelled",
        description: "Your subscription will remain active until the end of your current billing period. Redirecting...",
      });

      setTimeout(() => navigate("/dashboard"), 2000);
    } catch (error: any) {
      console.error('Cancellation error:', error);
      toast({
        title: "Cancellation Failed",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  };

  const handleReactivateSubscription = async () => {
    setReactivating(true);
    try {
      const { data, error } = await supabase.functions.invoke('reactivate-subscription', {
        body: { userId },
      });

      if (error) throw error;

      if (data?.redirect_url) {
        window.location.href = data.redirect_url;
        return;
      }

      toast({
        title: "Subscription Reactivated",
        description: "Your subscription has been reactivated successfully. Redirecting...",
      });

      setTimeout(() => navigate("/dashboard"), 2000);
    } catch (error: any) {
      console.error('Reactivation error:', error);
      toast({
        title: "Reactivation Failed",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setReactivating(false);
    }
  };

  const getStatusBadge = () => {
    if (subscription.cancel_at_period_end) {
      return <Badge variant="secondary">Cancelling at Period End</Badge>;
    }
    if (subscription.status === 'active') {
      return <Badge variant="default">Active</Badge>;
    }
    return <Badge variant="outline">{subscription.status}</Badge>;
  };

  const getDurationLabel = (durationType: string, cycles: number | null): string => {
    if (durationType === 'one_time') return 'One-time';
    if (durationType === 'limited_cycles' && cycles) return `First ${cycles} payments`;
    if (durationType === 'lifetime') return 'All payments';
    return durationType;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Subscription</CardTitle>
          {getStatusBadge()}
        </div>
        <CardDescription>
          Manage your {subscription.services.name} subscription
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 p-4 rounded-lg bg-muted">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <p className="font-medium">{subscription.services.name}</p>
            <p className="text-sm text-muted-foreground">
              {subscription.services.price_kwd} KWD / month (manual payment)
            </p>
          </div>
        </div>

        {subscription.next_billing_date && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-muted">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">
                {subscription.cancel_at_period_end ? 'Active Until' : 'Next Billing Date'}
              </p>
              <p className="text-sm text-muted-foreground">
                {format(new Date(subscription.next_billing_date), 'MMMM d, yyyy')}
              </p>
            </div>
          </div>
        )}

        {/* Discount Info - Admin View Only */}
        {isAdminView && discountInfo && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
            <Tag className="h-5 w-5 text-green-600 mt-0.5" />
            <div className="flex-1 space-y-2">
              <div>
                <p className="font-medium text-green-900 dark:text-green-100">
                  Discount: {discountInfo.code}
                </p>
                <p className="text-sm text-green-700 dark:text-green-300">
                  {discountInfo.discount_type === 'percent' 
                    ? `${discountInfo.discount_value}% off` 
                    : `${discountInfo.discount_value} KWD off`}
                  {' • '}
                  {getDurationLabel(discountInfo.duration_type, discountInfo.duration_cycles)}
                </p>
              </div>
              {redemptionInfo && (
                <div className="text-sm text-green-700 dark:text-green-300 pt-2 border-t border-green-200 dark:border-green-700">
                  <div className="flex justify-between">
                    <span>Cycles used:</span>
                    <span className="font-medium">{redemptionInfo.cycles_applied}</span>
                  </div>
                  {redemptionInfo.cycles_remaining !== null && (
                    <div className="flex justify-between">
                      <span>Cycles remaining:</span>
                      <span className="font-medium">{redemptionInfo.cycles_remaining}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Total saved:</span>
                    <span className="font-medium">{redemptionInfo.total_saved_kwd.toFixed(3)} KWD</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Status:</span>
                    <Badge variant={redemptionInfo.status === 'active' ? 'default' : 'secondary'} className="h-5">
                      {redemptionInfo.status}
                    </Badge>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {subscription.cancel_at_period_end && (
          <>
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-yellow-900 dark:text-yellow-100">
                    Subscription Ending
                  </p>
                  <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
                    Your subscription will end on {format(new Date(subscription.next_billing_date!), 'MMMM d, yyyy')}. 
                    You'll continue to have access until then.
                  </p>
                </div>
              </div>
            </div>

            {((isAdminView || !cancellationInfo?.cancellation_reason?.includes('Admin cancelled'))) && (
              <Button 
                onClick={handleReactivateSubscription}
                disabled={reactivating}
                className="w-full"
              >
                {reactivating ? "Reactivating..." : "Cancel Cancellation & Continue Subscription"}
              </Button>
            )}

            {!isAdminView && cancellationInfo?.cancellation_reason?.includes('Admin cancelled') && (
              <p className="text-sm text-muted-foreground text-center">
                Your subscription was cancelled by an administrator. Please contact support if you believe this was done in error.
              </p>
            )}
          </>
        )}

        {subscription.status === 'active' && !subscription.cancel_at_period_end && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full">
                Cancel Subscription
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel Subscription</AlertDialogTitle>
                <AlertDialogDescription>
                  Your subscription will remain active until the end of your current period 
                  ({subscription.next_billing_date ? format(new Date(subscription.next_billing_date), 'MMMM d, yyyy') : 'period end'}). 
                  No further manual payments will be required.
                </AlertDialogDescription>
              </AlertDialogHeader>
              
              <div className="space-y-2">
                <Label htmlFor="cancel-reason">
                  Why are you cancelling? (Optional)
                </Label>
                <Textarea
                  id="cancel-reason"
                  placeholder="Help us improve by sharing your feedback..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                />
              </div>

              <AlertDialogFooter>
                <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleCancelSubscription}
                  disabled={cancelling}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {cancelling ? "Cancelling..." : "Confirm Cancellation"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardContent>
    </Card>
  );
}
