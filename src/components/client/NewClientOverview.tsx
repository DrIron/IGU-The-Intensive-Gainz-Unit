import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { QuickActionsGrid } from "./QuickActionsGrid";
import { CoachCard } from "./CoachCard";
import { PlanBillingCard } from "./PlanBillingCard";
import { PaymentAttentionBanner } from "./PaymentAttentionBanner";
import { AlertsCard } from "./AlertsCard";
import { LogTodayCard } from "./LogTodayCard";
import { MyCareTeamCard } from "./MyCareTeamCard";
import { TodaysWorkoutHero } from "./TodaysWorkoutHero";
import { AdherenceSummaryCard } from "./AdherenceSummaryCard";
import { WeeklyProgressCard } from "./WeeklyProgressCard";
import { NutritionTargetsCard } from "./NutritionTargetsCard";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ClickableCard } from "@/components/ui/clickable-card";
import { CardContent } from "@/components/ui/card";
import { Dumbbell, MessageSquare } from "lucide-react";
import { startOfIguWeek } from "@/lib/weekUtils";
import { captureException } from "@/lib/errorLogging";
import { isBoardV2Enabled } from "@/lib/featureFlags";
import { resolveActiveAssignment } from "@/lib/canonicalScheduleAdapter";

interface NewClientOverviewProps {
  user: any;
  profile: any;
  subscription: any;
}

interface PrimaryCoach {
  user_id: string;
  first_name: string;
  last_name: string | null;
  profile_picture_url: string | null;
}

interface CoachInfo {
  user_id: string;
  first_name: string;
  last_name: string | null;
  nickname: string | null;
  profile_picture_url: string | null;
}

export function NewClientOverview({ user, profile, subscription }: NewClientOverviewProps) {
  const [coach, setCoach] = useState<CoachInfo | null>(null);
  const [primaryCoach, setPrimaryCoach] = useState<PrimaryCoach | null>(null);
  const [activePhase, setActivePhase] = useState<any>(null);
  const [weeklyLogsCount, setWeeklyLogsCount] = useState<number>(0);
  // null = unknown / fetch failed (treat as "has program" so we don't show the
  // empty-state spuriously); number = authoritative count of client_programs rows.
  const [programCount, setProgramCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);
  const navigate = useNavigate();

  const loadDashboardData = useCallback(async () => {
    // user.id is now guaranteed by the useEffect gate below; defensive guard
    // only -- if it ever fires we still flip loading so the skeleton clears.
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      // Load coach info - subscriptions.coach_id references coaches.user_id
      if (subscription?.coach_id) {
        // Use coaches_directory (public-safe view) - only exposes safe public fields.
        // .maybeSingle() — coach row may legitimately be missing for new/exempt clients.
        const { data: coachData } = await supabase
          .from("coaches_directory")
          .select("user_id, first_name, last_name, nickname, profile_picture_url")
          .eq("user_id", subscription.coach_id)
          .maybeSingle();

        if (coachData) {
          setCoach(coachData);
          setPrimaryCoach({
            user_id: coachData.user_id,
            first_name: coachData.first_name,
            last_name: coachData.last_name,
            profile_picture_url: coachData.profile_picture_url,
          });
        }
      }

      // Load active nutrition phase (check both nutrition_phases and nutrition_goals for team plans)
      let phaseData = null;
      
      // First try nutrition_phases (for 1:1 clients with coach-managed phases)
      const { data: phaseResult } = await supabase
        .from("nutrition_phases")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      
      if (phaseResult) {
        phaseData = phaseResult;
      } else {
        // If no phase found, check nutrition_goals (for team plan self-service)
        const { data: goalResult } = await supabase
          .from("nutrition_goals")
          .select("*")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle();
        
        if (goalResult) phaseData = goalResult;
      }
      
      if (phaseData) setActivePhase(phaseData);

      // Count this week's weight logs
      if (phaseData) {
        // IGU adherence week — see weekUtils.ts
        const weekStart = startOfIguWeek();

        const { count } = await supabase
          .from("weight_logs")
          .select("*", { count: "exact", head: true })
          .eq("phase_id", phaseData.id)
          .gte("log_date", weekStart.toISOString());

        setWeeklyLogsCount(count || 0);
      }

      // Detect the "onboarded but no program yet" empty state. board_v2: a
      // canonical assignment is the program of record (a client may have an
      // assignment but no legacy client_programs row), so derive presence from
      // the active assignment. Flag off: count client_programs (head:true avoids
      // pulling rows). On error leave programCount null so noProgramYet stays
      // false — better to hide the empty state than show it spuriously.
      if (isBoardV2Enabled()) {
        try {
          const assignment = await resolveActiveAssignment(user.id);
          setProgramCount(assignment ? 1 : 0);
        } catch (aErr) {
          captureException(aErr, {
            source: "NewClientOverview.loadDashboardData.assignmentCount",
            severity: "warning",
            metadata: { userId: user.id },
          });
        }
      } else {
        const { count: pCount, error: pErr } = await supabase
          .from("client_programs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);
        if (pErr) {
          captureException(pErr, {
            source: "NewClientOverview.loadDashboardData.programCount",
            severity: "warning",
            metadata: { userId: user.id },
          });
        } else {
          setProgramCount(pCount ?? 0);
        }
      }
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, subscription?.coach_id]);

  useEffect(() => {
    // Wait for user.id before marking the fetch as done. Without this gate,
    // a first render with user undefined flipped hasFetched=true, the
    // early-return inside loadDashboardData skipped setLoading(false), and
    // the dashboard sat on its skeleton forever (April 26 -- Mubarak's repro).
    if (hasFetched.current || !user?.id) return;
    hasFetched.current = true;
    loadDashboardData();
  }, [user?.id, loadDashboardData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Payment Attention Banner - shows when payment is due soon or past due */}
      <PaymentAttentionBanner subscription={subscription} profile={profile} />

      {/* Alerts Section */}
      <AlertsCard
        profile={profile}
        subscription={subscription}
        weeklyLogsCount={weeklyLogsCount}
      />

      {/* Hero: Today's Workout — or empty state if onboarded but no program yet */}
      {programCount === 0 && profile?.status === "active" && subscription?.status === "active" ? (
        <ClickableCard
          onClick={() => navigate("/messages")}
          ariaLabel="Message your coach about program status"
        >
          <CardContent className="p-6 md:p-8 flex items-start gap-4">
            <div className="rounded-full bg-primary/10 p-3 flex-shrink-0">
              <Dumbbell className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg md:text-xl font-semibold">
                Your coach is preparing your program
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                We'll let you know as soon as your first workout is ready.
              </p>
              <div className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary">
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                Message your coach
              </div>
            </div>
          </CardContent>
        </ClickableCard>
      ) : (
        <TodaysWorkoutHero userId={user?.id} />
      )}

      {/* Main + rail. The main column carries the substantial, scannable
          content top-down (nutrition target → weekly numbers → adherence); the
          rail holds the quick + relational cards (daily log, coach, care team).
          The two columns flow independently (masonry-like) so the short cards
          stack to fill the rail's height instead of leaving dead space beside a
          taller card. Stacks to a single column on mobile (main, then rail). */}
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        <div className="space-y-6">
          <NutritionTargetsCard userId={user?.id} />
          <WeeklyProgressCard userId={user?.id} />
          <AdherenceSummaryCard userId={user?.id} />
        </div>
        <div className="space-y-6">
          {user?.id && (
            <LogTodayCard
              userId={user.id}
              phaseId={activePhase?.id ?? null}
              phaseStartDate={activePhase?.start_date ?? null}
            />
          )}
          {coach && (
            <CoachCard
              coach={{ ...coach, id: coach.user_id }}
              clientFirstName={profile?.first_name}
            />
          )}
          <MyCareTeamCard
            subscriptionId={subscription?.id}
            primaryCoach={primaryCoach}
            nextBillingDate={subscription?.next_billing_date}
          />
        </div>
      </div>

      {/* Utility nav */}
      <QuickActionsGrid
        profile={profile}
        subscription={subscription}
      />

      {/* Quiet "Account" group — billing demoted, visually secondary */}
      <section className="space-y-4 pt-4 border-t border-border/60">
        <h2 className="text-sm font-semibold text-muted-foreground">Account</h2>
        <PlanBillingCard
          subscription={subscription}
          onManageBilling={() => {
            navigate("/billing/pay");
          }}
        />
      </section>
    </div>
  );
}
