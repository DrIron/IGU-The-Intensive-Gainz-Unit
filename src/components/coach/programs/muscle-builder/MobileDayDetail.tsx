import { memo, useMemo, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Copy, ClipboardPaste, Plus, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DAYS_OF_WEEK,
  MUSCLE_GROUPS,
  MUSCLE_MAP,
  BODY_REGIONS,
  BODY_REGION_LABELS,
  type MuscleSlotData,
  type BodyRegion,
} from "@/types/muscle-builder";

interface MobileDayDetailProps {
  slots: MuscleSlotData[];
  selectedDayIndex: number;
  onSetSets: (slotId: string, sets: number) => void;
  onRemove: (slotId: string) => void;
  onAddMuscle: (dayIndex: number, muscleId: string) => void;
  copiedDayIndex?: number | null;
  onCopyDay?: (dayIndex: number) => void;
  onPasteDay?: (dayIndex: number) => void;
  highlightedMuscleId?: string | null;
  onSetAllSets?: (muscleId: string, sets: number) => void;
}

const musclesByRegion = new Map<BodyRegion, typeof MUSCLE_GROUPS>();
for (const region of BODY_REGIONS) {
  musclesByRegion.set(region, MUSCLE_GROUPS.filter(m => m.bodyRegion === region));
}

export const MobileDayDetail = memo(function MobileDayDetail({
  slots,
  selectedDayIndex,
  onSetSets,
  onRemove,
  onAddMuscle,
  copiedDayIndex,
  onCopyDay,
  onPasteDay,
  highlightedMuscleId,
}: MobileDayDetailProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const daySlots = useMemo(
    () => slots.filter(s => s.dayIndex === selectedDayIndex).sort((a, b) => a.sortOrder - b.sortOrder),
    [slots, selectedDayIndex],
  );

  const totalSets = useMemo(
    () => daySlots.reduce((sum, s) => sum + s.sets, 0),
    [daySlots],
  );

  const hasCopied = copiedDayIndex != null;
  const isCopiedDay = copiedDayIndex === selectedDayIndex;

  const handleAddMuscle = useCallback(
    (muscleId: string) => {
      onAddMuscle(selectedDayIndex, muscleId);
    },
    [onAddMuscle, selectedDayIndex],
  );

  const filteredMuscles = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return MUSCLE_GROUPS.filter(
      m => m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
    );
  }, [search]);

  return (
    <Card className="border-border/50">
      <CardHeader className="p-3 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">
              {DAYS_OF_WEEK[selectedDayIndex - 1]}
            </span>
            {totalSets > 0 && (
              <span className="text-[10px] font-mono text-muted-foreground">
                {totalSets} sets
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {daySlots.length > 0 && onCopyDay && (
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-7 w-7", isCopiedDay && "text-primary")}
                onClick={() => onCopyDay(selectedDayIndex)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            )}
            {hasCopied && !isCopiedDay && onPasteDay && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-primary"
                onClick={() => onPasteDay(selectedDayIndex)}
              >
                <ClipboardPaste className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3 pt-0 space-y-2">
        {pickerOpen ? (
          /* ── Inline Muscle Picker ─────────────────────────── */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Add Muscle</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => { setPickerOpen(false); setSearch(""); }}
              >
                Done
              </Button>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search muscles..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
                autoFocus
              />
            </div>

            {filteredMuscles ? (
              <div className="flex flex-wrap gap-1.5">
                {filteredMuscles.map(muscle => (
                  <MuscleChip
                    key={muscle.id}
                    muscleId={muscle.id}
                    label={muscle.label}
                    colorClass={muscle.colorClass}
                    onTap={handleAddMuscle}
                  />
                ))}
                {filteredMuscles.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2">
                    {search ? `No muscles match "${search}"` : "No muscles found"}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {BODY_REGIONS.map(region => {
                  const muscles = musclesByRegion.get(region) || [];
                  return (
                    <div key={region}>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                        {BODY_REGION_LABELS[region]}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {muscles.map(muscle => (
                          <MuscleChip
                            key={muscle.id}
                            muscleId={muscle.id}
                            label={muscle.label}
                            colorClass={muscle.colorClass}
                            onTap={handleAddMuscle}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* ── Slot List ────────────────────────────────────── */
          <>
            {daySlots.length === 0 ? (
              <div className="flex items-center justify-center h-16 text-xs text-muted-foreground/50">
                Rest day &mdash; tap + to add muscles
              </div>
            ) : (
              <div className="space-y-1.5">
                {daySlots.map(slot => {
                  const muscle = MUSCLE_MAP.get(slot.muscleId);
                  if (!muscle) return null;
                  return (
                    <MobileSlotRow
                      key={slot.id}
                      slotId={slot.id}
                      muscle={muscle}
                      sets={slot.sets}
                      isHighlighted={highlightedMuscleId === slot.muscleId}
                      onSetSets={onSetSets}
                      onRemove={onRemove}
                    />
                  );
                })}
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full h-9 text-xs"
              onClick={() => setPickerOpen(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Muscle
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
});

/* ── Tappable muscle chip for the picker ──────────────────── */

interface MuscleChipProps {
  muscleId: string;
  label: string;
  colorClass: string;
  onTap: (muscleId: string) => void;
}

const MuscleChip = memo(function MuscleChip({ muscleId, label, colorClass, onTap }: MuscleChipProps) {
  return (
    <button
      onClick={() => onTap(muscleId)}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm bg-card/50 hover:bg-card border border-border/50 active:scale-95 transition-all"
    >
      <div className={`w-2 h-2 rounded-full shrink-0 ${colorClass}`} />
      <span className="text-foreground">{label}</span>
    </button>
  );
});

/* ── Mobile slot row (always-visible controls) ────────────── */

interface MobileSlotRowProps {
  slotId: string;
  muscle: { id: string; label: string; colorClass: string; colorHex: string };
  sets: number;
  isHighlighted: boolean;
  onSetSets: (slotId: string, sets: number) => void;
  onRemove: (slotId: string) => void;
}

const MobileSlotRow = memo(function MobileSlotRow({
  slotId,
  muscle,
  sets,
  isHighlighted,
  onSetSets,
  onRemove,
}: MobileSlotRowProps) {
  const handleSetsChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value);
      if (!isNaN(val)) onSetSets(slotId, Math.max(1, Math.min(20, val)));
    },
    [slotId, onSetSets],
  );

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2.5 py-2 rounded-md border text-sm",
        isHighlighted
          ? "ring-2 ring-primary animate-pulse bg-primary/10"
          : "bg-card/50 border-border/50",
      )}
      style={{ backgroundColor: isHighlighted ? undefined : `${muscle.colorHex}08` }}
    >
      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${muscle.colorClass}`} />
      <span className="font-medium truncate flex-1 text-foreground">{muscle.label}</span>
      <Input
        type="number"
        min={1}
        max={20}
        value={sets}
        onChange={handleSetsChange}
        className="w-14 h-7 text-center text-xs px-1 bg-background/50"
        inputMode="numeric"
      />
      <span className="text-[10px] text-muted-foreground">sets</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 opacity-100"
        onClick={() => onRemove(slotId)}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
});
