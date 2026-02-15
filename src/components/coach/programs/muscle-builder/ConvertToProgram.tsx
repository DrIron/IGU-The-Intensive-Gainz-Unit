import { memo, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Loader2, CheckCircle2, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { withTimeout } from "@/lib/withTimeout";
import { MUSCLE_MAP, DAYS_OF_WEEK, type MuscleSlotData } from "@/types/muscle-builder";
import type { VolumeSummary } from "./hooks/useMusclePlanVolume";

type PanelState = "collapsed" | "expanded" | "success";

interface ConvertToProgramProps {
  slots: MuscleSlotData[];
  summary: VolumeSummary;
  planName: string;
  coachUserId: string;
  templateId: string | null;
  onOpenProgram?: (programId: string) => void;
}

export const ConvertToProgram = memo(function ConvertToProgram({
  slots,
  summary,
  planName,
  coachUserId,
  templateId,
  onOpenProgram,
}: ConvertToProgramProps) {
  const [panelState, setPanelState] = useState<PanelState>("collapsed");
  const [converting, setConverting] = useState(false);
  const [createdProgramId, setCreatedProgramId] = useState<string | null>(null);
  const { toast } = useToast();

  // Group slots by training day for the preview
  const dayBreakdown = useMemo(() => {
    const map = new Map<number, MuscleSlotData[]>();
    for (const slot of slots) {
      const day = map.get(slot.dayIndex) || [];
      day.push(slot);
      map.set(slot.dayIndex, day);
    }
    // Sort by day index and sort slots within each day
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([dayIndex, daySlots]) => ({
        dayIndex,
        daySlots: [...daySlots].sort((a, b) => a.sortOrder - b.sortOrder),
        totalSets: daySlots.reduce((sum, s) => sum + s.sets, 0),
      }));
  }, [slots]);

  const handleConvert = useCallback(async () => {
    setConverting(true);
    try {
      // 1. Create program template
      const { data: program, error: progErr } = await withTimeout(
        supabase
          .from("program_templates")
          .insert({
            owner_coach_id: coachUserId,
            title: planName,
            description: `Converted from muscle plan. ${summary.musclesTargeted} muscles, ${summary.totalSets} total sets.`,
            visibility: "private",
          })
          .select("id")
          .single(),
        15000,
        "Create program template",
      );

      if (progErr) throw progErr;

      // 2. Create days + day_modules for each training day
      let totalModules = 0;
      for (const { dayIndex, daySlots } of dayBreakdown) {
        const sortedSlots = daySlots;
        const muscleNames = sortedSlots
          .map(s => MUSCLE_MAP.get(s.muscleId)?.label || s.muscleId)
          .join(", ");

        const { data: dayData, error: dayErr } = await withTimeout(
          supabase
            .from("program_template_days")
            .insert({
              program_template_id: program.id,
              day_index: dayIndex,
              day_title: `${DAYS_OF_WEEK[dayIndex - 1]} \u2014 ${muscleNames}`,
            })
            .select("id")
            .single(),
          15000,
          "Create program day",
        );

        if (dayErr) throw dayErr;

        for (const slot of sortedSlots) {
          const muscle = MUSCLE_MAP.get(slot.muscleId);
          const { error: modErr } = await withTimeout(
            supabase
              .from("day_modules")
              .insert({
                program_template_day_id: dayData.id,
                module_owner_coach_id: coachUserId,
                module_type: "strength",
                title: `${muscle?.label || slot.muscleId} \u2014 ${slot.sets} sets`,
                sort_order: slot.sortOrder,
                status: "draft",
                source_muscle_id: slot.muscleId,
              }),
            15000,
            "Create day module",
          );

          if (modErr) throw modErr;
          totalModules++;
        }
      }

      // 3. Link template to program
      if (templateId) {
        await withTimeout(
          supabase
            .from("muscle_program_templates")
            .update({ converted_program_id: program.id })
            .eq("id", templateId),
          15000,
          "Link template to program",
        );
      }

      setCreatedProgramId(program.id);
      setPanelState("success");
      toast({
        title: "Program created",
        description: `${dayBreakdown.length} training days with ${totalModules} muscle modules.`,
      });
    } catch (error: any) {
      toast({
        title: "Conversion failed",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setConverting(false);
    }
  }, [slots, summary, planName, coachUserId, templateId, dayBreakdown, toast]);

  const isOpen = panelState !== "collapsed";

  return (
    <Collapsible open={isOpen} onOpenChange={open => setPanelState(open ? "expanded" : "collapsed")}>
      <Card className="border-border/50">
        <CollapsibleTrigger asChild>
          <CardHeader className="p-3 cursor-pointer hover:bg-muted/20 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {panelState === "success" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm font-semibold">
                  {panelState === "success" ? "Program Created" : "Convert to Program"}
                </span>
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  isOpen && "rotate-180",
                )}
              />
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="p-3 pt-0">
            {panelState === "success" && createdProgramId ? (
              /* ── Success State ──────────────────────────── */
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  <strong>&ldquo;{planName}&rdquo;</strong> &mdash; {dayBreakdown.length} days,{" "}
                  {slots.length} modules. Each module is ready for exercises.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => onOpenProgram?.(createdProgramId)}
                  >
                    Open Program Editor
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPanelState("collapsed")}
                  >
                    Stay Here
                  </Button>
                </div>
              </div>
            ) : (
              /* ── Preview State ──────────────────────────── */
              <div className="space-y-3">
                {/* Day-by-day breakdown */}
                <div className="space-y-2">
                  {dayBreakdown.map(({ dayIndex, daySlots, totalSets }) => (
                    <div key={dayIndex} className="rounded-md border border-border/30 bg-muted/10 px-3 py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold">
                          {DAYS_OF_WEEK[dayIndex - 1]}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {daySlots.length} modules, {totalSets} sets
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        {daySlots.map(slot => {
                          const muscle = MUSCLE_MAP.get(slot.muscleId);
                          if (!muscle) return null;
                          return (
                            <div key={slot.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <div className={`w-1.5 h-1.5 rounded-full ${muscle.colorClass}`} />
                              <span>{muscle.label}</span>
                              <span className="ml-auto font-mono">{slot.sets} sets</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary */}
                <p className="text-xs text-muted-foreground">
                  {summary.trainingDays} training days, {slots.length} modules.
                  Each muscle slot becomes a day module &mdash; add exercises in the program editor.
                </p>

                <Button
                  size="sm"
                  className="w-full"
                  onClick={handleConvert}
                  disabled={converting}
                >
                  {converting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Program
                </Button>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
});
