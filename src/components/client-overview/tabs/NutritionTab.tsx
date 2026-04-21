import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { NutritionPhaseCard } from "@/components/nutrition/NutritionPhaseCard";
import { NutritionPermissionGate } from "@/components/nutrition/NutritionPermissionGate";
import { CoachNutritionGoal } from "@/components/nutrition/CoachNutritionGoal";
import { CoachNutritionProgress } from "@/components/nutrition/CoachNutritionProgress";
import { CoachNutritionGraphs } from "@/components/nutrition/CoachNutritionGraphs";
import { CoachNutritionNotes } from "@/components/nutrition/CoachNutritionNotes";
import { ScheduledEventsCalendar } from "@/components/nutrition/ScheduledEventsCalendar";
import { DietBreakManager } from "@/components/nutrition/DietBreakManager";
import { RefeedDayScheduler } from "@/components/nutrition/RefeedDayScheduler";
import { StepProgressDisplay } from "@/components/nutrition/StepProgressDisplay";
import { StepRecommendationCard } from "@/components/nutrition/StepRecommendationCard";
import type { ClientOverviewTabProps } from "../types";

interface PhaseStats {
  currentWeek: number;
  currentWeight?: number;
  pendingAdjustments: number;
}

/**
 * Coach-facing nutrition tab for the Client Overview page.
 *
 * Port of /coach-client-nutrition minus the client picker (the shell resolves
 * the client upstream). Feature parity: same 3-inner-tab layout (Overview /
 * Adjustments / History), same permission gates, same hero card. Remove the
 * shell's /coach-client-nutrition route only after this tab is live in the
 * shell -- see docs/CLIENT_OVERVIEW_HANDOFF.md.
 */
export function NutritionTab({ context }: ClientOverviewTabProps) {
  const { clientUserId } = context;
  const [activePhase, setActivePhase] = useState<any>(null);
  const [phaseStats, setPhaseStats] = useState<PhaseStats | null>(null);
  const hasFetched = useRef<string | null>(null);

  const loadClientPhase = useCallback(async () => {
    if (!clientUserId) return;

    const { data: phaseData, error } = await supabase
      .from("nutrition_phases")
      .select("*")
      .eq("user_id", clientUserId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (error) {
      console.error("[NutritionTab] load phase:", error.message);
      return;
    }

    setActivePhase(phaseData);

    if (!phaseData) {
      setPhaseStats(null);
      return;
    }

    const weeksSinceStart =
      Math.floor((Date.now() - new Date(phaseData.start_date).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;

    const [{ data: latestWeight }, { data: adjustments }] = await Promise.all([
      supabase
        .from("weight_logs")
        .select("weight_kg")
        .eq("phase_id", phaseData.id)
        .order("log_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("nutrition_adjustments")
        .select("id")
        .eq("phase_id", phaseData.id)
        .eq("status", "pending"),
    ]);

    setPhaseStats({
      currentWeek: weeksSinceStart,
      currentWeight: latestWeight?.weight_kg,
      pendingAdjustments: adjustments?.length ?? 0,
    });
  }, [clientUserId]);

  useEffect(() => {
    if (hasFetched.current === clientUserId) return;
    hasFetched.current = clientUserId;
    loadClientPhase();
  }, [clientUserId, loadClientPhase]);

  return (
    <div className="space-y-6">
      {activePhase && (
        <NutritionPhaseCard
          phase={activePhase}
          weeksElapsed={phaseStats?.currentWeek}
          latestAverageWeight={phaseStats?.currentWeight}
          onScrollToAdjustments={() => {
            const el = document.getElementById("nutrition-adjustments");
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <NutritionPermissionGate clientUserId={clientUserId}>
            <CoachNutritionGoal
              clientUserId={clientUserId}
              phase={activePhase}
              onPhaseUpdated={loadClientPhase}
            />
          </NutritionPermissionGate>

          <div className="space-y-6">
            <StepProgressDisplay userId={clientUserId} />
            <NutritionPermissionGate clientUserId={clientUserId}>
              <StepRecommendationCard
                clientUserId={clientUserId}
                canEdit
                onRecommendationUpdated={loadClientPhase}
              />
            </NutritionPermissionGate>
          </div>
        </TabsContent>

        <TabsContent value="adjustments" className="space-y-6">
          <div id="nutrition-adjustments" />
          {activePhase ? (
            <>
              <CoachNutritionProgress phase={activePhase} onAdjustmentMade={loadClientPhase} />
              <ScheduledEventsCalendar phaseId={activePhase.id} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <NutritionPermissionGate clientUserId={clientUserId}>
                  <DietBreakManager
                    phase={activePhase}
                    clientUserId={clientUserId}
                    canEdit
                    onBreakUpdated={loadClientPhase}
                  />
                </NutritionPermissionGate>
                <NutritionPermissionGate clientUserId={clientUserId}>
                  <RefeedDayScheduler
                    phase={activePhase}
                    clientUserId={clientUserId}
                    canEdit
                    onRefeedUpdated={loadClientPhase}
                  />
                </NutritionPermissionGate>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                Create a nutrition phase from the Overview tab before adjusting.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          {activePhase ? (
            <>
              <CoachNutritionGraphs phase={activePhase} />
              <CoachNutritionNotes phase={activePhase} />
            </>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                No phase yet -- history will populate once the first phase is saved.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
