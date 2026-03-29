import { useState, useCallback } from "react";
import { ProgramLibrary } from "./ProgramLibrary";
import { ProgramCalendarBuilder } from "./ProgramCalendarBuilder";
import { MuscleBuilderPage } from "./muscle-builder/MuscleBuilderPage";
import { MusclePlanLibrary } from "./muscle-builder/MusclePlanLibrary";
import { useSubrolePermissions } from "@/hooks/useSubrolePermissions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";

interface CoachProgramsPageProps {
  coachUserId: string;
}

export function CoachProgramsPage({ coachUserId }: CoachProgramsPageProps) {
  const [view, setView] = useState<"library" | "calendar" | "muscle-library" | "muscle-builder">("library");
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [previousView, setPreviousView] = useState<string | null>(null);
  const { canBuildPrograms, isLoading: permissionsLoading } = useSubrolePermissions(coachUserId);

  // Edit program → go to calendar (not the old linear editor)
  const handleEditProgram = useCallback((programId: string) => {
    setEditingProgramId(programId);
    setView("calendar");
  }, []);

  const handleBack = useCallback(() => {
    setEditingProgramId(null);
    setEditingTemplateId(null);
    if (previousView) {
      setView(previousView as any);
      setPreviousView(null);
    } else {
      setView("library");
    }
  }, [previousView]);

  // Muscle plan library: list all plans
  const handleMuscleLibrary = useCallback(() => {
    setView("muscle-library");
  }, []);

  // New blank muscle plan
  const handleNewMusclePlan = useCallback(() => {
    setEditingTemplateId(null);
    setPreviousView("muscle-library");
    setView("muscle-builder");
  }, []);

  // Edit existing muscle plan
  const handleEditMusclePlan = useCallback((templateId: string) => {
    setEditingTemplateId(templateId);
    setPreviousView("muscle-library");
    setView("muscle-builder");
  }, []);

  // Legacy: direct "Planning Board" from ProgramLibrary opens muscle library
  const handleMuscleBuilder = useCallback(() => {
    setView("muscle-library");
  }, []);

  const handleMuscleBuilderOpenProgram = useCallback((programId: string) => {
    setPreviousView("muscle-library");
    setEditingProgramId(programId);
    setView("calendar");
  }, []);

  // Gate: only show program builder to users with canBuildPrograms capability
  if (!permissionsLoading && !canBuildPrograms) {
    return (
      <Alert className="border-orange-500/30 bg-orange-500/5">
        <ShieldAlert className="h-4 w-4 text-orange-400" />
        <AlertDescription>
          You don't have the required subrole to build programs. Request the Coach, Physiotherapist, or Mobility Coach subrole from your profile settings.
        </AlertDescription>
      </Alert>
    );
  }

  if (view === "muscle-library") {
    return (
      <MusclePlanLibrary
        coachUserId={coachUserId}
        onNewPlan={handleNewMusclePlan}
        onEditPlan={handleEditMusclePlan}
        onBack={() => setView("library")}
      />
    );
  }

  if (view === "muscle-builder") {
    return (
      <MuscleBuilderPage
        coachUserId={coachUserId}
        existingTemplateId={editingTemplateId || undefined}
        onBack={handleBack}
        onOpenProgram={handleMuscleBuilderOpenProgram}
      />
    );
  }

  if (view === "calendar" && editingProgramId) {
    return (
      <ProgramCalendarBuilder
        programId={editingProgramId}
        coachUserId={coachUserId}
        onBack={handleBack}
      />
    );
  }

  return (
    <ProgramLibrary
      coachUserId={coachUserId}
      onCreateProgram={handleMuscleBuilder}
      onEditProgram={handleEditProgram}
    />
  );
}
