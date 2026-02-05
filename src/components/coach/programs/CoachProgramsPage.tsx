import { useState } from "react";
import { ProgramLibrary } from "./ProgramLibrary";
import { ProgramEditor } from "./ProgramEditor";
import { ProgramCalendarBuilder } from "./ProgramCalendarBuilder";

interface CoachProgramsPageProps {
  coachUserId: string;
}

export function CoachProgramsPage({ coachUserId }: CoachProgramsPageProps) {
  const [view, setView] = useState<"library" | "create" | "edit" | "calendar">("library");
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);

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
