import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, Mail, Shield, RefreshCw, Loader2, Calculator, Users } from "lucide-react";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { OnboardingStepTracker } from "@/components/onboarding/OnboardingStepTracker";
import { supabase } from "@/integrations/supabase/client";
import { getOnboardingRedirect, ClientStatus } from "@/auth/onboarding";

const STEP_TRACKER_STEPS = [
  { id: "account", label: "Account created", status: "completed" as const },
  { id: "intake", label: "Intake form submitted", status: "completed" as const },
  {
    id: "medical",
    label: "Medical review in progress",
    status: "current" as const,
    description: "We review flagged items within 24 hours",
  },
  { id: "coach", label: "Coach assignment", status: "upcoming" as const },
  { id: "payment", label: "Payment & activation", status: "upcoming" as const },
];

/**
 * Medical Review page - shown when PAR-Q flags health concerns.
 * User cannot proceed until admin/coach clears them.
 * Polls every 30s for status changes.
 * Enhanced with step tracker and SLA messaging.
 */
export default function MedicalReview() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout>();

  const checkStatus = useCallback(async (isManual = false) => {
    if (isManual) setChecking(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles_public")
        .select("status")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.status && profile.status !== "needs_medical_review") {
        const redirect = getOnboardingRedirect(profile.status as ClientStatus);
        navigate(redirect || "/dashboard", { replace: true });
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error("Error checking status:", error);
    } finally {
      if (isManual) setChecking(false);
    }
  }, [navigate]);

  // Poll every 30s
  useEffect(() => {
    pollIntervalRef.current = setInterval(() => {
      checkStatus();
    }, 30000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [checkStatus]);

  return (
    <PublicLayout minimal>
      <div className="container max-w-2xl py-8 px-4">
        <OnboardingProgress currentStep="medical" />

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-yellow-600" />
              Medical Review in Progress
            </CardTitle>
            <CardDescription>
              Your health questionnaire responses require additional review
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Step Tracker */}
            <OnboardingStepTracker steps={STEP_TRACKER_STEPS} />

            {/* Why section */}
            <Alert className="border-yellow-500/30 bg-yellow-500/10">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertTitle>Why am I seeing this?</AlertTitle>
              <AlertDescription>
                Based on your PAR-Q (Physical Activity Readiness Questionnaire) responses,
                we need to ensure it's safe for you to begin training. This is a standard
                safety measure to protect your health.
              </AlertDescription>
            </Alert>

            {/* SLA messaging */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="font-semibold text-sm">What happens next?</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-medium shrink-0">1.</span>
                  <span>Our team reviews your health responses -- typically within <strong className="text-foreground">24 hours</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-medium shrink-0">2.</span>
                  <span>We may reach out if we need more information</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-medium shrink-0">3.</span>
                  <span>Once cleared, you'll be matched with a coach and can proceed to payment</span>
                </li>
              </ul>
            </div>

            {/* Check Status */}
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={() => checkStatus(true)}
                disabled={checking}
              >
                {checking ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Check Status
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                This page automatically checks for updates every 30 seconds
              </p>
            </div>

            {/* While You Wait section */}
            <div className="border-t pt-6">
              <h3 className="font-semibold mb-4">While you wait</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <a
                  href="/calorie-calculator"
                  className="group flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Calculator className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium group-hover:text-primary transition-colors">
                      Calorie Calculator
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Estimate your daily calorie needs
                    </p>
                  </div>
                </a>

                <a
                  href="/meet-our-team"
                  className="group flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium group-hover:text-primary transition-colors">
                      Meet Our Coaches
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Get to know the team behind IGU
                    </p>
                  </div>
                </a>
              </div>
            </div>

            {/* Contact */}
            <div className="border-t pt-6">
              <h3 className="font-semibold mb-2">Need to update your information?</h3>
              <p className="text-sm text-muted-foreground mb-3">
                If you believe you made an error in your health questionnaire or have
                additional information to provide, please contact us.
              </p>
              <Button variant="outline" asChild>
                <a href="mailto:support@theigu.com">
                  <Mail className="h-4 w-4 mr-2" />
                  Email Support
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}
