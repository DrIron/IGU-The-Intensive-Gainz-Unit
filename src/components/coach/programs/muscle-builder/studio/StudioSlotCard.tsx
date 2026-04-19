import { memo, useCallback, useState } from "react";
import { Draggable } from "@hello-pangea/dnd";
import { AlertCircle, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getMuscleDisplay,
  getShortMuscleLabel,
  type SlotExercise,
} from "@/types/muscle-builder";
import type { SetPrescription } from "@/types/workout-builder";

export interface StudioSlotCardProps {
  slotId: string;
  muscleId: string;
  sets: number;
  repMin: number;
  repMax: number;
  tempo?: string;
  rir?: number;
  rpe?: number;
  exercise?: SlotExercise;
  replacements?: SlotExercise[];
  setsDetail?: SetPrescription[];
  draggableIndex: number;
  isHighlighted?: boolean;
  onOpen: (slotId: string) => void;
}

/**
 * Studio slot card — single line, muscle color as vertical rail, one giant
 * number (sets) as the hero stat, tempo + rep range in monospace below.
 *
 * Status is communicated non-icon-ically wherever possible:
 *   - exercise assigned → small dumbbell chip right of the name (muscle-tinted)
 *   - missing intensity → amber dot pulsing in the top-right corner
 *   - per-set custom   → dashed underline along the bottom of the card
 *   - replacements     → "+N" in monospace, color-matched to muscle
 *
 * Compare this to the legacy card: six competing icons + colored dot + badge.
 * This one resolves to ~2 glyphs worst case, letting typography carry the day.
 */
export const StudioSlotCard = memo(function StudioSlotCard({
  slotId,
  muscleId,
  sets,
  repMin,
  repMax,
  tempo,
  rir,
  rpe,
  exercise,
  replacements,
  setsDetail,
  draggableIndex,
  isHighlighted,
  onOpen,
}: StudioSlotCardProps) {
  const [isHover, setIsHover] = useState(false);
  const handleOpen = useCallback(() => onOpen(slotId), [slotId, onOpen]);

  const muscle = getMuscleDisplay(muscleId);
  if (!muscle) return null;

  const hasExercise = !!exercise;
  const hasPerSet = !!setsDetail && setsDetail.length > 0;
  const hasTempo = !!tempo && tempo.length === 4;
  const needsIntensity = hasTempo && rir == null && rpe == null;
  const replacementCount = replacements?.length ?? 0;

  const displayLabel = hasExercise
    ? exercise!.name
    : getShortMuscleLabel(muscleId);

  return (
    <Draggable draggableId={`slot-${slotId}`} index={draggableIndex}>
      {(provided, snapshot) => (
        <article
          ref={provided.innerRef}
          {...provided.draggableProps}
          style={{
            ...provided.draggableProps.style,
            // Expose the muscle hex as a CSS var for downstream selectors.
            ['--muscle' as string]: muscle.colorHex,
            // Reduce reflow scope during drag — tiny mitigation for @hello-pangea jank.
            contain: "layout",
          }}
          className={cn(
            "relative group flex items-stretch select-none",
            "bg-[hsl(220_15%_8%)]",
            "border-b border-white/[0.04]",
            snapshot.isDragging
              ? "z-10 shadow-[0_8px_32px_rgba(0,0,0,0.6)] ring-1 ring-[var(--muscle)]"
              : "hover:bg-[hsl(220_13%_10%)] transition-[background-color] duration-150",
            isHighlighted && "bg-[hsl(220_13%_10%)]",
          )}
          onMouseEnter={() => setIsHover(true)}
          onMouseLeave={() => setIsHover(false)}
        >
          {/* Drag handle — full-height colored rail. The rail IS the identity. */}
          <div
            {...provided.dragHandleProps}
            className={cn(
              "w-[3px] shrink-0 cursor-grab active:cursor-grabbing",
              "transition-[width] duration-150",
              (isHover || snapshot.isDragging) && "w-1",
            )}
            style={{ backgroundColor: muscle.colorHex }}
            aria-label={`Drag ${displayLabel}`}
          />

          {/* Content — click opens popover */}
          <button
            type="button"
            onClick={handleOpen}
            className="flex flex-1 items-center gap-2 py-2 pl-2.5 pr-3 min-w-0 text-left focus:outline-none focus-visible:bg-[hsl(220_13%_10%)]"
          >
            {/* Name + inline chips */}
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="text-[12.5px] leading-none text-white truncate tracking-tight"
                  title={displayLabel}
                >
                  {displayLabel}
                </span>
                {hasExercise && (
                  <Dumbbell
                    className="h-2.5 w-2.5 shrink-0 opacity-80"
                    style={{ color: muscle.colorHex }}
                    aria-label="Exercise assigned"
                  />
                )}
              </div>
              {/* Secondary — tempo / replacements / warning, all monospace */}
              <div className="flex items-center gap-2 font-mono text-[9.5px] text-white/40 leading-none tabular-nums">
                <span className="tracking-wider">
                  {hasTempo ? tempo : "—"}
                </span>
                {replacementCount > 0 && (
                  <span
                    className="tracking-wider"
                    style={{ color: `${muscle.colorHex}99` }}
                  >
                    +{replacementCount}
                  </span>
                )}
              </div>
            </div>

            {/* Sets × reps — the HERO. Big, typographic, muscle-colored. */}
            <div className="shrink-0 text-right tabular-nums leading-none">
              <div
                className="font-display text-[22px] leading-none tracking-wide"
                style={{ color: muscle.colorHex }}
              >
                {sets}
              </div>
              <div className="font-mono text-[9px] text-white/40 mt-1 tracking-wider">
                ×{repMin}-{repMax}
              </div>
            </div>
          </button>

          {/* Missing-intensity warning — amber dot, top-right, pulsing */}
          {needsIntensity && !hasPerSet && (
            <span
              className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse"
              aria-label="Missing RIR or RPE"
            >
              <AlertCircle className="sr-only" />
            </span>
          )}

          {/* Per-set custom — dashed rail along the bottom in muscle color */}
          {hasPerSet && (
            <div
              aria-hidden
              className="pointer-events-none absolute bottom-0 left-[3px] right-0 h-[1.5px] opacity-80"
              style={{
                background: `repeating-linear-gradient(90deg, ${muscle.colorHex} 0 3px, transparent 3px 6px)`,
              }}
            />
          )}
        </article>
      )}
    </Draggable>
  );
});
