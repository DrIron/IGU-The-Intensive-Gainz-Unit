// src/components/coach/programs/muscle-builder/DeloadDialog.tsx
//
// Coach-side deload customisation. Opens when a coach picks "Mark as Deload"
// on the WeekTabStrip kebab. Lets them choose:
//   - base content (clone from another week / fresh blank / keep current)
//   - a preset (Volume / Intensity / Recovery / None — just flag the week)
// Apply dispatches APPLY_DELOAD; preset-touched fields are marked as
// manualOverrides so the W1 progression rules don't re-clobber them on a
// later recompute.
//
// Spec: docs/PLANNING_BOARD_WEEKLY_DELTAS_PLAN.md §9

import { memo, useMemo, useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Snowflake } from "lucide-react";
import { BUILTIN_DELOAD_PRESETS, findDeloadPreset } from "./deloadPresets";
import type { WeekData, MuscleSlotData } from "@/types/muscle-builder";

export type DeloadBaseContent = "clone" | "fresh" | "keep";

export interface ApplyDeloadParams {
  weekIndex: number;
  baseContent: DeloadBaseContent;
  sourceWeekIndex?: number;
  presetId: string | null;
}

interface DeloadDialogProps {
  open: boolean;
  weekIndex: number | null;
  weeks: WeekData[];
  onClose: () => void;
  onApply: (params: ApplyDeloadParams) => void;
}

const NONE_PRESET_ID = "__none__";

export const DeloadDialog = memo(function DeloadDialog({
  open,
  weekIndex,
  weeks,
  onClose,
  onApply,
}: DeloadDialogProps) {
  const targetWeek = weekIndex != null ? weeks[weekIndex] : null;
  const targetWeekLabel = targetWeek?.label || (weekIndex != null ? `W${weekIndex + 1}` : "");

  // ---- Local form state ----
  // Reset every time the dialog opens for a new week.
  const [baseContent, setBaseContent] = useState<DeloadBaseContent>("keep");
  const [sourceWeekIndex, setSourceWeekIndex] = useState<number>(0);
  const [presetId, setPresetId] = useState<string>(BUILTIN_DELOAD_PRESETS[0]?.id ?? NONE_PRESET_ID);

  useEffect(() => {
    if (open) {
      setBaseContent("keep");
      setSourceWeekIndex(0);
      setPresetId(BUILTIN_DELOAD_PRESETS[0]?.id ?? NONE_PRESET_ID);
    }
  }, [open, weekIndex]);

  // ---- Preview ----
  // Pull the first 3 strength slots from the resolved base content + preset
  // so the coach can sanity-check what each slot becomes.
  const previewRows = useMemo(() => {
    if (weekIndex == null) return [];
    let baseSlots: MuscleSlotData[] = [];
    if (baseContent === "fresh") {
      baseSlots = [];
    } else if (baseContent === "clone") {
      baseSlots = weeks[sourceWeekIndex]?.slots ?? [];
    } else {
      baseSlots = targetWeek?.slots ?? [];
    }
    const preset = presetId !== NONE_PRESET_ID ? findDeloadPreset(presetId) : null;
    const previewable = baseSlots
      .filter(s => !s.activityType || s.activityType === "strength")
      .slice(0, 4);
    return previewable.map((slot) => {
      const after = preset ? preset.apply(slot) : slot;
      return {
        id: slot.id,
        muscleId: slot.muscleId,
        exerciseName: slot.exercise?.name,
        before: {
          sets: slot.sets,
          rir: slot.rir,
        },
        after: {
          sets: after.sets,
          rir: after.rir,
        },
      };
    });
  }, [weekIndex, baseContent, sourceWeekIndex, presetId, weeks, targetWeek]);

  if (weekIndex == null) return null;

  const handleApply = () => {
    onApply({
      weekIndex,
      baseContent,
      sourceWeekIndex: baseContent === "clone" ? sourceWeekIndex : undefined,
      presetId: presetId === NONE_PRESET_ID ? null : presetId,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Snowflake className="h-4 w-4 text-blue-500" />
            Make {targetWeekLabel} a deload week
          </DialogTitle>
          <DialogDescription>
            Choose how this week's content is built and whether to apply a deload preset.
            Hand-edits on this week will be protected from later recomputes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Base content */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Base content</Label>
            <RadioGroup
              value={baseContent}
              onValueChange={(v) => setBaseContent(v as DeloadBaseContent)}
              className="space-y-1"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="keep" id="dl-keep" />
                <Label htmlFor="dl-keep" className="text-xs cursor-pointer">
                  Keep current content ({targetWeek?.slots.length ?? 0} slots)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="clone" id="dl-clone" />
                <Label htmlFor="dl-clone" className="text-xs cursor-pointer">
                  Clone from another week
                </Label>
                {baseContent === "clone" && (
                  <Select
                    value={String(sourceWeekIndex)}
                    onValueChange={(v) => setSourceWeekIndex(parseInt(v, 10))}
                  >
                    <SelectTrigger className="h-7 text-xs w-32 ml-auto">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {weeks.map((w, i) =>
                        i === weekIndex ? null : (
                          <SelectItem key={i} value={String(i)} className="text-xs">
                            {w.label || `W${i + 1}`} ({w.slots.length} slots)
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="fresh" id="dl-fresh" />
                <Label htmlFor="dl-fresh" className="text-xs cursor-pointer">
                  Fresh blank week (build from scratch)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Preset */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Apply deload preset</Label>
            <RadioGroup
              value={presetId}
              onValueChange={setPresetId}
              className="space-y-1"
            >
              {BUILTIN_DELOAD_PRESETS.map((preset) => (
                <div key={preset.id} className="flex items-start gap-2">
                  <RadioGroupItem value={preset.id} id={`dl-preset-${preset.id}`} className="mt-0.5" />
                  <Label htmlFor={`dl-preset-${preset.id}`} className="cursor-pointer">
                    <div className="text-xs font-medium">{preset.label}</div>
                    <div className="text-[10px] text-muted-foreground">{preset.shortDescription}</div>
                  </Label>
                </div>
              ))}
              <div className="flex items-start gap-2">
                <RadioGroupItem value={NONE_PRESET_ID} id="dl-preset-none" className="mt-0.5" />
                <Label htmlFor="dl-preset-none" className="cursor-pointer">
                  <div className="text-xs font-medium">None</div>
                  <div className="text-[10px] text-muted-foreground">Just flag the week as deload, don't transform content</div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Preview */}
          {previewRows.length > 0 && presetId !== NONE_PRESET_ID && (
            <div className="space-y-1 rounded-md border border-border/40 bg-muted/10 p-2">
              <div className="text-[10px] text-muted-foreground font-medium">Preview (first {previewRows.length} slot{previewRows.length === 1 ? "" : "s"})</div>
              <div className="space-y-1">
                {previewRows.map((row) => (
                  <div key={row.id} className="flex items-center justify-between text-[11px] font-mono">
                    <span className="truncate flex-1">{row.exerciseName ?? row.muscleId}</span>
                    <span className="text-muted-foreground">
                      {row.before.sets} sets {row.before.rir != null ? `RIR ${row.before.rir}` : ""}
                      <span className="mx-1">→</span>
                      <span className="text-foreground font-medium">
                        {row.after.sets} sets {row.after.rir != null ? `RIR ${row.after.rir}` : ""}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleApply}>Apply deload</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
