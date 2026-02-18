import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProgramLibrary } from "./ProgramLibrary";
import { ProgramEditor } from "./ProgramEditor";
import { ProgramCalendarBuilder } from "./ProgramCalendarBuilder";
import { MuscleBuilderPage } from "./muscle-builder/MuscleBuilderPage";
import { MusclePlanLibrary } from "./muscle-builder/MusclePlanLibrary";
import { useSubrolePermissions } from "@/hooks/useSubrolePermissions";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShieldAlert } from "lucide-react";

interface CoachProgramsPageProps {
  coachUserId: string;
}

export function CoachProgramsPage({ coachUserId }: CoachProgramsPageProps) {
  const [view, setView] = useState<"library" | "calendar" | "muscle-library" | "muscle-builder">("library");
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [previousView, setPreviousView] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newProgramTitle, setNewProgramTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const { canBuildPrograms, isLoading: permissionsLoading } = useSubrolePermissions(coachUserId);
  const { toast } = useToast();

  // Create program: quick dialog → create template → navigate to calendar
  const handleCreateProgram = useCallback(() => {
    setNewProgramTitle("");
    setShowCreateDialog(true);
  }, []);

  const handleConfirmCreate = useCallback(async () => {
    if (!newProgramTitle.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("program_templates")
        .insert({
          owner_coach_id: coachUserId,
          title: newProgramTitle.trim(),
          visibility: "private",
        })
        .select("id")
        .single();

      if (error) throw error;

      setShowCreateDialog(false);
      setEditingProgramId(data.id);
      setView("calendar");
    } catch (error: unknown) {
      toast({
        title: "Error creating program",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }, [newProgramTitle, coachUserId, toast]);

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
    <>
      <ProgramLibrary
        coachUserId={coachUserId}
        onCreateProgram={handleCreateProgram}
        onEditProgram={handleEditProgram}
        onMuscleBuilder={handleMuscleBuilder}
      />

      {/* Create Program Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Program</DialogTitle>
            <DialogDescription>
              Give your program a name to get started.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Program Title</Label>
            <Input
              value={newProgramTitle}
              onChange={(e) => setNewProgramTitle(e.target.value)}
              placeholder="e.g., 12-Week Strength Builder"
              onKeyDown={(e) => e.key === "Enter" && handleConfirmCreate()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmCreate} disabled={!newProgramTitle.trim() || creating}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
