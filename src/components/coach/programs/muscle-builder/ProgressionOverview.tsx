import { memo, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMuscleDisplay, DAYS_OF_WEEK, type WeekData, type MuscleSlotData } from "@/types/muscle-builder";

interface ProgressionOverviewProps {
  weeks: WeekData[];
  currentWeekIndex: number;
  onSelectWeek: (weekIndex: number) => void;
  onSetExerciseInstructions: (slotId: string, instructions: string) => void;
  onApplyToRemaining?: (slotId: string, fields: Record<string, unknown>) => void;
}

interface SlotArc {
  dayIndex: number;
  sortOrder: number;
  muscleId: string;
  entries: { weekIndex: number; slot: MuscleSlotData | null }[];
}

export const ProgressionOverview = memo(function ProgressionOverview({
  weeks,
  currentWeekIndex,
  onSelectWeek,
  onSetExerciseInstructions,
  onApplyToRemaining,
}: ProgressionOverviewProps) {
  const slotArcs = useMemo<SlotArc[]>(() => {
    const w1 = weeks[0];
    if (!w1) return [];

    const arcs: SlotArc[] = [];
    const w1Slots = [...w1.slots]
      .filter(s => !s.activityType || s.activityType === 'strength')
      .sort((a, b) => a.dayIndex - b.dayIndex || a.sortOrder - b.sortOrder);

    for (const baseSlot of w1Slots) {
      const entries = weeks.map((week, wi) => {
        const match = week.slots.find(s =>
          s.dayIndex === baseSlot.dayIndex && s.sortOrder === baseSlot.sortOrder
        );
        return { weekIndex: wi, slot: match ?? null };
      });
      arcs.push({
        dayIndex: baseSlot.dayIndex,
        sortOrder: baseSlot.sortOrder,
        muscleId: baseSlot.muscleId,
        entries,
      });
    }
    return arcs;
  }, [weeks]);

  const handleInstructionChange = useCallback(
    (slotId: string, instructions: string) => {
      onSetExerciseInstructions(slotId, instructions);
    },
    [onSetExerciseInstructions]
  );

  if (weeks.length <= 1) {
    return (
      <div className="text-sm text-muted-foreground text-center py-6">
        Add more weeks to see progression across your mesocycle.
      </div>
    );
  }

  if (slotArcs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-6">
        No strength slots to show progression for.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Exercise instructions across weeks. Edit inline — changes save to the corresponding week.
      </p>

      {slotArcs.map((arc) => {
        const muscle = getMuscleDisplay(arc.muscleId);
        if (!muscle) return null;
        const dayName = DAYS_OF_WEEK[arc.dayIndex - 1];

        return (
          <div key={`${arc.dayIndex}-${arc.sortOrder}`} className="rounded-md border border-border/40 bg-muted/5">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/30">
              <div className={`w-2 h-2 rounded-full ${muscle.colorClass}`} />
              <span className="text-xs font-medium">{dayName} — {muscle.label}</span>
              {arc.entries[0]?.slot?.exercise && (
                <Badge variant="secondary" className="text-[10px] py-0 ml-auto">
                  {arc.entries[0].slot.exercise.name}
                </Badge>
              )}
            </div>

            <div className="grid gap-0 divide-y divide-border/20">
              {arc.entries.map(({ weekIndex, slot }) => {
                const weekLabel = weeks[weekIndex]?.label || `W${weekIndex + 1}`;
                const isDeload = weeks[weekIndex]?.isDeload;
                const isCurrent = weekIndex === currentWeekIndex;
                const instructions = slot?.exercise?.instructions || '';
                const hasExercise = !!slot?.exercise;

                return (
                  <div
                    key={weekIndex}
                    className={cn(
                      "flex items-start gap-2 px-3 py-1.5",
                      isCurrent && "bg-primary/5"
                    )}
                  >
                    <button
                      className={cn(
                        "text-[10px] font-mono w-8 shrink-0 text-left pt-1",
                        isCurrent ? "text-primary font-bold" : "text-muted-foreground",
                        isDeload && "text-amber-500"
                      )}
                      onClick={() => onSelectWeek(weekIndex)}
                      title={`Switch to ${weekLabel}`}
                    >
                      {weekLabel}
                    </button>

                    {slot && hasExercise ? (
                      <Textarea
                        placeholder={isDeload ? "Deload — reduce intensity..." : "Progression cue for this week..."}
                        value={instructions}
                        onChange={e => {
                          onSelectWeek(weekIndex);
                          handleInstructionChange(slot.id, e.target.value);
                        }}
                        className="text-xs min-h-[28px] h-7 resize-none border-none bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                        rows={1}
                      />
                    ) : (
                      <span className="text-[10px] text-muted-foreground/50 italic pt-1">
                        {!slot ? 'No matching slot' : 'No exercise assigned'}
                      </span>
                    )}

                    {onApplyToRemaining && slot && hasExercise && instructions && weekIndex < weeks.length - 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-primary"
                        title="Apply instruction to remaining weeks"
                        onClick={() => {
                          onSelectWeek(weekIndex);
                          onApplyToRemaining(slot.id, {
                            exercise: { ...slot.exercise!, instructions: instructions },
                          });
                        }}
                      >
                        <ChevronsRight className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
});
