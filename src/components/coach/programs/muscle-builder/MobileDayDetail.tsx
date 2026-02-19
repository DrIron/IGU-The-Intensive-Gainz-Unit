import { memo, useMemo, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Copy, ClipboardPaste, Plus, X, Search, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DAYS_OF_WEEK,
  MUSCLE_GROUPS,
  MUSCLE_MAP,
  SUBDIVISIONS,
  BODY_REGIONS,
  BODY_REGION_LABELS,
  getMuscleDisplay,
  resolveParentMuscleId,
  SUBDIVISIONS_BY_PARENT,
  SUBDIVISION_MAP,
  type MuscleSlotData,
  type BodyRegion,
} from "@/types/muscle-builder";

interface MobileDayDetailProps {
  slots: MuscleSlotData[];
  selectedDayIndex: number;
  onSetSlotDetails: (slotId: string, details: { sets?: number; repMin?: number; repMax?: number; tempo?: string | undefined; rir?: number | undefined; rpe?: number | undefined }) => void;
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

/** Format slot label: subdivisions show "Parent > Sub", parents show their label */
function formatSlotLabel(muscleId: string): string {
  const sub = SUBDIVISION_MAP.get(muscleId);
  if (sub) {
    const parent = MUSCLE_MAP.get(sub.parentId);
    const shortLabel = sub.label.replace(/\s*\(.*?\)\s*/, '');
    return `${parent?.label ?? sub.parentId} \u203A ${shortLabel}`;
  }
  const display = getMuscleDisplay(muscleId);
  return display?.label ?? muscleId;
}

export const MobileDayDetail = memo(function MobileDayDetail({
  slots,
  selectedDayIndex,
  onSetSlotDetails,
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

  const filteredItems = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const parents = MUSCLE_GROUPS.filter(
      m => m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
    );
    const subs = SUBDIVISIONS.filter(
      s => s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
    );
    return { parents, subs };
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
          /* -- Inline Muscle Picker -- */
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

            {filteredItems ? (
              <div className="flex flex-wrap gap-1.5">
                {filteredItems.parents.map(muscle => (
                  <MuscleChip
                    key={muscle.id}
                    muscleId={muscle.id}
                    label={muscle.label}
                    colorClass={muscle.colorClass}
                    onTap={handleAddMuscle}
                  />
                ))}
                {filteredItems.subs.map(sub => {
                  const parent = MUSCLE_MAP.get(sub.parentId);
                  if (!parent) return null;
                  return (
                    <MuscleChip
                      key={sub.id}
                      muscleId={sub.id}
                      label={sub.label}
                      colorClass={parent.colorClass}
                      onTap={handleAddMuscle}
                      isSubdivision
                    />
                  );
                })}
                {filteredItems.parents.length === 0 && filteredItems.subs.length === 0 && (
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
                      {muscles.map(muscle => {
                        const subs = SUBDIVISIONS_BY_PARENT.get(muscle.id);
                        if (!subs || subs.length === 0) return null;
                        return (
                          <div key={`${muscle.id}-subs`} className="flex flex-wrap gap-1 mt-1 ml-2">
                            {subs.map(sub => (
                              <MuscleChip
                                key={sub.id}
                                muscleId={sub.id}
                                label={sub.label}
                                colorClass={muscle.colorClass}
                                onTap={handleAddMuscle}
                                isSubdivision
                              />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* -- Slot List -- */
          <>
            {daySlots.length === 0 ? (
              <div className="flex items-center justify-center h-16 text-xs text-muted-foreground/50">
                Rest day &mdash; tap + to add muscles
              </div>
            ) : (
              <div className="space-y-1.5">
                {daySlots.map(slot => {
                  const muscle = getMuscleDisplay(slot.muscleId);
                  if (!muscle) return null;
                  return (
                    <MobileSlotRow
                      key={slot.id}
                      slot={slot}
                      muscle={muscle}
                      label={formatSlotLabel(slot.muscleId)}
                      isHighlighted={highlightedMuscleId != null && resolveParentMuscleId(slot.muscleId) === highlightedMuscleId}
                      onSetSlotDetails={onSetSlotDetails}
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

/* -- Tappable muscle chip for the picker -- */

interface MuscleChipProps {
  muscleId: string;
  label: string;
  colorClass: string;
  onTap: (muscleId: string) => void;
  isSubdivision?: boolean;
}

const MuscleChip = memo(function MuscleChip({ muscleId, label, colorClass, onTap, isSubdivision }: MuscleChipProps) {
  return (
    <button
      onClick={() => onTap(muscleId)}
      className={`inline-flex items-center gap-1.5 rounded-md bg-card/50 hover:bg-card border active:scale-95 transition-all ${
        isSubdivision
          ? 'px-2 py-1 text-xs border-dashed border-border/40'
          : 'px-2.5 py-1.5 text-sm border-border/50'
      }`}
    >
      <div className={`w-2 h-2 rounded-full shrink-0 ${colorClass}`} style={isSubdivision ? { opacity: 0.7 } : undefined} />
      <span className={isSubdivision ? 'text-muted-foreground' : 'text-foreground'}>{label}</span>
    </button>
  );
});

/* -- Mobile slot row (minimal card + tap to edit popover) -- */

interface MobileSlotRowProps {
  slot: MuscleSlotData;
  muscle: { label: string; colorClass: string; colorHex: string };
  label: string;
  isHighlighted: boolean;
  onSetSlotDetails: (slotId: string, details: { sets?: number; repMin?: number; repMax?: number; tempo?: string | undefined; rir?: number | undefined; rpe?: number | undefined }) => void;
  onRemove: (slotId: string) => void;
}

const MobileSlotRow = memo(function MobileSlotRow({
  slot,
  muscle,
  label,
  isHighlighted,
  onSetSlotDetails,
  onRemove,
}: MobileSlotRowProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  const hasTempo = !!slot.tempo && slot.tempo.length === 4;
  const needsIntensity = hasTempo && slot.rir == null && slot.rpe == null;

  const update = useCallback(
    (details: { sets?: number; repMin?: number; repMax?: number; tempo?: string | undefined; rir?: number | undefined; rpe?: number | undefined }) => {
      onSetSlotDetails(slot.id, details);
    },
    [slot.id, onSetSlotDetails],
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

      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-1.5 flex-1 min-w-0 text-left">
            <span className="font-medium truncate text-foreground">{label}</span>
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded-full shrink-0"
              style={{ backgroundColor: `${muscle.colorHex}20`, color: muscle.colorHex }}
            >
              {slot.sets}s
            </span>
            {hasTempo && (
              <span className="text-[10px] font-mono text-muted-foreground shrink-0">{slot.tempo}</span>
            )}
            {needsIntensity && (
              <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-64 p-3"
          onClick={e => e.stopPropagation()}
          side="bottom"
          align="start"
        >
          <div className="space-y-3">
            <p className="text-sm font-medium">{label}</p>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Sets</Label>
              <Input
                type="number" min={1} max={20} value={slot.sets}
                onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) update({ sets: v }); }}
                className="h-8 text-sm" inputMode="numeric" onClick={e => e.stopPropagation()}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Rep Range</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={1} max={100} value={slot.repMin ?? 8}
                  onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) update({ repMin: v }); }}
                  className="h-8 text-sm flex-1" inputMode="numeric" onClick={e => e.stopPropagation()}
                />
                <span className="text-xs text-muted-foreground">&mdash;</span>
                <Input
                  type="number" min={1} max={100} value={slot.repMax ?? 12}
                  onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) update({ repMax: v }); }}
                  className="h-8 text-sm flex-1" inputMode="numeric" onClick={e => e.stopPropagation()}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tempo</Label>
              <Input
                type="text" maxLength={4} pattern="[0-9]{4}" inputMode="numeric" placeholder="3120"
                value={slot.tempo ?? ''}
                onChange={e => { const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 4); update({ tempo: v || undefined }); }}
                className="h-8 text-sm font-mono" onClick={e => e.stopPropagation()}
              />
              <p className="text-[10px] text-muted-foreground">ecc-pause-con-pause in seconds</p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">RIR</Label>
              <Input
                type="number" min={0} max={10} placeholder="2"
                value={slot.rir ?? ''}
                onChange={e => {
                  const v = e.target.value === '' ? undefined : parseInt(e.target.value);
                  update({ rir: v != null && !isNaN(v) ? Math.max(0, Math.min(10, v)) : undefined });
                }}
                className="h-8 text-sm" inputMode="numeric" onClick={e => e.stopPropagation()}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">RPE</Label>
              <Input
                type="number" min={1} max={10} step={0.5} placeholder="8"
                value={slot.rpe ?? ''}
                onChange={e => {
                  const v = e.target.value === '' ? undefined : parseFloat(e.target.value);
                  update({ rpe: v != null && !isNaN(v) ? Math.max(1, Math.min(10, v)) : undefined });
                }}
                className="h-8 text-sm" inputMode="numeric" onClick={e => e.stopPropagation()}
              />
            </div>

            {needsIntensity && (
              <div className="flex items-start gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-600 dark:text-amber-400">Add RIR or RPE for TUST tracking</p>
              </div>
            )}

            <div className="text-[10px] text-muted-foreground space-y-0.5 pt-1 border-t border-border/30">
              <p>Working set: RIR &le; 5 or RPE &ge; 5</p>
              <p>Only working sets count for TUST</p>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 opacity-100"
        onClick={() => onRemove(slot.id)}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
});
