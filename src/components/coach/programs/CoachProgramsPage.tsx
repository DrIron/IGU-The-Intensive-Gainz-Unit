import { useCallback, useMemo, useState } from "react";
import { ProgramLibrary } from "./ProgramLibrary";
import { ProgramCalendarBuilder } from "./ProgramCalendarBuilder";
import { MuscleBuilderPage } from "./muscle-builder/MuscleBuilderPage";
import { MusclePlanLibrary } from "./muscle-builder/MusclePlanLibrary";
import { MacrocycleLibrary } from "./macrocycles/MacrocycleLibrary";
import { MacrocycleEditor } from "./macrocycles/MacrocycleEditor";
import { useMacrocycleList } from "@/hooks/useMacrocycles";
import { useSubrolePermissions } from "@/hooks/useSubrolePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Plus, CalendarRange, BookOpen, FileEdit } from "lucide-react";
import { cn } from "@/lib/utils";

interface CoachProgramsPageProps {
  coachUserId: string;
}

type TabKey = "macrocycles" | "mesocycles" | "drafts";
type Detail =
  | { kind: "none" }
  | { kind: "macrocycle"; id: string | null }           // null = create new
  | { kind: "program-calendar"; programId: string }
  | { kind: "muscle-builder"; templateId: string | null }; // null = create new

/**
 * Coach Programs hub.
 *
 * Today's coach flow has three artifact types that belong together:
 *   - Macrocycles: 3-6 month training arcs (new)
 *   - Mesocycles:  completed program templates (existing)
 *   - Drafts:      planning-board muscle plans (existing)
 *
 * Instead of the previous 4-state view-router (library / muscle-library /
 * muscle-builder / calendar) we use a tabbed hub with nested detail pages.
 * Mobile: same tabs, content reorganised per-surface (card stacks, Drawer
 * assign dialogs, FAB primary action). Planning Board & Program Calendar
 * Builder are unchanged — they open as full-screen detail pages.
 */
export function CoachProgramsPage({ coachUserId }: CoachProgramsPageProps) {
  const { canBuildPrograms, isLoading: permissionsLoading } = useSubrolePermissions(coachUserId);
  const isMobile = useIsMobile();
  const { macrocycles } = useMacrocycleList(coachUserId);

  // Default tab: macrocycles if any exist, else mesocycles. Controlled once
  // the hook resolves — before that we show macrocycles which loads cleanly
  // with an empty state.
  const defaultTab: TabKey = useMemo(
    () => (macrocycles.length > 0 ? "macrocycles" : "mesocycles"),
    [macrocycles.length],
  );
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);
  const [detail, setDetail] = useState<Detail>({ kind: "none" });

  const closeDetail = useCallback(() => setDetail({ kind: "none" }), []);

  // Nav handlers from child components
  const openMacrocycle = useCallback((id: string) => setDetail({ kind: "macrocycle", id }), []);
  const newMacrocycle = useCallback(() => setDetail({ kind: "macrocycle", id: null }), []);
  const openProgram = useCallback((programId: string) => setDetail({ kind: "program-calendar", programId }), []);
  const newMusclePlan = useCallback(() => setDetail({ kind: "muscle-builder", templateId: null }), []);
  const editMusclePlan = useCallback(
    (templateId: string) => setDetail({ kind: "muscle-builder", templateId }),
    [],
  );

  // Permission gate
  if (!permissionsLoading && !canBuildPrograms) {
    return (
      <Alert className="border-orange-500/30 bg-orange-500/5">
        <ShieldAlert className="h-4 w-4 text-orange-400" />
        <AlertDescription>
          You don't have the required subrole to build programs. Request the Coach, Physiotherapist,
          or Mobility Coach subrole from your profile settings.
        </AlertDescription>
      </Alert>
    );
  }

  // Detail views take the whole surface.
  if (detail.kind === "macrocycle") {
    return (
      <MacrocycleEditor
        coachUserId={coachUserId}
        macrocycleId={detail.id}
        onBack={closeDetail}
        onOpenProgram={programId => setDetail({ kind: "program-calendar", programId })}
      />
    );
  }
  if (detail.kind === "program-calendar") {
    return (
      <ProgramCalendarBuilder
        programId={detail.programId}
        coachUserId={coachUserId}
        onBack={closeDetail}
      />
    );
  }
  if (detail.kind === "muscle-builder") {
    return (
      <MuscleBuilderPage
        coachUserId={coachUserId}
        existingTemplateId={detail.templateId ?? undefined}
        onBack={closeDetail}
        onOpenProgram={programId => setDetail({ kind: "program-calendar", programId })}
      />
    );
  }

  // Context-aware primary action — label + handler follow the active tab.
  const primary = ((): { label: string; onClick: () => void } => {
    if (activeTab === "macrocycles") return { label: "New Macrocycle", onClick: newMacrocycle };
    if (activeTab === "drafts") return { label: "New Plan", onClick: newMusclePlan };
    // Mesocycles tab: creating a mesocycle still goes through Planning Board.
    return { label: "Create Mesocycle", onClick: newMusclePlan };
  })();

  return (
    <div className="space-y-4">
      {/* Header: title + desktop primary action. Mobile uses FAB below. */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Programs</h2>
          <p className="text-muted-foreground text-sm">
            Build, chain, and assign your training programs.
          </p>
        </div>
        {!isMobile && (
          <Button onClick={primary.onClick}>
            <Plus className="h-4 w-4 mr-2" />
            {primary.label}
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as TabKey)} className="w-full">
        {/* Tabs list — horizontal scroll on mobile if cramped */}
        <div className="overflow-x-auto -mx-1 px-1">
          <TabsList className="w-full md:w-auto">
            <TabsTrigger value="macrocycles" className="flex items-center gap-1.5">
              <CalendarRange className="h-3.5 w-3.5" />
              Macrocycles
              {macrocycles.length > 0 && (
                <span className="ml-1 text-[10px] text-muted-foreground">· {macrocycles.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="mesocycles" className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              Mesocycles
            </TabsTrigger>
            <TabsTrigger value="drafts" className="flex items-center gap-1.5">
              <FileEdit className="h-3.5 w-3.5" />
              Drafts
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="macrocycles" className="mt-4">
          <MacrocycleLibrary
            coachUserId={coachUserId}
            onOpenMacrocycle={openMacrocycle}
            onNewMacrocycle={newMacrocycle}
          />
        </TabsContent>

        <TabsContent value="mesocycles" className="mt-4">
          <ProgramLibrary
            coachUserId={coachUserId}
            onCreateProgram={newMusclePlan}
            onEditProgram={openProgram}
            onEditInPlanningBoard={editMusclePlan}
          />
        </TabsContent>

        <TabsContent value="drafts" className="mt-4">
          <MusclePlanLibrary
            coachUserId={coachUserId}
            onNewPlan={newMusclePlan}
            onEditPlan={editMusclePlan}
            onBack={() => setActiveTab("mesocycles")}
          />
        </TabsContent>
      </Tabs>

      {/* Mobile FAB — above the bottom nav dock (h-16) */}
      {isMobile && (
        <Button
          onClick={primary.onClick}
          className={cn(
            "fixed bottom-20 right-4 z-40 h-14 w-14 rounded-full shadow-lg",
            "active:scale-95 transition-transform",
          )}
          aria-label={primary.label}
        >
          <Plus className="h-6 w-6" />
        </Button>
      )}
    </div>
  );
}
