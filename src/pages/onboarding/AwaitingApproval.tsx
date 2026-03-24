import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, CheckCircle2, RefreshCw, Loader2, Calculator, BookOpen, Dumbbell } from "lucide-react";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { OnboardingStepTracker } from "@/components/onboarding/OnboardingStepTracker";
import { supabase } from "@/integrations/supabase/client";
import { getOnboardingRedirect, ClientStatus } from "@/auth/onboarding";

interface CoachInfo {
  first_name: string;
  last_name: string | null;
  profile_picture_url: string | null;
}

function getStepTrackerSteps(needsCoachAssignment: boolean, hasCoach: boolean) {
  return [
    { id: "account", label: "Account created", status: "completed" as const },
    { id: "intake", label: "Intake form submitted", status: "completed" as const },
    { id: "medical", label: "Medical clearance passed", status: "completed" as const },
    {
      id: "coach",
      label: hasCoach ? "Coach assigned -- reviewing your profile" : "Finding your coach",
      status: "current" as const,
      description: needsCoachAssignment
        ? "We're matching you based on your goals and preferences"
        : hasCoach
        ? "Your coach is reviewing your application"
        : "Usually takes 24-48 hours",
    },
    {
      id: "payment",
      label: "Payment & activation",
      status: "upcoming" as const,
    },
  ];
}

/**
 * Awaiting Approval page - shown after medical clearance, waiting for coach assignment.
 * Polls every 30s to detect status changes and auto-redirect.
 * Enhanced with step tracker and "while you wait" resources.
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
        .maybeSingle();

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
      if (import.meta.env.DEV) console.error("Error fetching status:", error);
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

  const steps = getStepTrackerSteps(needsCoachAssignment, !!coach);

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
            {/* Step Tracker */}
            <OnboardingStepTracker steps={steps} />

            {/* Show assigned coach if available */}
            {coach && (
              <div className="flex items-center gap-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
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

            {/* Estimated timeline */}
            <Alert className="border-primary/30 bg-primary/5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <AlertTitle>You're in good hands</AlertTitle>
              <AlertDescription>
                Coach matching typically takes 24-48 hours. We consider your goals,
                schedule, and preferences to find the best fit. You'll receive an email
                when your coach is assigned.
              </AlertDescription>
            </Alert>

            {/* Check Status */}
            <div className="flex flex-col gap-2">
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

                <a
                  href="/services"
                  className="group flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <BookOpen className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium group-hover:text-primary transition-colors">
                      Explore Our Services
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Learn what each plan offers
                    </p>
                  </div>
                </a>

                <a
                  href="/"
                  className="group flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Dumbbell className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium group-hover:text-primary transition-colors">
                      What to Expect
                    </p>
                    <p className="text-xs text-muted-foreground">
                      See how your coaching journey works
                    </p>
                  </div>
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}
