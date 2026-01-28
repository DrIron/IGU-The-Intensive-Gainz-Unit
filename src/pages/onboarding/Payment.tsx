import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CreditCard, CheckCircle2, Shield, Loader2 } from "lucide-react";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { PaymentButton } from "@/components/PaymentButton";
import { supabase } from "@/integrations/supabase/client";

/**
 * Payment page - final onboarding step before activation.
 */
export default function Payment() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [service, setService] = useState<any>(null);

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
      } catch (error) {
        console.error("Error fetching payment data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <PublicLayout minimal>
        <div className="container max-w-2xl py-8 px-4 flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PublicLayout>
    );
  }

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
                      <span className="font-medium">{service.price_kwd} KWD/month</span>
                    </div>
                  )}
                </div>
              </div>
            )}

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
