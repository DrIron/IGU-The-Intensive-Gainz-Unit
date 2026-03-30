import { memo, useCallback, useState } from "react";
import { Draggable } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Timer, Zap, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getActivityDisplay,
  ACTIVITY_TYPE_COLORS,
  type MuscleSlotData,
  type ActivityType,
} from "@/types/muscle-builder";

interface ActivitySlotCardProps {
  slot: MuscleSlotData;
  draggableIndex: number;
  onRemove: (slotId: string) => void;
  onSetActivityDetails?: (slotId: string, details: Record<string, unknown>) => void;
  isHighlighted?: boolean;
}

/** Format the key metric for the card face */
function formatMetric(slot: MuscleSlotData): string {
  const type = slot.activityType || 'strength';
  if (type === 'hiit' && slot.rounds) {
    return `${slot.rounds}×${slot.workSeconds || 30}s/${slot.restSeconds || 15}s`;
  }
  if (slot.duration) {
    const parts = [`${slot.duration}min`];
    if (slot.distance) parts.push(`${slot.distance >= 1000 ? `${(slot.distance / 1000).toFixed(1)}km` : `${slot.distance}m`}`);
    return parts.join(', ');
  }
  return '30min';
}

export const ActivitySlotCard = memo(function ActivitySlotCard({
  slot,
  draggableIndex,
  onRemove,
  onSetActivityDetails,
  isHighlighted,
}: ActivitySlotCardProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  const handleRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(slot.id);
  }, [slot.id, onRemove]);

  const activity = slot.activityId ? getActivityDisplay(slot.activityId) : null;
  const typeColors = ACTIVITY_TYPE_COLORS[slot.activityType || 'cardio'];
  const colorHex = activity?.colorHex || typeColors.colorHex;
  const colorClass = activity?.colorClass || typeColors.colorClass;
  const label = slot.activityName || activity?.label || slot.activityId || 'Activity';
  const metric = formatMetric(slot);

  const update = useCallback((details: Record<string, unknown>) => {
    onSetActivityDetails?.(slot.id, details);
  }, [slot.id, onSetActivityDetails]);

  return (
    <Draggable draggableId={`slot-${slot.id}`} index={draggableIndex}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            "group flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-sm transition-all",
            snapshot.isDragging
              ? "shadow-lg ring-2 ring-primary/50 bg-card"
              : "bg-card/50 border-border/50 hover:border-border",
            isHighlighted && "ring-2 ring-primary animate-pulse bg-primary/10",
          )}
          style={{
            ...provided.draggableProps.style,
            backgroundColor: snapshot.isDragging || isHighlighted ? undefined : `${colorHex}08`,
          }}
        >
          {/* Drag handle */}
          <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing shrink-0 flex items-center">
            <div className={`w-2 h-2 rounded-full ${colorClass}`} />
          </div>

          {/* Clickable area → popover */}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                onClick={e => e.stopPropagation()}
              >
                <span className="font-medium truncate text-foreground">{label}</span>
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded-full shrink-0"
                  style={{ backgroundColor: `${colorHex}20`, color: colorHex }}
                >
                  {metric}
                </span>
                {slot.targetHrZone && (
                  <Heart className="h-3 w-3 text-red-400 shrink-0" />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-72 p-0"
              onClick={e => e.stopPropagation()}
              align="start"
              side="right"
              sideOffset={8}
            >
              <ScrollArea className="max-h-[60vh]">
                <div className="p-3 space-y-3">
                  {/* Header */}
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${colorClass}`} />
                    <p className="text-sm font-medium">{label}</p>
                  </div>

                  {/* Type-specific fields */}
                  {(slot.activityType === 'cardio' || !slot.activityType) && (
                    <CardioFields slot={slot} onUpdate={update} />
                  )}
                  {slot.activityType === 'hiit' && (
                    <HIITFields slot={slot} onUpdate={update} />
                  )}
                  {slot.activityType === 'yoga_mobility' && (
                    <YogaMobilityFields slot={slot} onUpdate={update} />
                  )}
                  {slot.activityType === 'recovery' && (
                    <RecoveryFields slot={slot} onUpdate={update} />
                  )}
                  {slot.activityType === 'sport_specific' && (
                    <SportSpecificFields slot={slot} onUpdate={update} />
                  )}

                  {/* Notes */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Notes</Label>
                    <Textarea
                      placeholder="Any additional notes..."
                      value={slot.activityNotes || ''}
                      onChange={e => update({ activityNotes: e.target.value || undefined })}
                      className="text-xs min-h-[40px] resize-none"
                      rows={2}
                      onClick={e => e.stopPropagation()}
                    />
                  </div>
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>

          {/* Delete */}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 transition-opacity shrink-0 opacity-0 group-hover:opacity-100"
            onClick={handleRemove}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </Draggable>
  );
});

/* ── Type-specific field editors ────────────────────────────── */

interface FieldProps {
  slot: MuscleSlotData;
  onUpdate: (details: Record<string, unknown>) => void;
}

function CardioFields({ slot, onUpdate }: FieldProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Duration (min)</Label>
          <Input type="number" min={1} max={300} value={slot.duration ?? 30}
            onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) onUpdate({ duration: v }); }}
            className="h-8 text-sm" onClick={e => e.stopPropagation()} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Distance (m)</Label>
          <Input type="number" min={0} max={100000} value={slot.distance ?? ''}
            onChange={e => { const v = e.target.value === '' ? undefined : parseInt(e.target.value); onUpdate({ distance: v }); }}
            className="h-8 text-sm" placeholder="optional" onClick={e => e.stopPropagation()} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">HR Zone (1-5)</Label>
          <Input type="number" min={1} max={5} value={slot.targetHrZone ?? ''}
            onChange={e => { const v = e.target.value === '' ? undefined : parseInt(e.target.value); onUpdate({ targetHrZone: v }); }}
            className="h-8 text-sm" placeholder="1-5" onClick={e => e.stopPropagation()} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Pace</Label>
          <Input type="text" value={slot.pace ?? ''} placeholder="e.g. 5:30/km"
            onChange={e => onUpdate({ pace: e.target.value || undefined })}
            className="h-8 text-sm" onClick={e => e.stopPropagation()} />
        </div>
      </div>
    </>
  );
}

function HIITFields({ slot, onUpdate }: FieldProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Rounds</Label>
          <Input type="number" min={1} max={50} value={slot.rounds ?? 4}
            onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) onUpdate({ rounds: v }); }}
            className="h-8 text-sm" onClick={e => e.stopPropagation()} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Duration (min)</Label>
          <Input type="number" min={1} max={120} value={slot.duration ?? ''}
            onChange={e => { const v = e.target.value === '' ? undefined : parseInt(e.target.value); onUpdate({ duration: v }); }}
            className="h-8 text-sm" placeholder="total" onClick={e => e.stopPropagation()} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Work (sec)</Label>
          <Input type="number" min={5} max={300} value={slot.workSeconds ?? 30}
            onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) onUpdate({ workSeconds: v }); }}
            className="h-8 text-sm" onClick={e => e.stopPropagation()} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Rest (sec)</Label>
          <Input type="number" min={0} max={300} value={slot.restSeconds ?? 15}
            onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) onUpdate({ restSeconds: v }); }}
            className="h-8 text-sm" onClick={e => e.stopPropagation()} />
        </div>
      </div>
    </>
  );
}

function YogaMobilityFields({ slot, onUpdate }: FieldProps) {
  return (
    <>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Duration (min)</Label>
        <Input type="number" min={1} max={120} value={slot.duration ?? 30}
          onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) onUpdate({ duration: v }); }}
          className="h-8 text-sm" onClick={e => e.stopPropagation()} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Difficulty</Label>
        <Select value={slot.difficulty || ''} onValueChange={v => onUpdate({ difficulty: v || undefined })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select level" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="beginner">Beginner</SelectItem>
            <SelectItem value="intermediate">Intermediate</SelectItem>
            <SelectItem value="advanced">Advanced</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

function RecoveryFields({ slot, onUpdate }: FieldProps) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">Duration (min)</Label>
      <Input type="number" min={1} max={120} value={slot.duration ?? 30}
        onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) onUpdate({ duration: v }); }}
        className="h-8 text-sm" onClick={e => e.stopPropagation()} />
    </div>
  );
}

function SportSpecificFields({ slot, onUpdate }: FieldProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Duration (min)</Label>
          <Input type="number" min={1} max={180} value={slot.duration ?? 30}
            onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) onUpdate({ duration: v }); }}
            className="h-8 text-sm" onClick={e => e.stopPropagation()} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Sets</Label>
          <Input type="number" min={1} max={20} value={slot.sets ?? 1}
            onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) onUpdate({ sets: v }); }}
            className="h-8 text-sm" onClick={e => e.stopPropagation()} />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Reps</Label>
        <Input type="number" min={1} max={100} value={slot.repMin ?? ''}
          onChange={e => { const v = e.target.value === '' ? undefined : parseInt(e.target.value); onUpdate({ repMin: v, repMax: v }); }}
          className="h-8 text-sm" placeholder="optional" onClick={e => e.stopPropagation()} />
      </div>
    </>
  );
}
