import { memo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { withTimeout } from "@/lib/withTimeout";
import { MUSCLE_MAP, DAYS_OF_WEEK, type MuscleSlotData } from "@/types/muscle-builder";
import type { VolumeSummary } from "./hooks/useMusclePlanVolume";

interface ConvertToProgramDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slots: MuscleSlotData[];
  summary: VolumeSummary;
  planName: string;
  coachUserId: string;
  templateId: string | null;
  onConverted: (programId: string) => void;
}

export const ConvertToProgramDialog = memo(function ConvertToProgramDialog({
  open,
  onOpenChange,
  slots,
  summary,
  planName,
  coachUserId,
  templateId,
  onConverted,
}: ConvertToProgramDialogProps) {
  const [converting, setConverting] = useState(false);
  const { toast } = useToast();

  const handleConvert = useCallback(async () => {
    setConverting(true);
    try {
      // 1. Create program template
      const { data: program, error: progErr } = await withTimeout(
        supabase
          .from('program_templates')
          .insert({
            owner_coach_id: coachUserId,
            title: planName,
            description: `Converted from muscle plan. ${summary.musclesTargeted} muscles, ${summary.totalSets} total sets.`,
            visibility: 'private',
          })
          .select('id')
          .single(),
        15000,
        'Create program template',
      );

      if (progErr) throw progErr;

      // 2. Group slots by day
      const slotsByDay = new Map<number, MuscleSlotData[]>();
      for (const slot of slots) {
        const day = slotsByDay.get(slot.dayIndex) || [];
        day.push(slot);
        slotsByDay.set(slot.dayIndex, day);
      }

      // 3. Create days + day_modules for each training day
      let totalModules = 0;
      for (const [dayIndex, daySlots] of slotsByDay) {
        const sortedSlots = [...daySlots].sort((a, b) => a.sortOrder - b.sortOrder);
        const muscleNames = sortedSlots
          .map(s => MUSCLE_MAP.get(s.muscleId)?.label || s.muscleId)
          .join(', ');

        // Create the day
        const { data: dayData, error: dayErr } = await withTimeout(
          supabase
            .from('program_template_days')
            .insert({
              program_template_id: program.id,
              day_index: dayIndex,
              day_title: `${DAYS_OF_WEEK[dayIndex - 1]} — ${muscleNames}`,
            })
            .select('id')
            .single(),
          15000,
          'Create program day',
        );

        if (dayErr) throw dayErr;

        // Create one day_module per muscle slot (session per muscle group)
        for (const slot of sortedSlots) {
          const muscle = MUSCLE_MAP.get(slot.muscleId);
          const { error: modErr } = await withTimeout(
            supabase
              .from('day_modules')
              .insert({
                program_template_day_id: dayData.id,
                module_owner_coach_id: coachUserId,
                module_type: 'strength',
                title: `${muscle?.label || slot.muscleId} — ${slot.sets} sets`,
                sort_order: slot.sortOrder,
                status: 'draft',
                source_muscle_id: slot.muscleId,
              }),
            15000,
            'Create day module',
          );

          if (modErr) throw modErr;
          totalModules++;
        }
      }

      // 4. Link template to program
      if (templateId) {
        await withTimeout(
          supabase
            .from('muscle_program_templates')
            .update({ converted_program_id: program.id })
            .eq('id', templateId),
          15000,
          'Link template to program',
        );
      }

      toast({
        title: 'Program created',
        description: `${slotsByDay.size} training days with ${totalModules} muscle modules. Open the program to add exercises.`,
      });

      onConverted(program.id);
    } catch (error: any) {
      toast({
        title: 'Conversion failed',
        description: sanitizeErrorForUser(error),
        variant: 'destructive',
      });
    } finally {
      setConverting(false);
    }
  }, [slots, summary, planName, coachUserId, templateId, onConverted, toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convert to Program</DialogTitle>
          <DialogDescription>
            This will create a program template from your muscle plan. You can then add specific
            exercises to each muscle slot.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-muted/30 rounded p-2">
              <p className="text-[10px] text-muted-foreground uppercase">Training Days</p>
              <p className="font-mono font-bold">{summary.trainingDays}</p>
            </div>
            <div className="bg-muted/30 rounded p-2">
              <p className="text-[10px] text-muted-foreground uppercase">Muscles</p>
              <p className="font-mono font-bold">{summary.musclesTargeted}</p>
            </div>
            <div className="bg-muted/30 rounded p-2">
              <p className="text-[10px] text-muted-foreground uppercase">Total Sets</p>
              <p className="font-mono font-bold">{summary.totalSets}</p>
            </div>
            <div className="bg-muted/30 rounded p-2">
              <p className="text-[10px] text-muted-foreground uppercase">Modules Created</p>
              <p className="font-mono font-bold">{slots.length}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Each muscle slot becomes a day module. Open the program in the Calendar Builder to add
            exercises to each module.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={converting}>
            Cancel
          </Button>
          <Button onClick={handleConvert} disabled={converting}>
            {converting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Convert to Program
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
