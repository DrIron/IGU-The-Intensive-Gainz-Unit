import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, Clock, CheckCircle2, Mail, RefreshCw, Loader2 } from "lucide-react";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { supabase } from "@/integrations/supabase/client";
import { getOnboardingRedirect, ClientStatus } from "@/auth/onboarding";

interface CoachInfo {
  first_name: string;
  last_name: string | null;
  profile_picture_url: string | null;
}

/**
 * Awaiting Approval page - shown after medical clearance, waiting for coach assignment.
 * Polls every 30s to detect status changes and auto-redirect.
 */
export default function AwaitingApproval() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [coach, setCoach] = useState<CoachInfo | null>(null);
  const [needsCoachAssignment, setNeedsCoachAssignment] = useState(false);
  const [checking, setChecking] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout>();

  const fetchStatusAndCoach = useCallback(async (isManual = false) => {
    if (isManual) setChecking(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check current status — if it changed, redirect
      const { data: profile } = await supabase
        .from("profiles_public")
        .select("status")
        .eq("id", user.id)
        .single();

      if (profile?.status && profile.status !== "pending_coach_approval") {
        const redirect = getOnboardingRedirect(profile.status as ClientStatus);
        navigate(redirect || "/dashboard", { replace: true });
        return;
      }

      // Get subscription + coach info
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("coach_id, needs_coach_assignment")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sub?.needs_coach_assignment) {
        setNeedsCoachAssignment(true);
        setCoach(null);
      } else if (sub?.coach_id) {
        // Fetch coach info from the client-safe view
        const { data: coachData } = await supabase
          .from("coaches_client_safe")
          .select("first_name, last_name, profile_picture_url")
          .eq("user_id", sub.coach_id)
          .maybeSingle();

        if (coachData) {
          setCoach(coachData);
          setNeedsCoachAssignment(false);
        }
      }
    } catch (error) {
      console.error("Error fetching status:", error);
    } finally {
      setLoading(false);
      if (isManual) setChecking(false);
    }
  }, [navigate]);

  // Initial fetch
  useEffect(() => {
    fetchStatusAndCoach();
  }, [fetchStatusAndCoach]);

  // Poll every 30s
  useEffect(() => {
    pollIntervalRef.current = setInterval(() => {
      fetchStatusAndCoach();
    }, 30000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [fetchStatusAndCoach]);

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
        <OnboardingProgress currentStep="approval" />

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Coach Assignment in Progress
            </CardTitle>
            <CardDescription>
              We're matching you with the perfect coach for your goals
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert className="border-primary/50 bg-primary/10">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <AlertTitle>Great news!</AlertTitle>
              <AlertDescription>
                Your health questionnaire has been approved. We're now finding the
                best coach to help you achieve your fitness goals.
              </AlertDescription>
            </Alert>

            {/* Show assigned coach if available */}
            {coach && (
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 border">
                <Avatar className="h-14 w-14 shrink-0">
                  <AvatarImage src={coach.profile_picture_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold text-lg">
                    {coach.first_name.charAt(0)}{coach.last_name?.charAt(0) || ""}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm text-muted-foreground">Your assigned coach</p>
                  <p className="text-lg font-semibold">
                    {coach.first_name} {coach.last_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Reviewing your application now
                  </p>
                </div>
              </div>
            )}

            {/* Waiting for coach assignment */}
            {needsCoachAssignment && (
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                <p className="text-sm font-medium text-yellow-600">
                  We're finding the best available coach for your goals. This usually takes 24-48 hours.
                </p>
              </div>
            )}

            <div className="space-y-4">
              <h3 className="font-semibold">What's happening now?</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Clock className="h-4 w-4 mt-0.5 text-primary" />
                  <span>Coach matching typically takes 24-48 hours</span>
                </li>
                <li className="flex items-start gap-2">
                  <Users className="h-4 w-4 mt-0.5 text-primary" />
                  <span>We consider your goals, schedule, and preferences</span>
                </li>
                <li className="flex items-start gap-2">
                  <Mail className="h-4 w-4 mt-0.5 text-primary" />
                  <span>You'll receive an email when your coach is assigned</span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col gap-3">
              <Button
                variant="outline"
                onClick={() => fetchStatusAndCoach(true)}
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

            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="font-semibold mb-2">While you wait...</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Check out our free resources to get started on your fitness journey.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button variant="outline" asChild>
                  <a href="/calorie-calculator">
                    Free Calorie Calculator
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a href="/meet-our-team">
                    Meet Our Coaches
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
