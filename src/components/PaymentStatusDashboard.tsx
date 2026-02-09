import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Clock, AlertTriangle, CheckCircle2, CreditCard, Tag, XCircle, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

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
        .single();

      if (profileError) throw profileError;

      setStatus(profile.status || '');

      if (profile.payment_deadline) {
        setPaymentDeadline(new Date(profile.payment_deadline));
      }

      const { data: subscription, error: subError } = await supabase
        .from('subscriptions')
        .select('service_id, services(name, price_kwd)')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .maybeSingle();

      if (!subError && subscription) {
        const service = subscription.services as any;
        setServiceName(service?.name || '');
        setServicePrice(service?.price_kwd || 0);
        setServiceId(subscription.service_id);

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

  useEffect(() => {
    // First verify if payment was completed (user returning from TAP)
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

  const handlePayment = async () => {
    if (processingPayment) return;
    
    setProcessingPayment(true);
    setPaymentError(null);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
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
        .single();

      if (!subscription) {
        setPaymentError("No pending subscription found. Please contact support.");
        setProcessingPayment(false);
        return;
      }

      // Split query for public/private profile data (RLS secured for own user)
      const [{ data: profilePublic }, { data: profilePrivate }] = await Promise.all([
        supabase.from('profiles_public').select('first_name').eq('id', userId).single(),
        supabase.from('profiles_private').select('email, last_name').eq('profile_id', userId).single()
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
    <Card className="border-2 border-primary/20 shadow-lg">
      <CardHeader className="bg-gradient-to-r from-primary/5 to-accent/5">
        <div className="flex items-center gap-2">
          {isExpired ? (
            <AlertTriangle className="h-6 w-6 text-destructive" />
          ) : isUrgent ? (
            <Clock className="h-6 w-6 text-orange-500 animate-pulse" />
          ) : (
            <CreditCard className="h-6 w-6 text-primary" />
          )}
          <CardTitle className="text-2xl">
            {isExpired ? "Payment Deadline Expired" : "Complete Your Payment"}
          </CardTitle>
        </div>
        <CardDescription className="text-base">
          Secure your spot in <strong>{serviceName}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        {isExpired ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="ml-2">
              Your payment deadline has expired. Please contact support to reactivate your registration.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-muted-foreground">Time Remaining</span>
                <span className={`text-2xl font-bold ${isUrgent ? 'text-orange-500' : 'text-primary'}`}>
                  {timeRemaining}
                </span>
              </div>
              <Progress value={progressPercentage} className="h-3" />
              <p className="text-xs text-muted-foreground text-center">
                Payment deadline: {paymentDeadline.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>

            {isUrgent && (
              <Alert className="border-orange-500 bg-orange-50 dark:bg-orange-950/20">
                <Clock className="h-4 w-4 text-orange-500" />
                <AlertDescription className="ml-2 text-orange-900 dark:text-orange-100">
                  <strong>Urgent:</strong> Less than 2 days remaining! Complete your payment to secure your spot.
                </AlertDescription>
              </Alert>
            )}

            {/* Price Summary Panel */}
            <div className="bg-muted/50 p-4 rounded-lg space-y-3 border">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium">{serviceName}</span>
              </div>

              {/* Price Breakdown Section */}
              {hasBreakdown ? (
                <>
                  <div className="border-t pt-3 space-y-2">
                    <span className="text-sm font-medium text-muted-foreground">Price Breakdown</span>
                    {billingComponents.map((component) => (
                      <div key={component.id} className="flex justify-between items-center text-sm">
                        <span className="flex items-center gap-2">
                          {component.label}
                          <Badge 
                            variant={component.component_type === 'base' ? 'default' : 'secondary'} 
                            className="text-xs px-1.5 py-0"
                          >
                            {component.component_type === 'base' ? 'Base' : 'Add-on'}
                          </Badge>
                        </span>
                        <span>{Number(component.amount_kwd).toFixed(3)} KWD</span>
                      </div>
                    ))}
                  </div>
                  
                  <div className="border-t pt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className={appliedDiscount ? "line-through text-muted-foreground" : "font-semibold"}>
                        {breakdownTotal.toFixed(3)} KWD/month
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Price</span>
                  <span className={appliedDiscount ? "line-through text-muted-foreground" : "font-semibold"}>
                    {servicePrice.toFixed(3)} KWD/month
                  </span>
                </div>
              )}

              {appliedDiscount && (
                <>
                  <div className="flex justify-between items-center text-green-600 dark:text-green-400">
                    <span className="flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      Discount ({appliedDiscount.code} – {appliedDiscount.discount_type === 'percent' 
                        ? `${appliedDiscount.discount_value}%` 
                        : `${appliedDiscount.discount_value} KWD`} {getDurationBadge(appliedDiscount)})
                    </span>
                    <span>−{getDiscountAmount().toFixed(3)} KWD</span>
                  </div>
                  
                  <div className="border-t pt-3 mt-3">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">You Pay Now</span>
                      <span className="text-2xl font-bold text-primary">
                        {finalPrice.toFixed(3)} KWD
                      </span>
                    </div>
                  </div>
                </>
              )}

              {!appliedDiscount && (
                <div className="border-t pt-3 mt-3">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Amount Due</span>
                    <span className="text-2xl font-bold text-primary">
                      {finalPrice.toFixed(3)} KWD
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Discount Code Input */}
            {!appliedDiscount && (
              <div className="bg-muted/30 p-4 rounded-lg space-y-3">
                <Label htmlFor="discount-code" className="text-sm font-medium">
                  Have a promo code?
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="discount-code"
                    value={discountCode}
                    onChange={(e) => {
                      setDiscountCode(e.target.value.toUpperCase());
                      setDiscountError(null);
                    }}
                    placeholder="Enter code"
                    className={`flex-1 ${discountError ? 'border-destructive' : ''}`}
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
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <XCircle className="h-4 w-4" />
                    {discountError}
                  </p>
                )}
              </div>
            )}

            {/* Applied Discount Info */}
            {appliedDiscount && (
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-green-900 dark:text-green-100">
                        {appliedDiscount.code} Applied
                      </p>
                      {appliedDiscount.description && (
                        <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                          {appliedDiscount.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={removeDiscount} 
                    className="h-auto p-1 text-green-700 hover:text-green-900 dark:text-green-300"
                  >
                    Remove
                  </Button>
                </div>
                <p className="text-sm text-green-700 dark:text-green-300 ml-7">
                  {getDurationDescription(appliedDiscount)}
                </p>
              </div>
            )}

            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                What Happens After Payment?
              </h4>
              <ol className="space-y-2 text-sm text-muted-foreground ml-7">
                <li className="flex gap-2">
                  <span className="font-bold text-primary">1.</span>
                  <span>Instant confirmation via email</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">2.</span>
                  <span>Coach assignment within 24 hours</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">3.</span>
                  <span>Your coach will contact you to start your program</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">4.</span>
                  <span>Access to exclusive Discord community</span>
                </li>
              </ol>
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
              onClick={handlePayment} 
              size="lg" 
              className="w-full text-lg h-14 bg-gradient-to-r from-primary to-accent hover:opacity-90"
              disabled={processingPayment}
            >
              {processingPayment ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Redirecting to Tap...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-5 w-5" />
                  Complete Payment ({finalPrice.toFixed(3)} KWD)
                </>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Secure payment powered by Tap Payments • All major cards accepted
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
