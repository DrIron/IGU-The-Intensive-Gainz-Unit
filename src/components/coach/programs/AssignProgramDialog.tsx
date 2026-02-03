import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { format, addDays } from "date-fns";
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

interface AssignProgramDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coachUserId: string;
  clientUserId: string;
  clientName: string;
  subscriptionId: string;
  onAssigned?: () => void;
}

export function AssignProgramDialog({
  open,
  onOpenChange,
  coachUserId,
  clientUserId,
  clientName,
  subscriptionId,
  onAssigned,
}: AssignProgramDialogProps) {
  const [programs, setPrograms] = useState<ProgramTemplate[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string>("");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
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
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [coachUserId, toast]);

  useEffect(() => {
    if (open) {
      loadPrograms();
    }
  }, [open, coachUserId, loadPrograms]);

  const assignProgram = async () => {
    if (!selectedProgramId) {
      toast({
        title: "Select a program",
        description: "Please select a program to assign.",
        variant: "destructive",
      });
      return;
    }

    setAssigning(true);
    try {
      const selectedProgram = programs.find((p) => p.id === selectedProgramId);
      if (!selectedProgram) throw new Error("Program not found");

      // Create client_program
      const { data: clientProgram, error: programError } = await supabase
        .from("client_programs")
        .insert({
          user_id: clientUserId,
          subscription_id: subscriptionId,
          primary_coach_id: coachUserId,
          source_template_id: selectedProgramId,
          start_date: format(startDate, "yyyy-MM-dd"),
          status: "active",
        })
        .select()
        .single();

      if (programError) throw programError;

      // Fetch active care team members for this subscription
      const { data: careTeamMembers } = await supabase
        .from("care_team_assignments")
        .select("staff_user_id, specialty, active_from, active_until")
        .eq("subscription_id", subscriptionId)
        .in("lifecycle_status", ["active", "scheduled_end"]);

      // Create client_program_days and client_day_modules for each template day
      const templateDays = selectedProgram.program_template_days || [];

      for (let i = 0; i < templateDays.length; i++) {
        const templateDay = templateDays[i];
        const dayDate = addDays(startDate, templateDay.day_index - 1);
        const dayDateStr = format(dayDate, "yyyy-MM-dd");

        // Create client_program_day
        const { data: clientDay, error: dayError } = await supabase
          .from("client_program_days")
          .insert({
            client_program_id: clientProgram.id,
            day_index: templateDay.day_index,
            title: templateDay.day_title,
            date: dayDateStr,
          })
          .select()
          .single();

        if (dayError) throw dayError;

        // Only create client_day_modules for PUBLISHED modules
        const publishedModules = (templateDay.day_modules || []).filter(
          (mod) => mod.status === "published"
        );

        let maxSortOrder = 0;

        for (const templateModule of publishedModules) {
          // Get the exercises for this module
          const { data: exercises } = await supabase
            .from("module_exercises")
            .select(`
              *,
              exercise_prescriptions(*)
            `)
            .eq("day_module_id", templateModule.id);

          // Create client_day_module
          const { data: clientModule, error: moduleError } = await supabase
            .from("client_day_modules")
            .insert({
              client_program_day_id: clientDay.id,
              source_day_module_id: templateModule.id,
              module_owner_coach_id: templateModule.module_owner_coach_id,
              module_type: templateModule.module_type,
              title: templateModule.title,
              sort_order: templateModule.sort_order,
              status: "scheduled",
            })
            .select()
            .single();

          if (moduleError) throw moduleError;
          maxSortOrder = Math.max(maxSortOrder, templateModule.sort_order);

          // Copy exercises with prescription snapshots
          if (exercises && exercises.length > 0) {
            for (const exercise of exercises) {
              const prescription = exercise.exercise_prescriptions?.[0];
              
              await supabase.from("client_module_exercises").insert({
                client_day_module_id: clientModule.id,
                exercise_id: exercise.exercise_id,
                section: exercise.section,
                sort_order: exercise.sort_order,
                instructions: exercise.instructions,
                prescription_snapshot_json: prescription
                  ? {
                      set_count: prescription.set_count,
                      rep_range_min: prescription.rep_range_min,
                      rep_range_max: prescription.rep_range_max,
                      tempo: prescription.tempo,
                      rest_seconds: prescription.rest_seconds,
                      intensity_type: prescription.intensity_type,
                      intensity_value: prescription.intensity_value,
                      warmup_sets_json: prescription.warmup_sets_json,
                      custom_fields_json: prescription.custom_fields_json,
                      progression_notes: prescription.progression_notes,
                    }
                  : {},
              });
            }
          }

          // Create module thread for communication
          await supabase.from("module_threads").insert({
            client_day_module_id: clientModule.id,
          });
        }

        // Auto-create modules for active care team specialists for this day
        // Only if the day falls within their active period
        if (careTeamMembers && careTeamMembers.length > 0) {
          for (const member of careTeamMembers) {
            const activeFrom = new Date(member.active_from);
            const activeUntil = member.active_until ? new Date(member.active_until) : null;
            
            // Check if this day falls within the specialist's active period
            if (dayDate >= activeFrom && (!activeUntil || dayDate <= activeUntil)) {
              // Check if module already created (from template)
              const existingModule = publishedModules.find(
                m => m.module_owner_coach_id === member.staff_user_id && 
                     m.module_type === member.specialty
              );
              
              if (!existingModule) {
                maxSortOrder++;
                const moduleType = member.specialty;
                const title = moduleType.charAt(0).toUpperCase() + moduleType.slice(1) + ' Session';
                
                await supabase.from("client_day_modules").insert({
                  client_program_day_id: clientDay.id,
                  module_owner_coach_id: member.staff_user_id,
                  module_type: moduleType,
                  title: title,
                  sort_order: maxSortOrder,
                  status: "scheduled",
                });
              }
            }
          }
        }
      }

      toast({
        title: "Program assigned",
        description: `${selectedProgram.title} has been assigned to ${clientName}.`,
      });

      onOpenChange(false);
      onAssigned?.();
    } catch (error: any) {
      toast({
        title: "Error assigning program",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAssigning(false);
    }
  };

  const selectedProgram = programs.find((p) => p.id === selectedProgramId);
  const publishedModulesCount = selectedProgram?.program_template_days?.reduce(
    (acc, day) =>
      acc + (day.day_modules?.filter((m) => m.status === "published").length || 0),
    0
  );
  const draftModulesCount = selectedProgram?.program_template_days?.reduce(
    (acc, day) =>
      acc + (day.day_modules?.filter((m) => m.status === "draft").length || 0),
    0
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Program</DialogTitle>
          <DialogDescription>
            Assign a workout program to {clientName}. Only published modules will be
            delivered to the client.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Select Program</Label>
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading programs...</div>
            ) : programs.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No programs with published modules available. Create and publish a
                program first.
              </div>
            ) : (
              <Select value={selectedProgramId} onValueChange={setSelectedProgramId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a program" />
                </SelectTrigger>
                <SelectContent>
                  {programs.map((program) => (
                    <SelectItem key={program.id} value={program.id}>
                      {program.title} ({program.program_template_days?.length || 0}{" "}
                      days)
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
                  {publishedModulesCount} published
                </Badge>
                {(draftModulesCount ?? 0) > 0 && (
                  <Badge variant="secondary">
                    {draftModulesCount} draft (not delivered)
                  </Badge>
                )}
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
            <p className="text-xs text-muted-foreground">
              Day 1 will be scheduled for this date. Subsequent days will follow in
              order.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={assignProgram}
            disabled={!selectedProgramId || assigning}
          >
            {assigning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Assigning...
              </>
            ) : (
              "Assign Program"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
