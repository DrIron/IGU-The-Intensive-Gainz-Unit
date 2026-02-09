import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CreditCard, CheckCircle2, Shield, Loader2, Clock, AlertTriangle } from "lucide-react";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { PaymentButton } from "@/components/PaymentButton";
import { supabase } from "@/integrations/supabase/client";

/**
 * Payment page - final onboarding step before activation.
 * Shows payment deadline countdown and optional discount code input.
 */
export default function Payment() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [service, setService] = useState<any>(null);
  const [paymentDeadline, setPaymentDeadline] = useState<Date | null>(null);
  const [discountCode, setDiscountCode] = useState("");
  const [discountApplied, setDiscountApplied] = useState<{
    type: string;
    value: number;
    adjustedPrice: number;
  } | null>(null);
  const [applyingDiscount, setApplyingDiscount] = useState(false);
  const [discountError, setDiscountError] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setUser(user);

        // Get subscription with service details
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("*, services(*)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (sub) {
          setSubscription(sub);
          setService(sub.services);
        }

        // Get payment deadline from profile
        const { data: profile } = await supabase
          .from("profiles_public")
          .select("payment_deadline")
          .eq("id", user.id)
          .single();

        if (profile?.payment_deadline) {
          setPaymentDeadline(new Date(profile.payment_deadline));
        }
      } catch (error) {
        if (import.meta.env.DEV) console.error("Error fetching payment data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleApplyDiscount = async () => {
    if (!discountCode.trim() || !service) return;

    setApplyingDiscount(true);
    setDiscountError("");
    setDiscountApplied(null);

    try {
      const { data, error } = await supabase.functions.invoke('apply-discount-code', {
        body: {
          code: discountCode.trim(),
          serviceId: service.id,
          userId: user.id,
        },
      });

      if (error) throw error;

      if (data?.success) {
        setDiscountApplied({
          type: data.discount_type,
          value: data.discount_value,
          adjustedPrice: data.adjusted_price,
        });
      } else {
        setDiscountError(data?.error || "Invalid discount code");
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error("Error applying discount:", error);
      setDiscountError("Failed to apply discount code. Please try again.");
    } finally {
      setApplyingDiscount(false);
    }
  };

  const getDeadlineInfo = () => {
    if (!paymentDeadline) return null;

    const now = new Date();
    const diff = paymentDeadline.getTime() - now.getTime();
    const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) {
      return { text: "Payment deadline has passed", urgent: true, daysLeft: 0 };
    }
    if (daysLeft <= 2) {
      return { text: `${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining`, urgent: true, daysLeft };
    }
    return { text: `${daysLeft} days remaining`, urgent: false, daysLeft };
  };

  const deadlineInfo = getDeadlineInfo();

  if (loading) {
    return (
      <PublicLayout minimal>
        <div className="container max-w-2xl py-8 px-4 flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PublicLayout>
    );
  }

  const displayPrice = discountApplied ? discountApplied.adjustedPrice : service?.price_kwd;

  return (
    <PublicLayout minimal>
      <div className="container max-w-2xl py-8 px-4">
        <OnboardingProgress currentStep="payment" />

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Complete Your Payment
            </CardTitle>
            <CardDescription>
              One final step to activate your account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert className="border-green-500/50 bg-green-500/10">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle>You're almost there!</AlertTitle>
              <AlertDescription>
                Your coach has been assigned and everything is ready. Complete your
                payment to activate your subscription and start your fitness journey.
              </AlertDescription>
            </Alert>

            {/* Payment deadline countdown */}
            {deadlineInfo && (
              <Alert className={deadlineInfo.urgent
                ? "border-red-500/50 bg-red-500/10"
                : "border-blue-500/50 bg-blue-500/10"
              }>
                {deadlineInfo.urgent ? (
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                ) : (
                  <Clock className="h-4 w-4 text-blue-600" />
                )}
                <AlertTitle>Payment Deadline</AlertTitle>
                <AlertDescription>
                  {deadlineInfo.urgent
                    ? `Please complete your payment soon — ${deadlineInfo.text.toLowerCase()}. Your spot may be released if payment is not received.`
                    : `You have ${deadlineInfo.text.toLowerCase()} to complete your payment.`
                  }
                </AlertDescription>
              </Alert>
            )}

            {service && (
              <div className="bg-muted/50 rounded-lg p-4">
                <h3 className="font-semibold mb-3">Your Selected Plan</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Plan</span>
                    <span className="font-medium">{service.name}</span>
                  </div>
                  {service.price_kwd && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Price</span>
                      <span className="font-medium">
                        {discountApplied ? (
                          <>
                            <span className="line-through text-muted-foreground mr-2">
                              {service.price_kwd} KWD
                            </span>
                            {displayPrice} KWD/month
                          </>
                        ) : (
                          `${service.price_kwd} KWD/month`
                        )}
                      </span>
                    </div>
                  )}
                  {discountApplied && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount applied</span>
                      <span className="font-medium">
                        {discountApplied.type === "percent_off"
                          ? `-${discountApplied.value}%`
                          : `-${discountApplied.value} KWD`
                        }
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Discount code input */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Promo Code</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={discountCode}
                  onChange={(e) => {
                    setDiscountCode(e.target.value);
                    setDiscountError("");
                  }}
                  placeholder="Enter promo code"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={!!discountApplied}
                />
                {discountApplied ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountApplied(null);
                      setDiscountCode("");
                    }}
                    className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleApplyDiscount}
                    disabled={applyingDiscount || !discountCode.trim()}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {applyingDiscount ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Apply"
                    )}
                  </button>
                )}
              </div>
              {discountError && (
                <p className="text-sm text-red-500">{discountError}</p>
              )}
              {discountApplied && (
                <p className="text-sm text-green-600">Promo code applied successfully!</p>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <Shield className="h-4 w-4 mt-0.5 text-primary" />
                <span>Secure payment powered by Tap Payments</span>
              </div>
            </div>

            {user && service?.id && (
              <PaymentButton
                serviceId={service.id}
                userId={user.id}
                userEmail={user.email || ""}
                userName={user.user_metadata?.full_name || user.user_metadata?.first_name || ""}
                className="w-full"
              />
            )}

            <p className="text-xs text-center text-muted-foreground">
              By completing this payment, you agree to our Terms of Service and Privacy Policy.
              You can cancel your subscription at any time.
            </p>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}
