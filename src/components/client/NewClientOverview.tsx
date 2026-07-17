import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { QuickActionsGrid } from "./QuickActionsGrid";
import { PlanBillingCard } from "./PlanBillingCard";
import { PaymentAttentionBanner } from "./PaymentAttentionBanner";
import { AlertsCard } from "./AlertsCard";
import { LogTodayCard } from "./LogTodayCard";
import { MyCareTeamCard } from "./MyCareTeamCard";
import { TodaysWorkoutHero } from "./TodaysWorkoutHero";
import { ThisWeekCard } from "./ThisWeekCard";
import { TodayFoodCard } from "@/components/nutrition/food-log/TodayFoodCard";
import { supabase } from "@/integrations/supabase/client";
import { getActiveNutritionTarget } from "@/lib/nutritionTarget";
import { Skeleton } from "@/components/ui/skeleton";
import { ClickableCard } from "@/components/ui/clickable-card";
import { CardContent } from "@/components/ui/card";
import { Dumbbell, MessageSquare } from "lucide-react";
import { startOfIguWeek } from "@/lib/weekUtils";
import { captureException } from "@/lib/errorLogging";
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

export function NewClientOverview({ user, profile, subscription }: NewClientOverviewProps) {
  const [primaryCoach, setPrimaryCoach] = useState<PrimaryCoach | null>(null);
  const [activePhase, setActivePhase] = useState<any>(null);
  const [weeklyLogsCount, setWeeklyLogsCount] = useState<number>(0);
  // null = unknown / fetch failed (treat as "has program" so we don't show the
  // empty-state spuriously); 1 when an active canonical assignment exists, else 0.
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
      // Load primary coach - subscriptions.coach_id references coaches.user_id
      if (subscription?.coach_id) {
        // Use coaches_directory (public-safe view) - only exposes safe public fields.
        // .maybeSingle() — coach row may legitimately be missing for new/exempt clients.
        const { data: coachData } = await supabase
          .from("coaches_directory")
          .select("user_id, first_name, last_name, profile_picture_url")
          .eq("user_id", subscription.coach_id)
          .maybeSingle();

        if (coachData) {
          setPrimaryCoach({
            user_id: coachData.user_id,
            first_name: coachData.first_name,
            last_name: coachData.last_name,
            profile_picture_url: coachData.profile_picture_url,
          });
        }
      }

      // Active nutrition target via the shared phase-first-then-goals coalesce. This surface
      // uses the WHOLE row (id, etc.) for context, so it takes `.raw` — the untouched phase or
      // goal row, exactly what the inline block stored before (a goal row as phaseData when
      // there's no phase).
      const activeTarget = await getActiveNutritionTarget(user.id);
      const phaseData = activeTarget?.raw ?? null;
      if (phaseData) setActivePhase(phaseData);

      // Count this week's weight logs
      if (phaseData) {
        // IGU adherence week — see weekUtils.ts
        const weekStart = startOfIguWeek();

        const { count } = await supabase
          .from("weight_logs")
          .select("*", { count: "exact", head: true })
          .eq("phase_id", phaseData.id as string)
          .gte("log_date", weekStart.toISOString());

        setWeeklyLogsCount(count || 0);
      }

      // Detect the "onboarded but no program yet" empty state. The active canonical
      // assignment is the program of record (a client may have an assignment but no
      // legacy client_programs row). On error leave programCount null so
      // noProgramYet stays false — better to hide the empty state than show it
      // spuriously.
      try {
        setProgramCount((await resolveActiveAssignment(user.id)) ? 1 : 0);
      } catch (aErr) {
        captureException(aErr, {
          source: "NewClientOverview.loadDashboardData.assignmentCount",
          severity: "warning",
          metadata: { userId: user.id },
        });
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

      {/* Feature grid (1B). DOM order IS the mobile order (single column):
          Today's nutrition → Log today → This week → Your team. On lg the four cards
          reflow into a 2×2 grid via explicit column/row placement — main column
          (nutrition, this week) + rail (log today, your team) — matching the desktop
          spec without changing the mobile stack. */}
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        {/* Today's nutrition — main col, row 1 (1A card; its target lives in the donut). */}
        {profile?.status === "active" && subscription?.status === "active" && user?.id && (
          <div className="lg:col-start-1 lg:row-start-1">
            <TodayFoodCard clientUserId={user.id} />
          </div>
        )}

        {/* Log today — rail, row 1. Own card, placed high (Hasan). */}
        {user?.id && (
          <div className="lg:col-start-2 lg:row-start-1">
            <LogTodayCard
              userId={user.id}
              phaseId={activePhase?.id ?? null}
              phaseStartDate={activePhase?.start_date ?? null}
            />
          </div>
        )}

        {/* This week — main col, row 2. Adherence % + consistency dots + workouts/nutrition/weight. */}
        {user?.id && (
          <div className="lg:col-start-1 lg:row-start-2">
            <ThisWeekCard userId={user.id} />
          </div>
        )}

        {/* Your team — rail, row 2. Primary coach (with a Message action) + specialists. */}
        <div className="lg:col-start-2 lg:row-start-2">
          <MyCareTeamCard
            subscriptionId={subscription?.id}
            primaryCoach={primaryCoach}
            nextBillingDate={subscription?.next_billing_date}
          />
        </div>
      </div>

      {/* Explore — utility nav under its own quiet heading (mirrors Account). */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Explore</h2>
        <QuickActionsGrid
          profile={profile}
          subscription={subscription}
        />
      </section>

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
