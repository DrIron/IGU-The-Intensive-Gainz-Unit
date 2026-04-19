import { memo, useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, Trash2, Copy, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SetPrescription } from "@/types/workout-builder";
import { AVAILABLE_PRESCRIPTION_COLUMNS } from "@/types/workout-builder";
import { MobileSetCard, type MobileSetField } from "./MobileSetCard";

export interface MobileSetCarouselProps {
  sets: SetPrescription[];
  /** Which columns are active (drives which fields render on every card) */
  activeColumns: string[];
  onUpdateSet: (index: number, field: keyof SetPrescription, value: number | string | undefined) => void;
  onAddSet?: () => void;
  onDeleteSet?: (index: number) => void;
  onSetColumns?: (columns: string[]) => void;
  /** Copy set[currentIndex]'s values onto every higher-indexed set */
  onApplyToRemaining?: (index: number) => void;
}

/**
 * Mobile per-set editor — one card per set, tap the arrows or the progress
 * dots to move between sets. Replaces the compact desktop table on phones
 * where a 5-column numeric grid is unusable.
 *
 * Coach sees exactly one set at a time, with full-width inputs sized for a
 * numeric keypad. "Apply to remaining" forward-fills the current card's
 * values so typing 8-12 / 3010 / RIR 2 / 90s once per slot is enough in the
 * common case where only a handful of sets diverge.
 */
export const MobileSetCarousel = memo(function MobileSetCarousel({
  sets,
  activeColumns,
  onUpdateSet,
  onAddSet,
  onDeleteSet,
  onSetColumns,
  onApplyToRemaining,
}: MobileSetCarouselProps) {
  const [index, setIndex] = useState(0);
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  const safeIndex = Math.min(index, Math.max(0, sets.length - 1));
  const currentSet = sets[safeIndex];
  const total = sets.length;

  const fields = useMemo<MobileSetField[]>(() => {
    const f: MobileSetField[] = [];
    if (activeColumns.includes("rep_range")) f.push({ type: "rep_range", label: "Reps (range)" });
    if (activeColumns.includes("reps")) f.push({ type: "reps", label: "Reps" });
    if (activeColumns.includes("weight")) f.push({ type: "weight", label: "Weight (kg)" });
    if (activeColumns.includes("tempo")) f.push({ type: "tempo", label: "Tempo" });
    if (activeColumns.includes("rir")) f.push({ type: "rir", label: "RIR" });
    if (activeColumns.includes("rpe")) f.push({ type: "rpe", label: "RPE" });
    if (activeColumns.includes("percent_1rm")) f.push({ type: "percent_1rm", label: "% 1RM" });
    if (activeColumns.includes("rest")) f.push({ type: "rest_seconds", label: "Rest (seconds)" });
    if (activeColumns.includes("time")) f.push({ type: "time_seconds", label: "Time (seconds)" });
    if (activeColumns.includes("distance")) f.push({ type: "distance_meters", label: "Distance (meters)" });
    if (activeColumns.includes("notes")) f.push({ type: "notes", label: "Notes" });
    return f;
  }, [activeColumns]);

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setIndex((i) => Math.min(sets.length - 1, i + 1)), [sets.length]);

  const handleApplyForward = useCallback(() => {
    if (onApplyToRemaining) onApplyToRemaining(safeIndex);
  }, [onApplyToRemaining, safeIndex]);

  const handleDelete = useCallback(() => {
    if (!onDeleteSet) return;
    onDeleteSet(safeIndex);
    // Keep the carousel positioned on a valid card after deletion.
    setIndex((i) => Math.max(0, Math.min(i, sets.length - 2)));
  }, [onDeleteSet, safeIndex, sets.length]);

  if (!currentSet) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground text-sm">
        No sets yet.
        {onAddSet && (
          <Button size="sm" onClick={onAddSet}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add first set
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Column chooser — applies to every set */}
      <div className="space-y-1.5">
        <button
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShowColumnPicker((v) => !v)}
          type="button"
        >
          <Settings2 className="h-3 w-3" />
          {showColumnPicker ? "Hide columns" : "Choose columns"}
        </button>
        {showColumnPicker && onSetColumns && (
          <div className="flex flex-wrap gap-1.5">
            {AVAILABLE_PRESCRIPTION_COLUMNS.filter((c) => c.type !== "sets" && c.type !== "custom").map((col) => {
              const active = activeColumns.includes(col.type);
              return (
                <button
                  key={col.type}
                  type="button"
                  aria-pressed={active}
                  className={cn(
                    "text-[11px] px-2 py-1 rounded-full border transition-colors",
                    active
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-border/60 text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => {
                    const next = active ? activeColumns.filter((t) => t !== col.type) : [...activeColumns, col.type];
                    onSetColumns(next.length > 0 ? next : ["rep_range"]);
                  }}
                >
                  {col.label.replace(/\s*\(.*?\)/, "")}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Progress dots — tap to jump */}
      <div
        className="flex items-center justify-center gap-1.5"
        role="tablist"
        aria-label="Set"
      >
        {sets.map((_, i) => {
          const isActive = i === safeIndex;
          return (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={`Set ${i + 1} of ${total}`}
              onClick={() => setIndex(i)}
              className={cn(
                "h-7 min-w-7 px-1.5 rounded-full text-[11px] font-mono tabular-nums transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* The card — one set at a time */}
      <MobileSetCard
        set={currentSet}
        index={safeIndex}
        total={total}
        fields={fields}
        onUpdate={(field, value) => onUpdateSet(safeIndex, field, value)}
      />

      {/* Prev / Next nav */}
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={goPrev}
          disabled={safeIndex === 0}
          className="min-w-[5.5rem]"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Set {safeIndex}
        </Button>

        <span
          className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground"
          aria-live="polite"
        >
          Set {safeIndex + 1} of {total}
        </span>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={goNext}
          disabled={safeIndex === total - 1}
          className="min-w-[5.5rem] justify-end"
        >
          Set {safeIndex + 2}
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {/* Escape hatches */}
      <div className="grid grid-cols-1 gap-2 pt-2 border-t border-border/40">
        {onApplyToRemaining && safeIndex < total - 1 && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleApplyForward}
            className="w-full"
          >
            <Copy className="h-3.5 w-3.5 mr-2" />
            Apply this set to remaining ({total - safeIndex - 1})
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          {onAddSet && (
            <Button type="button" variant="outline" size="sm" onClick={onAddSet}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add set
            </Button>
          )}
          {onDeleteSet && total > 1 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDelete}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete set
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});
