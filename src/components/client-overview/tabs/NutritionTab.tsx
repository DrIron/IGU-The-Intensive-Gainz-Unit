import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { NutritionPhaseCard } from "@/components/nutrition/NutritionPhaseCard";
import { PhaseSwitcher } from "@/components/nutrition/PhaseSwitcher";
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
 * Canonical surface for managing a client's nutrition. The legacy
 * /coach-client-nutrition route is now a redirect stub (see App.tsx
 * `CoachClientNutritionRedirect`); this component is the only entry.
 * 3-inner-tab layout (Overview / Adjustments / History), with shared
 * permission gates and hero card. Client identity comes from the shell's
 * `context.clientUserId`.
 */
export function NutritionTab({ context }: ClientOverviewTabProps) {
  const { clientUserId } = context;
  // All phases for the client. Ordered active-first, then start_date DESC --
  // PhaseSwitcher renders them in receipt order. The shell used to load only
  // the active phase; now it loads the full history and lets the coach pick.
  const [phases, setPhases] = useState<any[]>([]);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [phaseStats, setPhaseStats] = useState<PhaseStats | null>(null);
  const hasFetched = useRef<string | null>(null);

  // Stable identity so the phase-stats effect doesn't refire on every render.
  const selectedPhase = useMemo(
    () => phases.find((p) => p.id === selectedPhaseId) ?? null,
    [phases, selectedPhaseId],
  );

  const loadClientPhases = useCallback(async () => {
    if (!clientUserId) return;

    const { data, error } = await supabase
      .from("nutrition_phases")
      .select("*")
      .eq("user_id", clientUserId)
      .order("is_active", { ascending: false }) // active first
      .order("start_date", { ascending: false }); // then most recent

    if (error) {
      console.error("[NutritionTab] load phases:", error.message);
      return;
    }

    const list = data ?? [];
    setPhases(list);
    // Always snap to the first phase (active if any, else most recent). After
    // a coach saves/creates a phase the list reloads via onPhaseUpdated, and
    // re-snapping ensures the new active phase is what they see -- matches
    // the pre-switcher behavior where the active phase was always the focus.
    setSelectedPhaseId(list[0]?.id ?? null);
  }, [clientUserId]);

  useEffect(() => {
    if (hasFetched.current === clientUserId) return;
    hasFetched.current = clientUserId;
    loadClientPhases();
  }, [clientUserId, loadClientPhases]);

  // Recompute stats whenever the selected phase changes. Stats are
  // phase-scoped (weeks since *that* phase's start, weight logs and pending
  // adjustments keyed on *that* phase_id), so switching phases swaps the
  // stats payload too.
  useEffect(() => {
    let cancelled = false;
    if (!selectedPhase) {
      setPhaseStats(null);
      return;
    }

    const run = async () => {
      const weeksSinceStart =
        Math.floor(
          (Date.now() - new Date(selectedPhase.start_date).getTime()) /
            (7 * 24 * 60 * 60 * 1000),
        ) + 1;

      const [{ data: latestWeight }, { data: adjustments }] = await Promise.all([
        supabase
          .from("weight_logs")
          .select("weight_kg")
          .eq("phase_id", selectedPhase.id)
          .order("log_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("nutrition_adjustments")
          .select("id")
          .eq("phase_id", selectedPhase.id)
          .eq("status", "pending"),
      ]);

      if (cancelled) return;
      setPhaseStats({
        currentWeek: weeksSinceStart,
        currentWeight: latestWeight?.weight_kg,
        pendingAdjustments: adjustments?.length ?? 0,
      });
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [selectedPhase]);

  return (
    <div className="space-y-6">
      <PhaseSwitcher
        phases={phases}
        selectedPhaseId={selectedPhaseId}
        onSelect={setSelectedPhaseId}
      />

      {selectedPhase && (
        <NutritionPhaseCard
          phase={selectedPhase}
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
              phase={selectedPhase}
              onPhaseUpdated={loadClientPhases}
            />
          </NutritionPermissionGate>

          <div className="space-y-6">
            <StepProgressDisplay userId={clientUserId} />
            <NutritionPermissionGate clientUserId={clientUserId}>
              <StepRecommendationCard
                clientUserId={clientUserId}
                canEdit
                onRecommendationUpdated={loadClientPhases}
              />
            </NutritionPermissionGate>
          </div>
        </TabsContent>

        <TabsContent value="adjustments" className="space-y-6">
          <div id="nutrition-adjustments" />
          {selectedPhase ? (
            <>
              <CoachNutritionProgress phase={selectedPhase} onAdjustmentMade={loadClientPhases} />
              <ScheduledEventsCalendar phaseId={selectedPhase.id} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <NutritionPermissionGate clientUserId={clientUserId}>
                  <DietBreakManager
                    phase={selectedPhase}
                    clientUserId={clientUserId}
                    canEdit
                    onBreakUpdated={loadClientPhases}
                  />
                </NutritionPermissionGate>
                <NutritionPermissionGate clientUserId={clientUserId}>
                  <RefeedDayScheduler
                    phase={selectedPhase}
                    clientUserId={clientUserId}
                    canEdit
                    onRefeedUpdated={loadClientPhases}
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
          {selectedPhase ? (
            <>
              <CoachNutritionGraphs phase={selectedPhase} />
              <CoachNutritionNotes phase={selectedPhase} />
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
