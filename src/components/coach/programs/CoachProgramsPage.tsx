import { useState, useCallback } from "react";
import { ProgramLibrary } from "./ProgramLibrary";
import { ProgramEditor } from "./ProgramEditor";
import { ProgramCalendarBuilder } from "./ProgramCalendarBuilder";
import { MuscleBuilderPage } from "./muscle-builder/MuscleBuilderPage";
import { useSubrolePermissions } from "@/hooks/useSubrolePermissions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";

interface CoachProgramsPageProps {
  coachUserId: string;
}

export function CoachProgramsPage({ coachUserId }: CoachProgramsPageProps) {
  const [view, setView] = useState<"library" | "create" | "edit" | "calendar" | "muscle-builder">("library");
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [previousView, setPreviousView] = useState<string | null>(null);
  const [focusModuleId, setFocusModuleId] = useState<string | null>(null);
  const { canBuildPrograms, isLoading: permissionsLoading } = useSubrolePermissions(coachUserId);

  const handleCreateProgram = useCallback(() => {
    setEditingProgramId(null);
    setView("create");
  }, []);

  const handleEditProgram = useCallback((programId: string) => {
    setEditingProgramId(programId);
    setView("edit");
  }, []);

  const handleCalendarView = useCallback((programId: string) => {
    setEditingProgramId(programId);
    setView("calendar");
  }, []);

  const handleBack = useCallback(() => {
    setEditingProgramId(null);
    if (previousView) {
      setView(previousView as any);
      setPreviousView(null);
    } else {
      setView("library");
    }
  }, [previousView]);

  const handleEditDay = useCallback((moduleId: string) => {
    setFocusModuleId(moduleId);
    setView("edit");
  }, []);

  const handleMuscleBuilder = useCallback(() => {
    setEditingProgramId(null);
    setView("muscle-builder");
  }, []);

  const handleMuscleBuilderOpenProgram = useCallback((programId: string) => {
    setPreviousView("muscle-builder");
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

  if (view === "muscle-builder") {
    return (
      <MuscleBuilderPage
        coachUserId={coachUserId}
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
        onEditDay={handleEditDay}
      />
    );
  }

  if (view === "create" || view === "edit") {
    return (
      <ProgramEditor
        coachUserId={coachUserId}
        programId={editingProgramId || undefined}
        onBack={handleBack}
        onCalendarView={editingProgramId ? () => handleCalendarView(editingProgramId) : undefined}
        focusModuleId={focusModuleId}
      />
    );
  }

  return (
    <ProgramLibrary
      coachUserId={coachUserId}
      onCreateProgram={handleCreateProgram}
      onEditProgram={handleEditProgram}
      onMuscleBuilder={handleMuscleBuilder}
    />
  );
}
