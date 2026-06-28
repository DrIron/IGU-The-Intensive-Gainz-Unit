// src/components/client-overview/tabs/WorkoutsTab.tsx
// Coach-facing Workouts tab for the Client Overview shell.
//
// Ownership note: this tab is the primary workouts surface for a single
// client going forward. Sub-components live under
// src/components/client-overview/workouts/**. Reuse — do not rebuild —
// AssignFromLibraryDialog + DirectClientCalendar for write actions.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dumbbell, Plus, CalendarPlus, Loader2, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DirectClientCalendar } from "@/components/coach/programs/DirectClientCalendar";
import { AssignFromLibraryDialog } from "@/components/coach/programs/AssignFromLibraryDialog";
import { VolumeChart } from "@/components/coach/VolumeChart";
import type { ClientOverviewTabProps } from "../types";
import { WorkoutAdherencePulse } from "../workouts/WorkoutAdherencePulse";
import { ClientProgramList } from "../workouts/ClientProgramList";
import { ClientProgramDrilldown } from "../workouts/ClientProgramDrilldown";
import { MuscleBuilderPage } from "@/components/coach/programs/muscle-builder/MuscleBuilderPage";
import { isClientProgramEditorEnabled } from "@/lib/featureFlags";
import { SessionLogViewer } from "../workouts/SessionLogViewer";
import { WorkoutPulse } from "../workouts/WorkoutPulse";
import { WorkoutTrendCards } from "../workouts/WorkoutTrendCards";
import { WorkoutHistoryTrends } from "../workouts/WorkoutHistoryTrends";
import {
  useAdherencePulse,
  useClientPrograms,
  useClientProgramDrilldown,
  type ClientProgramSummary,
  type DrilldownDay,
  type DrilldownModule,
} from "../workouts/useClientWorkouts";

/**
 * The shell supplies `{ clientUserId, profile, subscription, viewerRole }`.
 * We fetch workout-domain data (client_programs, days, modules, logs) here
 * and wire the existing assign + direct-calendar dialogs for write actions.
 * Coach's own user id is fetched once from auth — the ClientContext
 * contract intentionally doesn't include it.
 */
export function WorkoutsTab({ context }: ClientOverviewTabProps) {
  const { clientUserId, profile, subscription } = context;
  const navigate = useNavigate();

  // Coach's own user id — not on ClientContext, resolved once from auth.
  const [coachUserId, setCoachUserId] = useState<string | null>(null);
  const coachFetchedRef = useRef(false);
  useEffect(() => {
    if (coachFetchedRef.current) return;
    coachFetchedRef.current = true;
    supabase.auth
      .getUser()
      .then(({ data }) => setCoachUserId(data.user?.id ?? null));
  }, []);

  const { programs, loading: programsLoading, reload: reloadPrograms } =
    useClientPrograms(clientUserId);
  const { pulse, loading: pulseLoading } = useAdherencePulse(
    clientUserId,
    programs,
  );

  // Drill-down state.
  const [selected, setSelected] = useState<ClientProgramSummary | null>(null);
  const drilldown = useClientProgramDrilldown(selected?.id ?? null);

  // Session log viewer.
  const [logTarget, setLogTarget] = useState<{
    module: DrilldownModule;
    day: DrilldownDay;
  } | null>(null);

  // Write-action dialogs.
  const [assignOpen, setAssignOpen] = useState(false);
  const [directCalendarOpen, setDirectCalendarOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{
    programId: string;
    programTitle: string;
  } | null>(null);

  // B3 inner tabs: Pulse · Programs · Calendar · History.
  const [innerTab, setInnerTab] = useState("pulse");

  // P4 Editor v1 (flagged): the client's active canonical assignment + an in-board editor.
  // Edits persist as client_plan_overrides; legacy client_programs (above) is unaffected.
  const editorEnabled = isClientProgramEditorEnabled();
  const [canonicalAssignmentId, setCanonicalAssignmentId] = useState<string | null>(null);
  const [canonicalStartDate, setCanonicalStartDate] = useState<string | null>(null);
  const [editingAssignment, setEditingAssignment] = useState(false);
  const assignmentFetchedRef = useRef(false);
  useEffect(() => {
    if (!editorEnabled || assignmentFetchedRef.current) return;
    assignmentFetchedRef.current = true;
    supabase
      .from("client_plan_assignment")
      .select("id, start_date")
      .eq("client_id", clientUserId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setCanonicalAssignmentId(data?.id ?? null);
        setCanonicalStartDate(data?.start_date ?? null);
      });
  }, [editorEnabled, clientUserId]);

  const handleOpenProgram = useCallback((program: ClientProgramSummary) => {
    setSelected(program);
  }, []);
  const handleBackToList = useCallback(() => {
    setSelected(null);
    setLogTarget(null);
  }, []);
  const handleOpenModule = useCallback(
    (module: DrilldownModule, day: DrilldownDay) => {
      setLogTarget({ module, day });
    },
    [],
  );

  // Reassign flow — we reuse AssignFromLibraryDialog but it wants a
  // specific programId. For "assign a new program" we'd need a program
  // picker first; here we surface it only from a drill-down "Re-assign this
  // template" button so the programId is known.
  const handleReassignSource = useCallback((program: ClientProgramSummary) => {
    if (!program.sourceTemplateId) return;
    setAssignTarget({
      programId: program.sourceTemplateId,
      programTitle: program.title,
    });
    setAssignOpen(true);
  }, []);

  const clientName = useMemo(() => {
    return (
      profile.displayName?.trim() ||
      [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() ||
      "Client"
    );
  }, [profile]);

  const hasAnyProgram = programs.length > 0;

  return (
    <div className="space-y-5">
      <Tabs value={innerTab} onValueChange={setInnerTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pulse">Pulse</TabsTrigger>
          <TabsTrigger value="programs">Programs</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Pulse — the week at a glance (B3). */}
        <TabsContent value="pulse" className="mt-5">
          <WorkoutPulse clientUserId={clientUserId} />
        </TabsContent>

        {/* Programs — assign + the program list / drill-down. */}
        <TabsContent value="programs" className="mt-5 space-y-5">
          {/* P4 Editor v1 (flagged): in-board editor scoped to the client's assignment. */}
          {editorEnabled && editingAssignment && canonicalAssignmentId && coachUserId ? (
            <MuscleBuilderPage
              coachUserId={coachUserId}
              assignmentId={canonicalAssignmentId}
              clientName={profile.firstName ?? profile.displayName ?? undefined}
              boardContext="client"
              startDate={canonicalStartDate ?? undefined}
              onBack={() => setEditingAssignment(false)}
            />
          ) : (
          <>
          <WorkoutAdherencePulse pulse={pulse} loading={pulseLoading || programsLoading} />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={() => navigate("/coach/programs?tab=mesocycles")}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Assign program
            </Button>
            {editorEnabled && canonicalAssignmentId && (
              <Button size="sm" variant="outline" onClick={() => setEditingAssignment(true)}>
                <Dumbbell className="h-4 w-4 mr-1.5" />
                Edit in planning board (beta)
              </Button>
            )}
          </div>

          {selected ? (
            <ClientProgramDrilldown
              program={selected}
              days={drilldown.days}
              loading={drilldown.loading}
              error={drilldown.error}
              onBack={handleBackToList}
              onOpenModule={handleOpenModule}
            />
          ) : programsLoading ? (
            <Card>
              <CardContent className="py-12 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : !hasAnyProgram ? (
            <EmptyState onGoToPrograms={() => navigate("/coach/programs?tab=mesocycles")} />
          ) : (
            <ClientProgramList programs={programs} onOpen={handleOpenProgram} />
          )}

          {selected && selected.sourceTemplateId && (
            <div className="pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleReassignSource(selected)}
              >
                Re-assign this program template
              </Button>
            </div>
          )}
          </>
          )}
        </TabsContent>

        {/* Calendar — week/month view ships in B5; inject lives here. */}
        <TabsContent value="calendar" className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDirectCalendarOpen(true)}
              disabled={!coachUserId || !subscription}
              title={
                !subscription
                  ? "Client has no active subscription — cannot inject session"
                  : "Add a session directly to this client's calendar"
              }
            >
              <CalendarPlus className="h-4 w-4 mr-1.5" />
              Inject session
            </Button>
          </div>
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              <CalendarClock className="h-6 w-6 mx-auto mb-2 opacity-50" aria-hidden="true" />
              The week / month schedule view lands in B5. For now, inject one-off
              sessions above; scheduled sessions appear under Programs.
            </CardContent>
          </Card>
        </TabsContent>

        {/* History — tonnage/TUST trends + training volume. */}
        <TabsContent value="history" className="mt-5 space-y-5">
          {hasAnyProgram ? (
            <>
              <WorkoutTrendCards clientUserId={clientUserId} />
              <WorkoutHistoryTrends clientUserId={clientUserId} />
              <VolumeChart clientUserId={clientUserId} />
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Volume history appears once this client has a program.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Session log drawer/dialog */}
      <SessionLogViewer
        module={logTarget?.module ?? null}
        day={logTarget?.day ?? null}
        open={Boolean(logTarget)}
        onOpenChange={(open) => !open && setLogTarget(null)}
      />

      {/* Assign dialog — opens only when we have a target template id */}
      {assignTarget && coachUserId && (
        <AssignFromLibraryDialog
          open={assignOpen}
          onOpenChange={(open) => {
            setAssignOpen(open);
            if (!open) setAssignTarget(null);
          }}
          programId={assignTarget.programId}
          programTitle={assignTarget.programTitle}
          coachUserId={coachUserId}
          mode="client"
          onAssigned={reloadPrograms}
        />
      )}

      {/* Direct calendar — mounted in a Sheet so it doesn't wreck the tab
          layout. The component owns its own Dialog/Sheet children. */}
      {coachUserId && subscription && (
        <Sheet open={directCalendarOpen} onOpenChange={setDirectCalendarOpen}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-3xl overflow-y-auto pb-24 md:pb-8"
          >
            <SheetHeader className="mb-4">
              <SheetTitle>Direct calendar · {clientName}</SheetTitle>
            </SheetHeader>
            <DirectClientCalendar
              clientUserId={clientUserId}
              coachUserId={coachUserId}
              subscriptionId={subscription.id}
              clientName={clientName}
            />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function EmptyState({ onGoToPrograms }: { onGoToPrograms: () => void }) {
    return (                        
      <Card>                     
        <CardContent className="py-12">
          <div className="flex flex-col items-center text-center gap-3
  text-muted-foreground">     
            <div className="inline-flex items-center justify-center p-3 rounded-full bg-muted">
              <Dumbbell className="h-6 w-6" aria-hidden="true" />
            </div>              
            <div>                            
              <p className="font-medium text-foreground">No programs yet</p>   
              <p className="text-sm mt-1 max-w-xs">                          
                Assign a program from your library or inject a direct session  
  to                                                                         
                start this client on a workout track.                          
              </p>                                                             
            </div>                                                             
            <Button size="sm" onClick={onGoToPrograms}>                        
              Go to Programs                                                   
            </Button>            
          </div>                          
        </CardContent>                                                       
      </Card>                                                                  
    );                            
  }                                        
