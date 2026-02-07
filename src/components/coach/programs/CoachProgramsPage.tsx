import { useState } from "react";
import { ProgramLibrary } from "./ProgramLibrary";
import { ProgramEditor } from "./ProgramEditor";
import { ProgramCalendarBuilder } from "./ProgramCalendarBuilder";
import { useSubrolePermissions } from "@/hooks/useSubrolePermissions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";

interface CoachProgramsPageProps {
  coachUserId: string;
}

export function CoachProgramsPage({ coachUserId }: CoachProgramsPageProps) {
  const [view, setView] = useState<"library" | "create" | "edit" | "calendar">("library");
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const { canBuildPrograms, isLoading: permissionsLoading } = useSubrolePermissions(coachUserId);

  const handleCreateProgram = () => {
    setEditingProgramId(null);
    setView("create");
  };

  const handleEditProgram = (programId: string) => {
    setEditingProgramId(programId);
    setView("edit");
  };

  const handleCalendarView = (programId: string) => {
    setEditingProgramId(programId);
    setView("calendar");
  };

  const handleBack = () => {
    setEditingProgramId(null);
    setView("library");
  };

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

  if (view === "calendar" && editingProgramId) {
    return (
      <ProgramCalendarBuilder
        programId={editingProgramId}
        coachUserId={coachUserId}
        onBack={handleBack}
        onEditDay={(dayId) => {
          // Switch to edit view to edit the day's modules
          setView("edit");
        }}
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
      />
    );
  }

  return (
    <ProgramLibrary
      coachUserId={coachUserId}
      onCreateProgram={handleCreateProgram}
      onEditProgram={handleEditProgram}
    />
  );
}
