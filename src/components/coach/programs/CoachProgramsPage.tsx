import { useState } from "react";
import { ProgramLibrary } from "./ProgramLibrary";
import { ProgramEditor } from "./ProgramEditor";

interface CoachProgramsPageProps {
  coachUserId: string;
}

export function CoachProgramsPage({ coachUserId }: CoachProgramsPageProps) {
  const [view, setView] = useState<"library" | "create" | "edit">("library");
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);

  const handleCreateProgram = () => {
    setEditingProgramId(null);
    setView("create");
  };

  const handleEditProgram = (programId: string) => {
    setEditingProgramId(programId);
    setView("edit");
  };

  const handleBack = () => {
    setEditingProgramId(null);
    setView("library");
  };

  if (view === "create" || view === "edit") {
    return (
      <ProgramEditor
        coachUserId={coachUserId}
        programId={editingProgramId || undefined}
        onBack={handleBack}
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
