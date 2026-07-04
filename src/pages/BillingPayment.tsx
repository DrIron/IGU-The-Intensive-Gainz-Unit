import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Navigation } from "@/components/Navigation";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { LEVEL_LABELS, type ProfessionalLevel } from "@/auth/roles";
import { PaymentHistoryCard } from "@/components/client/PaymentHistoryCard";
import {
  CreditCard,
  Calendar,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  Clock,
  UserCheck
} from "lucide-react";
import { format, addDays, differenceInDays } from "date-fns";

interface SubscriptionData {
  id: string;
  status: string;
  next_billing_date: string | null;
  past_due_since: string | null;
  grace_period_days: number;
  billing_amount_kwd: number | null;
  base_price_kwd: number | null;
  discount_code_id: string | null;
  service_id: string;
  services: {
    name: string;
    price_kwd: number;
  };
  discount_codes?: {
    code: string;
    discount_type: string;
    discount_value: number;
  } | null;
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

export default function BillingPayment() {
  const [loading, setLoading] = useState(true);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [paymentExempt, setPaymentExempt] = useState(false);
  const isSubmittingRef = useRef(false); // Prevent double submission
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user: sessionUser, isLoading: sessionLoading } = useAuthSession();

  const loadBillingData = useCallback(async (user: SupabaseUser | null) => {
    try {
      if (!user) {
        navigate("/auth");
        return;
      }

      setUserId(user.id);

      // Get profile info - split query for public/private data (RLS secured)
      const [{ data: profilePublic }, { data: profilePrivate }] = await Promise.all([
        supabase
          .from("profiles_public")
          .select("first_name, payment_exempt")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("profiles_private")
          .select("email, last_name")
          .eq("profile_id", user.id)
          .maybeSingle()
      ]);

      const profile = profilePublic && profilePrivate ? {
        email: profilePrivate.email,
        first_name: profilePublic.first_name,
        last_name: profilePrivate.last_name
      } : null;

      setPaymentExempt(Boolean(profilePublic?.payment_exempt));

      if (profile) {
        setUserEmail(profile.email || user.email || "");
        setUserName(`${profile.first_name || ""} ${profile.last_name || ""}`.trim());
      }

      // Get current subscription - separate queries (nested FK joins on subscriptions are banned)
      const { data: sub, error: subError } = await supabase
        .from("subscriptions")
        .select("id, status, next_billing_date, past_due_since, grace_period_days, billing_amount_kwd, base_price_kwd, discount_code_id, service_id")
        .eq("user_id", user.id)
        .in("status", ["active", "past_due", "pending"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subError) throw subError;

      if (!sub) {
        setSubscription(null);
        return;
      }

      const { data: service, error: serviceError } = await supabase
        .from("services")
        .select("name, price_kwd")
        .eq("id", sub.service_id)
        .maybeSingle();
      if (serviceError) throw serviceError;

      let discount: SubscriptionData["discount_codes"] = null;
      if (sub.discount_code_id) {
        const { data: discountData, error: discountError } = await supabase
          .from("discount_codes")
          .select("code, discount_type, discount_value")
          .eq("id", sub.discount_code_id)
          .maybeSingle();
        if (discountError) throw discountError;
        discount = discountData;
      }

      setSubscription({
        ...sub,
        services: service ?? { name: "", price_kwd: 0 },
        discount_codes: discount,
      } as SubscriptionData);

      // Resolve the level-based price for THIS subscription (depends on the assigned
      // coach's level). services.price_kwd is only the public "from" price, so it
      // would under-state the charge for a Senior/Lead coach -- always use the quote.
      const { data: quoteData, error: quoteError } = await supabase
        .rpc("get_subscription_price_quote", { p_subscription_id: sub.id });
      if (quoteError) {
        if (import.meta.env.DEV) console.error("Error resolving price quote:", quoteError);
        setQuote(null);
      } else if (quoteData) {
        setQuote(quoteData as unknown as PriceQuote);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error("Error loading billing data:", error);
      toast({
        title: "Error",
        description: "Failed to load billing information",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [navigate, toast]);

  // Keyed on session state so the effect retries once session resolves.
  const hasLoaded = useRef<string | null>(null);
  useEffect(() => {
    const key = sessionUser?.id ?? (sessionLoading ? "__waiting__" : "__unauth__");
    if (hasLoaded.current === key) return;
    hasLoaded.current = key;
    if (sessionLoading) return;
    loadBillingData(sessionUser ?? null);
  }, [sessionUser, sessionLoading, loadBillingData]);

  const handlePayment = useCallback(async () => {
    if (!subscription || !userId || processingPayment || isSubmittingRef.current) {
      if (import.meta.env.DEV) console.log('Payment already in progress or missing data');
      return;
    }

    isSubmittingRef.current = true;
    setProcessingPayment(true);
    setPaymentError(null);

    try {
      if (import.meta.env.DEV) console.log('Initiating TAP renewal payment...', { subscriptionId: subscription.id, userId });

      const { data, error } = await supabase.functions.invoke("create-tap-payment", {
        body: {
          serviceId: subscription.service_id,
          userId,
          customerEmail: userEmail,
          customerName: userName,
          isRenewal: true,
        },
      });

      if (error) throw error;

      if (data?.success && data?.paymentUrl) {
        // Show redirect toast
        toast({
          title: "Redirecting to payment...",
          description: "You'll be taken to TAP Payments to complete your transaction.",
        });
        
        // Keep loading state while redirecting - user will leave page
        setTimeout(() => {
          window.location.href = data.paymentUrl;
        }, 300);
      } else {
        throw new Error(data?.error || "Failed to initiate payment");
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error("Payment error:", error);
      setPaymentError(sanitizeErrorForUser(error));
      setProcessingPayment(false);
      isSubmittingRef.current = false;
    }
  }, [subscription, userId, userEmail, userName, processingPayment, toast]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Navigation />
        <div className="container mx-auto px-4 py-24 max-w-2xl">
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading billing information...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Navigation />
        <div className="container mx-auto px-4 py-24 max-w-2xl">
          <Card>
            <CardContent className="pt-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">No Payment Due</h2>
              <p className="text-muted-foreground mb-4">
                You don't have any pending payments at this time.
              </p>
              <Button onClick={() => navigate("/dashboard")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (paymentExempt) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Navigation />
        <div className="container mx-auto px-4 py-24 max-w-2xl">
          <Card>
            <CardContent className="pt-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">You're Payment Exempt</h2>
              <p className="text-muted-foreground mb-4">
                Your account is marked as payment-exempt. You don't need to make a payment to keep access to your plan.
              </p>
              <Button onClick={() => navigate("/dashboard")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const serviceName = subscription.services?.name || "Your Plan";
  // Resolved level-based list price (falls back to the public "from" price only if the
  // quote RPC failed). NOT services.price_kwd, which is just the "from" display price.
  const originalPrice = quote?.price_kwd ?? subscription.services?.price_kwd ?? 0;
  const finalPrice = subscription.billing_amount_kwd ?? originalPrice;
  // Build B: the client must explicitly confirm their assigned coach + resolved price
  // before we charge. Gate on the quote being present.
  const requiresConfirmation = quote !== null;
  const hasDiscount = subscription.discount_code_id && finalPrice < originalPrice;
  const discountAmount = originalPrice - finalPrice;
  
  const nextBillingDate = subscription.next_billing_date 
    ? new Date(subscription.next_billing_date) 
    : null;
  
  const pastDueSince = subscription.past_due_since
    ? new Date(subscription.past_due_since)
    : null;
  
  const gracePeriodDays = subscription.grace_period_days || 7;
  const graceDeadline = pastDueSince ? addDays(pastDueSince, gracePeriodDays) : null;
  
  const isPastDue = subscription.status === "past_due" || !!pastDueSince;
  const daysUntilGraceEnd = graceDeadline ? differenceInDays(graceDeadline, new Date()) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Navigation />
      <div className="container mx-auto px-4 py-24 max-w-2xl">
        <Button 
          variant="ghost" 
          onClick={() => navigate("/dashboard")}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>

        <Card className="border-2 border-primary/20 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-primary/5 to-accent/5">
            <div className="flex items-center gap-2">
              <CreditCard className="h-6 w-6 text-primary" />
              <CardTitle className="text-2xl">
                {isPastDue ? "Payment Required" : "Manual Monthly Payment"}
              </CardTitle>
            </div>
            <CardDescription className="text-base">
              {isPastDue 
                ? "Your payment is past due. Pay now to continue your subscription."
                : `Pay now to renew your ${serviceName} subscription`
              }
            </CardDescription>
            <p className="text-xs text-muted-foreground mt-2">
              No automatic charges – you control when to pay each month.
            </p>
          </CardHeader>

          <CardContent className="pt-6 space-y-6">
            {/* Past due warning */}
            {isPastDue && daysUntilGraceEnd !== null && daysUntilGraceEnd > 0 && (
              <Alert className="border-destructive bg-destructive/10">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="ml-2">
                  <strong>Grace period ends in {daysUntilGraceEnd} {daysUntilGraceEnd === 1 ? "day" : "days"}.</strong>
                  {" "}Pay before {graceDeadline ? format(graceDeadline, "MMMM dd, yyyy") : "the deadline"} to avoid service interruption.
                </AlertDescription>
              </Alert>
            )}

            {isPastDue && daysUntilGraceEnd !== null && daysUntilGraceEnd <= 0 && (
              <Alert className="border-destructive bg-destructive/10">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="ml-2">
                  <strong>Grace period expired.</strong>
                  {" "}Your subscription access may be limited. Pay now to restore full access.
                </AlertDescription>
              </Alert>
            )}

            {/* Plan details */}
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium">{serviceName}</span>
              </div>

              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-muted-foreground">Original Price</span>
                <span className={hasDiscount ? "line-through text-muted-foreground" : "font-medium"}>
                  {originalPrice} KWD
                </span>
              </div>

              {hasDiscount && subscription.discount_codes && (
                <div className="flex items-center justify-between py-3 border-b text-status-success">
                  <span className="flex items-center gap-2">
                    Discount
                    <Badge variant="outline" className="text-status-success border-status-success/30">
                      {subscription.discount_codes.code}
                    </Badge>
                  </span>
                  <span>-{discountAmount.toFixed(2)} KWD</span>
                </div>
              )}

              <div className="flex items-center justify-between py-3 border-b">
                <span className="font-semibold text-lg">Total Due</span>
                <span className="font-bold text-2xl text-primary">{finalPrice} KWD</span>
              </div>
            </div>

            {/* Dates */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Due Date:</span>
                <span className="font-medium">
                  {nextBillingDate 
                    ? format(nextBillingDate, "MMMM dd, yyyy")
                    : "Immediately"
                  }
                </span>
                {isPastDue && (
                  <Badge variant="destructive" className="ml-2">Past Due</Badge>
                )}
              </div>

              {graceDeadline && (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Grace Period Ends:</span>
                  <span className="font-medium text-destructive">
                    {format(graceDeadline, "MMMM dd, yyyy")}
                  </span>
                </div>
              )}
            </div>

            {/* Error message */}
            {paymentError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="ml-2">{paymentError}</AlertDescription>
              </Alert>
            )}

            {/* Build B: confirm assigned coach + resolved price before charging */}
            {quote && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-primary" />
                  <span className="font-medium">Confirm your coaching plan</span>
                </div>
                {quote.coach_assigned ? (
                  <p className="text-sm text-muted-foreground">
                    You've been matched with{" "}
                    <span className="font-medium text-foreground">
                      {quote.coach_display_name || "your coach"}
                    </span>
                    {quote.coach_level
                      ? ` (${LEVEL_LABELS[quote.coach_level] ?? quote.coach_level} coach)`
                      : ""}
                    . Your price for {quote.service_name || serviceName} is{" "}
                    <span className="font-semibold text-foreground">
                      {quote.price_kwd} KWD/month
                    </span>
                    .
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Your price for {quote.service_name || serviceName} is{" "}
                    <span className="font-semibold text-foreground">
                      {quote.price_kwd} KWD/month
                    </span>
                    .
                  </p>
                )}
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={confirmed}
                    onCheckedChange={(v) => setConfirmed(v === true)}
                    className="mt-0.5"
                  />
                  <span className="text-sm">
                    I understand and agree to be charged {finalPrice} KWD for this month.
                  </span>
                </label>
              </div>
            )}

            {/* Pay button */}
            <Button
              onClick={handlePayment}
              disabled={processingPayment || (requiresConfirmation && !confirmed)}
              variant="default"
              size="lg"
              className="w-full"
            >
              {processingPayment ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="h-5 w-5 mr-2" />
                  Pay {finalPrice} KWD Now
                </>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              You'll be redirected to TAP Payments. No card details will be saved – each monthly payment is manual.
            </p>
          </CardContent>
        </Card>

        {/* Payment History */}
        {userId && <PaymentHistoryCard userId={userId} />}
      </div>
    </div>
  );
}
