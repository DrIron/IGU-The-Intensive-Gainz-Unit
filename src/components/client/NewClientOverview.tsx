import { useState, useEffect } from "react";
import { QuickActionsGrid } from "./QuickActionsGrid";
import { CoachCard } from "./CoachCard";
import { PlanBillingCard } from "./PlanBillingCard";
import { PaymentDueCard } from "./PaymentDueCard";
import { PaymentAttentionBanner } from "./PaymentAttentionBanner";
import { ProgressSummaryCard } from "./ProgressSummaryCard";
import { AlertsCard } from "./AlertsCard";
import { MyCareTeamCard } from "./MyCareTeamCard";
import { TodaysWorkoutHero } from "./TodaysWorkoutHero";
import { AdherenceSummaryCard } from "./AdherenceSummaryCard";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

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
  const [formSubmission, setFormSubmission] = useState<any>(null);
  const [weeklyLogsCount, setWeeklyLogsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [user?.id, subscription?.coach_id]);

  const loadDashboardData = async () => {
    if (!user?.id) return;

    try {
      // Load coach info - subscriptions.coach_id references coaches.user_id
      if (subscription?.coach_id) {
        // Use coaches_directory (public-safe view) - only exposes safe public fields
        const { data: coachData } = await supabase
          .from("coaches_directory")
          .select("user_id, first_name, last_name, nickname, profile_picture_url")
          .eq("user_id", subscription.coach_id)
          .single();
        
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

      // Load form submission status (safe table - no PHI)
      const { data: formData } = await supabase
        .from("form_submissions_safe")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (formData) setFormSubmission(formData);

      // Count this week's weight logs
      if (phaseData) {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);

        const { count } = await supabase
          .from("weight_logs")
          .select("*", { count: "exact", head: true })
          .eq("phase_id", phaseData.id)
          .gte("log_date", weekStart.toISOString());
        
        setWeeklyLogsCount(count || 0);
      }
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

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
        formSubmission={formSubmission}
        weeklyLogsCount={weeklyLogsCount}
      />

      {/* Today's Workout Hero */}
      <TodaysWorkoutHero userId={user?.id} />

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <QuickActionsGrid
          profile={profile}
          subscription={subscription}
        />
      </div>

      {/* Adherence Summary */}
      <AdherenceSummaryCard userId={user?.id} />

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Payment Due Card - shows next payment info for active subscriptions */}
          <PaymentDueCard subscription={subscription} />
          
          <PlanBillingCard
            subscription={subscription}
            onManageBilling={() => {
              window.location.href = "/billing/pay";
            }}
          />
          
          {/* My Care Team Card - shows primary coach + specialists with end dates */}
          <MyCareTeamCard
            subscriptionId={subscription?.id}
            primaryCoach={primaryCoach}
            nextBillingDate={subscription?.next_billing_date}
          />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <ProgressSummaryCard phase={activePhase} />
          
          {/* Legacy CoachCard for WhatsApp contact - only if coach exists */}
          {coach && (
            <CoachCard
              coach={{ ...coach, id: coach.user_id }}
              clientFirstName={profile?.first_name}
            />
          )}
        </div>
      </div>
    </div>
  );
}
