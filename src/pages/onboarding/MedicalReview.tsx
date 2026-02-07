import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, Phone, Mail, Clock, RefreshCw, Loader2 } from "lucide-react";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { supabase } from "@/integrations/supabase/client";
import { getOnboardingRedirect, ClientStatus } from "@/auth/onboarding";

/**
 * Medical Review page - shown when PAR-Q flags health concerns.
 * User cannot proceed until admin/coach clears them.
 * Polls every 30s for status changes.
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
        .single();

      if (profile?.status && profile.status !== "needs_medical_review") {
        const redirect = getOnboardingRedirect(profile.status as ClientStatus);
        navigate(redirect || "/dashboard", { replace: true });
      }
    } catch (error) {
      console.error("Error checking status:", error);
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
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              Medical Review Required
            </CardTitle>
            <CardDescription>
              Your health questionnaire responses require additional review
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert className="border-yellow-500/50 bg-yellow-500/10">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertTitle>Why am I seeing this?</AlertTitle>
              <AlertDescription>
                Based on your PAR-Q (Physical Activity Readiness Questionnaire) responses,
                we need to ensure it's safe for you to begin training. This is a standard
                safety measure to protect your health.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <h3 className="font-semibold">What happens next?</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Clock className="h-4 w-4 mt-0.5 text-primary" />
                  <span>A coach will review your responses within 24-48 hours</span>
                </li>
                <li className="flex items-start gap-2">
                  <Phone className="h-4 w-4 mt-0.5 text-primary" />
                  <span>We may contact you for additional information</span>
                </li>
                <li className="flex items-start gap-2">
                  <Mail className="h-4 w-4 mt-0.5 text-primary" />
                  <span>You'll receive an email once your review is complete</span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col gap-3">
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

            <div className="border-t pt-6">
              <h3 className="font-semibold mb-3">Need to update your information?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                If you believe you made an error in your health questionnaire or have
                additional information to provide, please contact us.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button variant="outline" asChild>
                  <a href="mailto:support@theigu.com">
                    <Mail className="h-4 w-4 mr-2" />
                    Email Support
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}
