import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/withTimeout";
import { Clock, AlertTriangle, CheckCircle2, CreditCard, Tag, XCircle, Loader2, UserCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { cn } from "@/lib/utils";
import { LEVEL_LABELS, type ProfessionalLevel } from "@/auth/roles";

interface PaymentStatusProps {
  userId: string;
}

interface AppliedDiscount {
  code: string;
  discount_type: string;
  discount_value: number;
  description?: string;
  duration_type?: string;
  duration_cycles?: number;
  min_price_kwd?: number | null;
}

interface BillingComponent {
  id: string;
  label: string;
  component_type: string;
  amount_kwd: number;
  sort_order: number;
}

// Resolved level-based price for the client's own subscription (get_subscription_price_quote RPC).
interface PriceQuote {
  price_kwd: number;
  coach_level: ProfessionalLevel | null;
  coach_display_name: string | null;
  coach_assigned: boolean;
  service_name: string | null;
  service_slug: string | null;
}

export function PaymentStatusDashboard({ userId }: PaymentStatusProps) {
  const [paymentDeadline, setPaymentDeadline] = useState<Date | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [progressPercentage, setProgressPercentage] = useState(0);
  const [serviceName, setServiceName] = useState("");
  const [servicePrice, setServicePrice] = useState(0);
  const [serviceId, setServiceId] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [discountCode, setDiscountCode] = useState("");
  const [validatingCode, setValidatingCode] = useState(false);
  const [appliedDiscount, setAppliedDiscount] = useState<AppliedDiscount | null>(null);
  const [discountedPrice, setDiscountedPrice] = useState<number | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [billingComponents, setBillingComponents] = useState<BillingComponent[]>([]);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const loadPaymentInfo = useCallback(async () => {
    try {
      setLoading(true);

      // Use profiles_public for status/deadline (RLS allows own user access)
      const { data: profile, error: profileError } = await supabase
        .from('profiles_public')
        .select('payment_deadline, status')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) throw profileError;

      setStatus(profile?.status || '');

      if (profile?.payment_deadline) {
        setPaymentDeadline(new Date(profile.payment_deadline));
      }

      // Separate queries (nested FK joins on subscriptions are banned)
      const { data: subscription, error: subError } = await supabase
        .from('subscriptions')
        .select('id, service_id')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .maybeSingle();

      if (!subError && subscription) {
        const { data: service } = await supabase
          .from('services')
          .select('name, price_kwd')
          .eq('id', subscription.service_id)
          .maybeSingle();
        setServiceName(service?.name || '');
        setServiceId(subscription.service_id);

        // Resolve the level-based price (depends on the assigned coach's level).
        // services.price_kwd is only the public "from" price and would under-charge
        // Senior/Lead clients -- use the quote as the displayed/charged base price.
        const { data: quoteData, error: quoteErr } = await supabase
          .rpc('get_subscription_price_quote', { p_subscription_id: subscription.id });
        if (!quoteErr && quoteData) {
          const q = quoteData as unknown as PriceQuote;
          setQuote(q);
          setServicePrice(q.price_kwd ?? service?.price_kwd ?? 0);
        } else {
          setServicePrice(service?.price_kwd || 0);
        }

        // Fetch billing components for this service
        try {
          const { data: components, error: componentsError } = await supabase
            .from('service_billing_components')
            .select('id, label, component_type, amount_kwd, sort_order')
            .eq('service_id', subscription.service_id)
            .order('sort_order', { ascending: true })
            .order('component_type', { ascending: true }); // 'add_on' after 'base'

          if (!componentsError && components) {
            setBillingComponents(components);
          }
        } catch (compError) {
          if (import.meta.env.DEV) console.error('Error loading billing components:', compError);
          // Fallback gracefully - don't block payment page
        }
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Error loading payment info:', error);
      toast({
        title: "Error",
        description: "Failed to load payment information",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [userId, toast]);

  // Verify payment status with TAP API (for users returning from payment)
  const verifyPaymentStatus = useCallback(async () => {
    try {
      setVerifyingPayment(true);

      // Check URL for tap_id parameter (TAP redirect includes this)
      const urlParams = new URLSearchParams(window.location.search);
      const tapChargeId = urlParams.get('tap_id') || urlParams.get('charge_id');

      if (import.meta.env.DEV) console.log('Verifying payment status...', { userId, tapChargeId });

      const { data, error } = await supabase.functions.invoke('verify-payment', {
        body: {
          userId,
          chargeId: tapChargeId || undefined,
        },
      });

      if (error) {
        if (import.meta.env.DEV) console.error('Error verifying payment:', error);
        // Don't show error - just proceed to load payment info
        loadPaymentInfo();
        return;
      }

      if (import.meta.env.DEV) console.log('Verify payment response:', data);

      if (data?.status === 'active') {
        // Payment was successful! Show success message and redirect
        setPaymentVerified(true);
        toast({
          title: "Payment Successful!",
          description: data.message || "Your subscription is now active. Redirecting to dashboard...",
        });

        // Clear URL params to prevent re-verification
        if (tapChargeId) {
          window.history.replaceState({}, '', window.location.pathname);
        }

        // Short delay to show the success message
        setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 2000);
        return;
      }

      if (data?.status === 'pending') {
        // Payment still processing - show message but don't error
        toast({
          title: "Payment Processing",
          description: data.message || "Your payment is being processed. Please wait a moment and refresh.",
        });
      }

      if (data?.status === 'failed') {
        setPaymentError(data.message || 'Payment failed. Please try again.');
      }

      // Continue loading payment info for other statuses
      loadPaymentInfo();
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error in payment verification:', err);
      loadPaymentInfo();
    } finally {
      setVerifyingPayment(false);
    }
  }, [userId, navigate, toast, loadPaymentInfo]);

  // First verify if payment was completed (user returning from TAP)
  const hasFetched = useRef(false);
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    verifyPaymentStatus();
  }, [verifyPaymentStatus]);

  useEffect(() => {
    if (!paymentDeadline) return;

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const deadline = paymentDeadline.getTime();
      const distance = deadline - now;

      if (distance < 0) {
        setTimeRemaining("Payment deadline expired");
        setProgressPercentage(0);
        clearInterval(timer);
        return;
      }

      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      setTimeRemaining(`${days}d ${hours}h ${minutes}m ${seconds}s`);

      // Calculate progress (7 days = 100%)
      const totalTime = 7 * 24 * 60 * 60 * 1000;
      const elapsed = totalTime - distance;
      const percentage = Math.min((elapsed / totalTime) * 100, 100);
      setProgressPercentage(100 - percentage);
    }, 1000);

    return () => clearInterval(timer);
  }, [paymentDeadline]);

  const calculateDiscountedPrice = (discount: AppliedDiscount, originalPrice: number): number => {
    let newPrice = originalPrice;
    if (discount.discount_type === 'percent') {
      newPrice = originalPrice * (1 - discount.discount_value / 100);
    } else if (discount.discount_type === 'fixed') {
      newPrice = originalPrice - discount.discount_value;
    }
    
    if (discount.min_price_kwd !== null && discount.min_price_kwd !== undefined && newPrice < discount.min_price_kwd) {
      newPrice = discount.min_price_kwd;
    }
    
    return Math.max(0, newPrice);
  };

  const getDiscountAmount = (): number => {
    if (!appliedDiscount) return 0;
    return servicePrice - (discountedPrice ?? servicePrice);
  };

  const getDurationDescription = (discount: AppliedDiscount): string => {
    const durationType = discount.duration_type;
    const cycles = discount.duration_cycles;

    if (durationType === 'one_time') {
      return 'This discount applies to this payment only.';
    } else if (durationType === 'limited_cycles' && cycles) {
      return `This discount applies to your first ${cycles} payments.`;
    } else if (durationType === 'lifetime') {
      return 'This discount applies to all payments while your subscription remains active.';
    }
    return '';
  };

  const getDurationBadge = (discount: AppliedDiscount): string => {
    const durationType = discount.duration_type;
    const cycles = discount.duration_cycles;

    if (durationType === 'one_time') {
      return 'one-time';
    } else if (durationType === 'limited_cycles' && cycles) {
      return `first ${cycles} payments`;
    } else if (durationType === 'lifetime') {
      return 'all payments';
    }
    return '';
  };

  const validateDiscountCode = async () => {
    if (!discountCode.trim()) {
      setDiscountError("Please enter a discount code");
      return;
    }

    setValidatingCode(true);
    setDiscountError(null);

    try {
      const { data, error } = await supabase.functions.invoke('apply-discount-code', {
        body: {
          code: discountCode.trim(),
          service_id: serviceId,
        },
      });

      if (error) throw error;

      if (data.valid) {
        // Determine discount type and value from response
        const discountType = data.discount.percent_off ? 'percent' : 'fixed';
        const discountValue = data.discount.percent_off || data.discount.amount_off_kwd || 0;
        
        const discount: AppliedDiscount = {
          code: discountCode.trim().toUpperCase(),
          discount_type: discountType,
          discount_value: discountValue,
          description: discountType === 'percent' 
            ? `${discountValue}% off` 
            : `${discountValue} KWD off`,
        };
        
        setAppliedDiscount(discount);
        const newPrice = calculateDiscountedPrice(discount, servicePrice);
        setDiscountedPrice(newPrice);
        setDiscountError(null);

        toast({
          title: "Discount Applied!",
          description: `Your discount code has been applied to your order.`,
        });
      } else {
        setDiscountError(data.reason || "This code is invalid or not applicable to this plan.");
        setAppliedDiscount(null);
        setDiscountedPrice(null);
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Error validating discount code:', error);
      // Handle rate limiting
      if (error.message?.includes('429') || error.message?.includes('Too many')) {
        setDiscountError("Too many attempts. Please wait a minute before trying again.");
      } else {
        setDiscountError(sanitizeErrorForUser(error));
      }
    } finally {
      setValidatingCode(false);
    }
  };

  const removeDiscount = () => {
    setAppliedDiscount(null);
    setDiscountedPrice(null);
    setDiscountCode("");
    setDiscountError(null);
  };

  // Build B: open the confirm-at-checkout dialog before charging.
  const openConfirm = () => {
    setConfirmed(false);
    setConfirmOpen(true);
  };

  const handlePayment = async () => {
    if (processingPayment) return;

    setProcessingPayment(true);
    setPaymentError(null);
    
    try {
      const { data: { user } } = await withTimeout(supabase.auth.getUser(), 8000);
      if (!user) {
        setPaymentError("Please log in to continue with payment.");
        setProcessingPayment(false);
        return;
      }

      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('service_id')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .maybeSingle();

      if (!subscription) {
        setPaymentError("No pending subscription found. Please contact support.");
        setProcessingPayment(false);
        return;
      }

      // Split query for public/private profile data (RLS secured for own user)
      const [{ data: profilePublic }, { data: profilePrivate }] = await Promise.all([
        supabase.from('profiles_public').select('first_name').eq('id', userId).maybeSingle(),
        supabase.from('profiles_private').select('email, last_name').eq('profile_id', userId).maybeSingle()
      ]);
      
      const profile = profilePublic && profilePrivate ? {
        email: profilePrivate.email,
        first_name: profilePublic.first_name,
        last_name: profilePrivate.last_name
      } : null;

      const { data: payData, error: payErr } = await supabase.functions.invoke('create-tap-payment', {
        body: {
          serviceId: subscription.service_id,
          userId,
          customerEmail: profile?.email,
          customerName: `${profile?.first_name} ${profile?.last_name}`,
          discountCode: appliedDiscount?.code || undefined,
        },
      });

      if (payErr) {
        if (import.meta.env.DEV) console.error('Payment function error:', payErr);
        setPaymentError("We couldn't start your payment session. Please check your connection and try again. If this keeps happening, contact support.");
        setProcessingPayment(false);
        return;
      }

      if (payData?.success && payData?.paymentUrl) {
        // Keep the loading state while redirecting
        window.location.href = payData.paymentUrl;
      } else {
        setPaymentError(payData?.error || "Failed to initiate payment. Please try again.");
        setProcessingPayment(false);
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Payment error:', error);
      setPaymentError("We couldn't start your payment session. Please check your connection and try again. If this keeps happening, contact support.");
      setProcessingPayment(false);
    }
  };

  if (loading || verifyingPayment) {
    return (
      <Card className="border-2 border-primary/20 shadow-lg">
        <CardContent className="pt-6 flex flex-col items-center justify-center gap-4 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">
            {verifyingPayment ? "Verifying payment status..." : "Loading..."}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Payment was verified as successful - show success message
  if (paymentVerified) {
    return (
      <Card className="border-2 border-green-500/30 shadow-lg bg-green-50 dark:bg-green-950/20">
        <CardContent className="pt-6 flex flex-col items-center justify-center gap-4 py-12">
          <CheckCircle2 className="h-16 w-16 text-green-500" />
          <h2 className="text-2xl font-bold text-green-700 dark:text-green-400">Payment Successful!</h2>
          <p className="text-muted-foreground text-center">
            Your subscription is now active. Redirecting to your dashboard...
          </p>
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (status !== 'pending_payment' || !paymentDeadline) {
    return null;
  }

  const isExpired = new Date() > paymentDeadline;
  const isUrgent = timeRemaining && (paymentDeadline.getTime() - new Date().getTime()) < 2 * 24 * 60 * 60 * 1000;
  const finalPrice = discountedPrice !== null ? discountedPrice : servicePrice;
  const hasBreakdown = billingComponents.length > 0;
  const breakdownTotal = billingComponents.reduce((sum, c) => sum + Number(c.amount_kwd), 0);

  return (
    <>
    <Card className="border-border/60 shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl font-bold">
          {isExpired ? "Payment deadline expired" : "Activate your plan"}
        </CardTitle>
        <CardDescription>
          {isExpired ? `Your window to join ${serviceName} has closed.` : "Secure checkout via Tap."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isExpired ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="ml-2">
              Your payment deadline has expired. Please contact support to reactivate your registration.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Plan summary — see the price, then pay. Original price strikes
                through when a discount applies; "Due today" is the hero number. */}
            <div className="rounded-lg border p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-medium">{serviceName}</span>
                <span className={cn("tabular-nums", appliedDiscount && "text-muted-foreground line-through")}>
                  {(hasBreakdown ? breakdownTotal : servicePrice).toFixed(3)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Renew monthly &middot; cancel anytime</span>
                <span>KWD</span>
              </div>
              {appliedDiscount && (
                <div className="flex items-center justify-between text-sm text-emerald-600 dark:text-emerald-400">
                  <span className="flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5" />
                    {appliedDiscount.code} ({appliedDiscount.discount_type === 'percent'
                      ? `${appliedDiscount.discount_value}%`
                      : `${appliedDiscount.discount_value} KWD`} {getDurationBadge(appliedDiscount)})
                  </span>
                  <span>−{getDiscountAmount().toFixed(3)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t pt-3">
                <span className="font-semibold">Due today</span>
                <span className="font-display text-3xl font-bold leading-none text-primary">
                  {finalPrice.toFixed(3)}
                  <span className="ml-1 text-base font-normal text-muted-foreground">KWD</span>
                </span>
              </div>
            </div>

            {/* Payment Error Display */}
            {paymentError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="ml-2">
                  {paymentError}
                </AlertDescription>
              </Alert>
            )}

            <Button
              onClick={openConfirm}
              size="lg"
              className="w-full h-14 text-lg"
              disabled={processingPayment}
            >
              {processingPayment ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Redirecting to Tap...
                </>
              ) : (
                `Pay ${finalPrice.toFixed(3)} KWD`
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Secure payment powered by Tap Payments
            </p>

            {/* Secondary affordances — kept, but BELOW the CTA so the primary
                path stays "see price -> pay" (spec D2). */}
            {!appliedDiscount ? (
              <details className="group rounded-lg border border-border/60">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
                  Have a promo code?
                  <span className="text-muted-foreground transition-transform group-open:rotate-180">▾</span>
                </summary>
                <div className="space-y-2 px-4 pb-4">
                  <div className="flex gap-2">
                    <Input
                      id="discount-code"
                      value={discountCode}
                      onChange={(e) => {
                        setDiscountCode(e.target.value.toUpperCase());
                        setDiscountError(null);
                      }}
                      placeholder="Enter code"
                      className={cn("flex-1", discountError && "border-destructive")}
                      disabled={validatingCode}
                    />
                    <Button
                      onClick={validateDiscountCode}
                      disabled={validatingCode || !discountCode.trim()}
                      variant="outline"
                    >
                      {validatingCode ? "Checking..." : "Apply"}
                    </Button>
                  </div>
                  {discountError && (
                    <p className="flex items-center gap-1 text-sm text-destructive">
                      <XCircle className="h-4 w-4" />
                      {discountError}
                    </p>
                  )}
                </div>
              </details>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/20">
                <div className="flex items-center gap-2 text-sm text-emerald-900 dark:text-emerald-100">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    <strong>{appliedDiscount.code}</strong> applied — {getDurationDescription(appliedDiscount)}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={removeDiscount}
                  className="shrink-0 text-emerald-700 hover:text-emerald-900 dark:text-emerald-300"
                >
                  Remove
                </Button>
              </div>
            )}

            {/* Reservation countdown — subtle, below the CTA. */}
            {paymentDeadline && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className={cn("flex items-center gap-1 text-muted-foreground", isUrgent && "text-orange-500")}>
                    <Clock className="h-3.5 w-3.5" />
                    {isUrgent ? "Less than 2 days to secure your spot" : "Reserve your spot"}
                  </span>
                  <span className={cn("tabular-nums text-muted-foreground", isUrgent && "font-medium text-orange-500")}>
                    {timeRemaining}
                  </span>
                </div>
                <Progress value={progressPercentage} className="h-1.5" />
                <p className="text-[11px] text-muted-foreground">
                  Deadline: {paymentDeadline.toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>
            )}

            {/* Price breakdown — kept as an expandable, not the default view. */}
            {hasBreakdown && (
              <details className="group rounded-lg border border-border/60">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
                  View price breakdown
                  <span className="text-muted-foreground transition-transform group-open:rotate-180">▾</span>
                </summary>
                <div className="space-y-2 px-4 pb-4">
                  {billingComponents.map((component) => (
                    <div key={component.id} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        {component.label}
                        <Badge
                          variant={component.component_type === 'base' ? 'default' : 'secondary'}
                          className="px-1.5 py-0 text-xs"
                        >
                          {component.component_type === 'base' ? 'Base' : 'Add-on'}
                        </Badge>
                      </span>
                      <span>{Number(component.amount_kwd).toFixed(3)} KWD</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t pt-2 text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{breakdownTotal.toFixed(3)} KWD/month</span>
                  </div>
                </div>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>

    {/* Build B: confirm assigned coach + resolved price before charging */}
    <Dialog open={confirmOpen} onOpenChange={(open) => !processingPayment && setConfirmOpen(open)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            Confirm your coaching plan
          </DialogTitle>
          <DialogDescription>
            {quote
              ? quote.coach_assigned
                ? `You've been matched with ${quote.coach_display_name || "your coach"}${
                    quote.coach_level ? ` (${LEVEL_LABELS[quote.coach_level] ?? quote.coach_level} coach)` : ""
                  }. Your price for ${quote.service_name || serviceName} is ${quote.price_kwd} KWD/month.`
                : `Your price for ${quote.service_name || serviceName} is ${quote.price_kwd} KWD/month.`
              : "Please confirm to continue to payment."}
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-start gap-2 cursor-pointer py-2">
          <Checkbox
            checked={confirmed}
            onCheckedChange={(v) => setConfirmed(v === true)}
            className="mt-0.5"
          />
          <span className="text-sm">
            I understand and agree to be charged {finalPrice.toFixed(3)} KWD now.
          </span>
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={processingPayment}>
            Cancel
          </Button>
          <Button
            onClick={handlePayment}
            disabled={processingPayment || !confirmed}
          >
            {processingPayment ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Redirecting to Tap...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                Confirm &amp; Pay
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
