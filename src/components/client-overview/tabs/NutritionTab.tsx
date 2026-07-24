import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CoachFoodLogDay } from "@/components/nutrition/food-log/CoachFoodLogDay";
import { NutritionIntakeHistory } from "@/components/nutrition/history/NutritionIntakeHistory";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Coffee, Flame, Footprints, Link2, Pencil, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LoadError } from "@/components/ui/load-error";
import { NutritionPhaseCard } from "@/components/nutrition/NutritionPhaseCard";
import { PhaseSwitcher } from "@/components/nutrition/PhaseSwitcher";
import { NutritionPermissionGate } from "@/components/nutrition/NutritionPermissionGate";
import { useNutritionPermissions } from "@/hooks/useNutritionPermissions";
import { CoachNutritionGoal } from "@/components/nutrition/CoachNutritionGoal";
import { CoachNutritionProgress } from "@/components/nutrition/CoachNutritionProgress";
import { NutritionCheckInCard } from "@/components/nutrition/NutritionCheckInCard";
import { CoachNutritionGraphs } from "@/components/nutrition/CoachNutritionGraphs";
import { CoachNutritionNotes } from "@/components/nutrition/CoachNutritionNotes";
import { ScheduledEventsCalendar } from "@/components/nutrition/ScheduledEventsCalendar";
import { AllPhasesWeightChart } from "@/components/nutrition/AllPhasesWeightChart";
import { AllPhasesStepsChart } from "@/components/nutrition/AllPhasesStepsChart";
import { AllPhasesBodyFatChart } from "@/components/nutrition/AllPhasesBodyFatChart";
import { AllPhasesCircumferenceChart } from "@/components/nutrition/AllPhasesCircumferenceChart";
import { DietBreakManager } from "@/components/nutrition/DietBreakManager";
import { RefeedDayScheduler } from "@/components/nutrition/RefeedDayScheduler";
import { StepProgressDisplay } from "@/components/nutrition/StepProgressDisplay";
import { StepRecommendationCard } from "@/components/nutrition/StepRecommendationCard";
import { LinkedContentList } from "@/components/educational/LinkedContentList";
import { PhaseWeightTrendCard } from "../nutrition/PhaseWeightTrendCard";
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
  const [loadError, setLoadError] = useState<Error | null>(null);
  const { clientUserId } = context;
  // B6: gate contextual-comment composers on the same edit permission as the
  // rest of the nutrition surface (React-Query cached — dedupes with the gates).
  const { canEdit: canComment } = useNutritionPermissions({ clientUserId });
  // All phases for the client. Ordered active-first, then start_date DESC --
  // PhaseSwitcher renders them in receipt order. The shell used to load only
  // the active phase; now it loads the full history and lets the coach pick.
  const [phases, setPhases] = useState<any[]>([]);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [phaseStats, setPhaseStats] = useState<PhaseStats | null>(null);
  const [innerTab, setInnerTab] = useState("this-week");
  const hasFetched = useRef<string | null>(null);

  // Stable identity so the phase-stats effect doesn't refire on every render.
  const selectedPhase = useMemo(
    () => phases.find((p) => p.id === selectedPhaseId) ?? null,
    [phases, selectedPhaseId],
  );

  // Past-phase guard threaded to every writeable child. Defaults to false when
  // no phase is selected (the empty-state UI handles that case separately).
  const isReadOnly = selectedPhase ? !selectedPhase.is_active : false;

  const loadClientPhases = useCallback(async () => {
    if (!clientUserId) return;

    const { data, error } = await supabase
      .from("nutrition_phases")
      .select("*")
      .eq("user_id", clientUserId)
      .order("is_active", { ascending: false }) // active first
      .order("start_date", { ascending: false }); // then most recent

    if (error) {
      // CC10: this used to `return` silently — the tab then rendered as "no phases",
      // so a failed fetch was indistinguishable from a client who has none.
      console.error("[NutritionTab] load phases:", error.message);
      setLoadError(new Error(error.message));
      return;
    }
    setLoadError(null);

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


  if (loadError) {
    return (
      <LoadError
        message="We couldn't load this client's nutrition phases. Check your connection and try again."
        onRetry={() => { setLoadError(null); void loadClientPhases(); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PhaseSwitcher
        phases={phases}
        selectedPhaseId={selectedPhaseId}
        onSelect={setSelectedPhaseId}
      />

      {/* Decision-first (B2): the current week's adjustment decision leads,
          above the phase hero. Active phases only -- past phases have no live
          decision. Shares CoachNutritionProgress's data/handlers via the
          "decision" variant, so it stays in lockstep with the History grid. */}
      {selectedPhase?.is_active && (
        <CoachNutritionProgress
          phase={selectedPhase}
          isReadOnly={isReadOnly}
          onAdjustmentMade={loadClientPhases}
          variant="decision"
        />
      )}

      {selectedPhase && (
        <NutritionPhaseCard
          phase={selectedPhase}
          weeksElapsed={phaseStats?.currentWeek}
          latestAverageWeight={phaseStats?.currentWeight}
          onEditPhase={() => setInnerTab("edit")}
          subject="coach"
        />
      )}

      <Tabs value={innerTab} onValueChange={setInnerTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="this-week">This week</TabsTrigger>
          <TabsTrigger value="food-log">Food log</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="edit">Edit phase</TabsTrigger>
        </TabsList>

        {/* This week -- the current-week context around the decision above.
            Redesign Stage 1: weight + steps as a two-up trend row, then the
            check-in, then diet break / refeed two-up, then the calendar. */}
        <TabsContent value="this-week" className="space-y-5">
          {selectedPhase ? (
            <>
              {/* Action row (Stage 3) -- feature visibility. The diet break /
                  refeed / steps / link managers open in dialogs instead of each
                  taking a full inline card. */}
              <div className="flex flex-wrap gap-2">
                <ActionDialog icon={Coffee} label="Diet break">
                  <NutritionPermissionGate clientUserId={clientUserId}>
                    <DietBreakManager
                      phase={selectedPhase}
                      clientUserId={clientUserId}
                      canEdit
                      isReadOnly={isReadOnly}
                      onBreakUpdated={loadClientPhases}
                    />
                  </NutritionPermissionGate>
                </ActionDialog>
                <ActionDialog icon={Flame} label="Refeed">
                  <NutritionPermissionGate clientUserId={clientUserId}>
                    <RefeedDayScheduler
                      phase={selectedPhase}
                      clientUserId={clientUserId}
                      canEdit
                      isReadOnly={isReadOnly}
                      onRefeedUpdated={loadClientPhases}
                    />
                  </NutritionPermissionGate>
                </ActionDialog>
                <ActionDialog icon={Footprints} label="Steps">
                  <NutritionPermissionGate clientUserId={clientUserId}>
                    <StepRecommendationCard
                      clientUserId={clientUserId}
                      canEdit
                      onRecommendationUpdated={loadClientPhases}
                    />
                  </NutritionPermissionGate>
                </ActionDialog>
                <ActionDialog icon={Link2} label="Link content">
                  <LinkedContentList
                    target={{
                      kind: "nutrition-phase",
                      id: selectedPhase.id,
                      title: selectedPhase.phase_name ?? "this phase",
                    }}
                    readOnly={isReadOnly}
                    emptyMessage="No content linked to this phase yet. Add recommended videos or learning paths."
                  />
                </ActionDialog>
                <Button variant="outline" size="sm" onClick={() => setInnerTab("edit")}>
                  <Pencil className="h-3.5 w-3.5 me-1.5" aria-hidden="true" />
                  Edit phase
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <PhaseWeightTrendCard phase={selectedPhase} />
                <StepProgressDisplay userId={clientUserId} />
              </div>
              <NutritionCheckInCard
                phaseId={selectedPhase.id}
                clientUserId={clientUserId}
                canComment={canComment}
              />
              <ScheduledEventsCalendar phaseId={selectedPhase.id} phase={selectedPhase} />
            </>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                Create a nutrition phase from Edit phase to start tracking this week.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* History -- trends, notes, and the full week-by-week adjustment grid. */}
        <TabsContent value="history" className="space-y-6">
          {selectedPhase ? (
            <>
              <AllPhasesWeightChart clientUserId={clientUserId} />
              <AllPhasesStepsChart clientUserId={clientUserId} />
              <AllPhasesBodyFatChart clientUserId={clientUserId} />
              <AllPhasesCircumferenceChart clientUserId={clientUserId} />
              {/* P5b -- logged food-intake trends + adherence, beside the measurement charts.
                  viewerRole now gates the dietitian/admin-only micronutrient trends panel, so
                  pass it through verbatim (admin + dietitian get micros; a plain coach doesn't). */}
              <NutritionIntakeHistory
                clientUserId={clientUserId}
                viewerRole={context.viewerRole}
              />
              <CoachNutritionGraphs phase={selectedPhase} />
              <CoachNutritionProgress
                phase={selectedPhase}
                isReadOnly={isReadOnly}
                onAdjustmentMade={loadClientPhases}
                clientUserId={clientUserId}
                canComment={canComment}
              />
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

        {/* Food log (P4) -- the coach/dietitian READ of what the client actually logged.
            NOT gated on selectedPhase: food logging is phase-independent, and the most useful
            time to read a client's intake is often before any phase exists. The RPC shapes the
            payload by role (a plain coach sees macros only; a dietitian sees micros too). */}
        <TabsContent value="food-log" className="space-y-6">
          <CoachFoodLogDay clientUserId={clientUserId} viewerRole={context.viewerRole} />
        </TabsContent>

        {/* Edit phase -- just the goal form now. Steps + linked content moved
            to the This-week action row (dialogs). */}
        <TabsContent value="edit" className="space-y-6">
          <NutritionPermissionGate clientUserId={clientUserId}>
            <CoachNutritionGoal
              clientUserId={clientUserId}
              phase={selectedPhase}
              isReadOnly={isReadOnly}
              onPhaseUpdated={loadClientPhases}
            />
          </NutritionPermissionGate>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** A compact action-row pill that opens its manager in a dialog (Stage 3). */
function ActionDialog({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Icon className="h-3.5 w-3.5 me-1.5" aria-hidden="true" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
