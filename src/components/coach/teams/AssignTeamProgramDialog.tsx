import { useState, useEffect, useCallback, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { assignProgramToClient } from "@/lib/assignProgram";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Tables } from "@/integrations/supabase/types";

type ProgramTemplate = Tables<"program_templates"> & {
  program_template_days?: {
    id: string;
    day_index: number;
    day_title: string;
    day_modules: Tables<"day_modules">[];
  }[];
};

interface AssignTeamProgramDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coachUserId: string;
  team: {
    id: string;
    name: string;
  };
  members: {
    subscriptionId: string;
    userId: string;
    firstName: string;
    displayName: string | null;
    status: string;
  }[];
  onAssigned?: () => void;
}

export const AssignTeamProgramDialog = memo(function AssignTeamProgramDialog({
  open,
  onOpenChange,
  coachUserId,
  team,
  members,
  onAssigned,
}: AssignTeamProgramDialogProps) {
  const [programs, setPrograms] = useState<ProgramTemplate[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string>("");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const { toast } = useToast();

  const loadPrograms = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("program_templates")
        .select(`
          *,
          program_template_days(
            id,
            day_index,
            day_title,
            day_modules(*)
          )
        `)
        .or(`owner_coach_id.eq.${coachUserId},visibility.eq.shared`)
        .order("title");

      if (error) throw error;

      // Filter to only programs that have at least one published module
      const programsWithPublished = (data || []).filter((program) => {
        return program.program_template_days?.some((day) =>
          day.day_modules?.some((mod) => mod.status === "published")
        );
      });

      setPrograms(programsWithPublished);
    } catch (error: any) {
      toast({
        title: "Error loading programs",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [coachUserId, toast]);

  useEffect(() => {
    if (open) {
      setLoading(true);
      setSelectedProgramId("");
      setErrors([]);
      setProgress({ current: 0, total: 0 });
      loadPrograms();
    }
  }, [open, loadPrograms]);

  const assignToAll = async () => {
    if (!selectedProgramId) return;

    const activeMembers = members.filter((m) => m.status === "active");
    if (activeMembers.length === 0) {
      toast({
        title: "No active members",
        description: "There are no active members to assign the program to.",
        variant: "destructive",
      });
      return;
    }

    setAssigning(true);
    setProgress({ current: 0, total: activeMembers.length });
    setErrors([]);

    const assignmentErrors: string[] = [];
    let successCount = 0;

    for (let i = 0; i < activeMembers.length; i++) {
      const member = activeMembers[i];
      setProgress({ current: i + 1, total: activeMembers.length });

      const result = await assignProgramToClient({
        coachUserId,
        clientUserId: member.userId,
        subscriptionId: member.subscriptionId,
        programTemplateId: selectedProgramId,
        startDate,
        teamId: team.id,
      });

      if (result.success) {
        successCount++;
      } else {
        assignmentErrors.push(
          `${member.displayName || member.firstName}: ${result.error}`
        );
      }
    }

    // Update team's current program template
    if (successCount > 0) {
      await supabase
        .from("coach_teams")
        .update({ current_program_template_id: selectedProgramId })
        .eq("id", team.id);
    }

    setErrors(assignmentErrors);

    if (assignmentErrors.length === 0) {
      toast({
        title: "Program assigned",
        description: `Program assigned to ${successCount} team members.`,
      });
      onOpenChange(false);
      onAssigned?.();
    } else if (successCount > 0) {
      toast({
        title: "Partial success",
        description: `Program assigned to ${successCount} of ${activeMembers.length} members. ${assignmentErrors.length} failed.`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Assignment failed",
        description: "Failed to assign program to any team members.",
        variant: "destructive",
      });
    }

    setAssigning(false);
  };

  const selectedProgram = programs.find((p) => p.id === selectedProgramId);
  const activeMembers = members.filter((m) => m.status === "active");
  const publishedModulesCount = selectedProgram?.program_template_days?.reduce(
    (acc, day) =>
      acc + (day.day_modules?.filter((m) => m.status === "published").length || 0),
    0
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign Program to Team</DialogTitle>
          <DialogDescription>
            Assign a program to all active members of {team.name}. Each member
            gets their own individual copy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Select Program</Label>
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading programs...</div>
            ) : programs.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No programs with published modules available.
              </div>
            ) : (
              <Select value={selectedProgramId} onValueChange={setSelectedProgramId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a program" />
                </SelectTrigger>
                <SelectContent>
                  {programs.map((program) => (
                    <SelectItem key={program.id} value={program.id}>
                      {program.title} ({program.program_template_days?.length || 0} days)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedProgram && (
            <div className="p-3 bg-muted rounded-md space-y-2">
              <p className="text-sm font-medium">{selectedProgram.title}</p>
              {selectedProgram.description && (
                <p className="text-sm text-muted-foreground">
                  {selectedProgram.description}
                </p>
              )}
              <div className="flex gap-2">
                <Badge variant="default">
                  {publishedModulesCount} published modules
                </Badge>
                <Badge variant="secondary">
                  {selectedProgram.program_template_days?.length || 0} days
                </Badge>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Start Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => date && setStartDate(date)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Member preview */}
          <div className="p-3 bg-muted rounded-md">
            <p className="text-sm font-medium mb-1">
              Will assign to {activeMembers.length} active member{activeMembers.length !== 1 ? "s" : ""}
            </p>
            {members.filter((m) => m.status === "pending").length > 0 && (
              <p className="text-xs text-muted-foreground">
                {members.filter((m) => m.status === "pending").length} pending members will not be assigned
              </p>
            )}
          </div>

          {/* Progress bar during assignment */}
          {assigning && (
            <div className="space-y-2">
              <Progress value={(progress.current / progress.total) * 100} />
              <p className="text-sm text-center text-muted-foreground">
                Assigning {progress.current} / {progress.total}...
              </p>
            </div>
          )}

          {/* Error list */}
          {errors.length > 0 && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md space-y-1">
              <p className="text-sm font-medium text-destructive">Failed assignments:</p>
              {errors.map((err, i) => (
                <p key={i} className="text-xs text-destructive/80">{err}</p>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={assigning}>
            Cancel
          </Button>
          <Button
            onClick={assignToAll}
            disabled={!selectedProgramId || assigning || activeMembers.length === 0}
          >
            {assigning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Assigning...
              </>
            ) : (
              `Assign to ${activeMembers.length} Members`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
