import { memo, useMemo } from "react";
import { Droppable } from "@hello-pangea/dnd";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DAYS_OF_WEEK,
  getMuscleDisplay,
  resolveParentMuscleId,
  type MuscleSlotData,
} from "@/types/muscle-builder";
import { StudioSlotCard } from "./StudioSlotCard";
import { StudioRestDay } from "./StudioRestDay";

export interface StudioDayColumnProps {
  dayIndex: number;
  slots: MuscleSlotData[];
  isSelected: boolean;
  highlightedMuscleId?: string;
  onSelectDay: (dayIndex: number) => void;
  onOpenSlot: (slotId: string) => void;
  onAddMuscle?: (dayIndex: number) => void;
}

/**
 * Studio day column — a slim vertical track of slots with a stat ribbon
 * baked into the header. The ribbon shows the day's total sets, the day
 * label, and a 0-100% muscle-distribution bar so the coach can see at
 * a glance which body regions dominate this day without scrolling down
 * to the volume chart.
 */
export const StudioDayColumn = memo(function StudioDayColumn({
  dayIndex,
  slots,
  isSelected,
  highlightedMuscleId,
  onSelectDay,
  onOpenSlot,
  onAddMuscle,
}: StudioDayColumnProps) {
  const label = DAYS_OF_WEEK[dayIndex - 1];
  const isRest = slots.length === 0;

  const { totalSets, distribution } = useMemo(() => {
    if (slots.length === 0) return { totalSets: 0, distribution: [] };
    const totals = new Map<string, { sets: number; colorHex: string }>();
    for (const slot of slots) {
      const parentId = resolveParentMuscleId(slot.muscleId);
      const m = getMuscleDisplay(parentId);
      if (!m) continue;
      const entry = totals.get(parentId);
      if (entry) entry.sets += slot.sets;
      else totals.set(parentId, { sets: slot.sets, colorHex: m.colorHex });
    }
    const total = [...totals.values()].reduce((s, e) => s + e.sets, 0);
    const dist = [...totals.entries()]
      .sort(([, a], [, b]) => b.sets - a.sets)
      .map(([id, { sets, colorHex }]) => ({
        id,
        colorHex,
        pct: total > 0 ? (sets / total) * 100 : 0,
        sets,
      }));
    return { totalSets: total, distribution: dist };
  }, [slots]);

  return (
    <section
      data-day-index={dayIndex}
      onClick={() => onSelectDay(dayIndex)}
      className={cn(
        // min-w-0 rather than a fixed min-w — when StudioDayColumn renders
        // inside a CSS grid it must obey the track width, otherwise columns
        // overlap on <1440 viewports.
        "relative flex flex-col min-w-0 flex-1",
        "bg-[hsl(220_14%_6.5%)]",
        "border border-white/[0.06]",
        "transition-colors duration-150",
        isSelected && "border-white/20 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]",
      )}
    >
      {/* Volume ribbon — always visible */}
      <header className="flex items-center gap-2 px-2.5 py-2 border-b border-white/[0.06]">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/50 shrink-0">
          {label}
        </span>
        <div className="flex-1" />
        <span
          className={cn(
            "font-display text-[16px] leading-none tabular-nums tracking-wide shrink-0",
            isRest ? "text-white/15" : "text-white",
          )}
        >
          {totalSets}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-white/35 shrink-0">
          sets
        </span>

        {onAddMuscle && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddMuscle(dayIndex);
            }}
            className="shrink-0 h-5 w-5 rounded-sm flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:bg-white/10"
            aria-label={`Add muscle to ${label}`}
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </header>

      {/* Distribution bar — one pixel tall, the visual fingerprint of the day */}
      {!isRest && (
        <div
          className="h-[2px] flex overflow-hidden bg-white/[0.04]"
          aria-hidden
        >
          {distribution.map(({ id, colorHex, pct }) => (
            <div
              key={id}
              className="h-full"
              style={{ width: `${pct}%`, backgroundColor: colorHex }}
            />
          ))}
        </div>
      )}

      {/* Body — slots or rest */}
      <Droppable droppableId={`day-${dayIndex}`} type="MUSCLE_SLOT">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              "relative flex-1 min-h-[200px] flex flex-col",
              snapshot.isDraggingOver && "bg-white/[0.02]",
            )}
          >
            {isRest ? (
              <StudioRestDay />
            ) : (
              slots.map((slot, index) => (
                <StudioSlotCard
                  key={slot.id}
                  slotId={slot.id}
                  muscleId={slot.muscleId}
                  sets={slot.sets}
                  repMin={slot.repMin}
                  repMax={slot.repMax}
                  tempo={slot.tempo}
                  rir={slot.rir}
                  rpe={slot.rpe}
                  exercise={slot.exercise}
                  replacements={slot.replacements}
                  setsDetail={slot.setsDetail}
                  draggableIndex={index}
                  isHighlighted={
                    highlightedMuscleId != null &&
                    resolveParentMuscleId(slot.muscleId) === highlightedMuscleId
                  }
                  onOpen={onOpenSlot}
                />
              ))
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </section>
  );
});
