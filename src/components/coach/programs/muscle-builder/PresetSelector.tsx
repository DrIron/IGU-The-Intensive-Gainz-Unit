import { memo, useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Loader2, Sparkles, User } from "lucide-react";
import {
  SYSTEM_PRESETS,
  MUSCLE_MAP,
  DAYS_OF_WEEK,
  type MuscleSlotData,
} from "@/types/muscle-builder";

interface PresetSelectorProps {
  coachUserId: string;
  onSelectPreset: (slots: MuscleSlotData[], name?: string) => void;
}

interface CoachPreset {
  id: string;
  name: string;
  description: string | null;
  slot_config: MuscleSlotData[];
}

export const PresetSelector = memo(function PresetSelector({
  coachUserId,
  onSelectPreset,
}: PresetSelectorProps) {
  const [coachPresets, setCoachPresets] = useState<CoachPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    (async () => {
      const { data } = await supabase
        .from('muscle_program_templates')
        .select('id, name, description, slot_config')
        .eq('coach_id', coachUserId)
        .eq('is_preset', true)
        .order('updated_at', { ascending: false });

      setCoachPresets(
        (data || []).map(d => ({
          id: d.id,
          name: d.name,
          description: d.description,
          slot_config: d.slot_config as MuscleSlotData[],
        }))
      );
      setLoading(false);
    })();
  }, [coachUserId]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-2">Start from a template</h3>
        <p className="text-xs text-muted-foreground">
          Pick a preset to populate the calendar, then customize muscle placement and sets.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SYSTEM_PRESETS.map(preset => (
          <HoverCard key={preset.name} openDelay={300}>
            <HoverCardTrigger asChild>
              <div>
                <PresetCard
                  name={preset.name}
                  description={preset.description}
                  slots={preset.slots}
                  isSystem
                  onSelect={() => onSelectPreset(preset.slots, preset.name)}
                />
              </div>
            </HoverCardTrigger>
            <HoverCardContent className="w-auto p-3" side="right">
              <MiniPresetPreview slots={preset.slots} />
            </HoverCardContent>
          </HoverCard>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading your presets...
        </div>
      ) : coachPresets.length > 0 ? (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Your Presets</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {coachPresets.map(preset => (
              <HoverCard key={preset.id} openDelay={300}>
                <HoverCardTrigger asChild>
                  <div>
                    <PresetCard
                      name={preset.name}
                      description={preset.description || ''}
                      slots={preset.slot_config}
                      onSelect={() => onSelectPreset(preset.slot_config, preset.name)}
                    />
                  </div>
                </HoverCardTrigger>
                <HoverCardContent className="w-auto p-3" side="right">
                  <MiniPresetPreview slots={preset.slot_config} />
                </HoverCardContent>
              </HoverCard>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
});

function PresetCard({
  name,
  description,
  slots,
  isSystem,
  onSelect,
}: {
  name: string;
  description: string;
  slots: MuscleSlotData[];
  isSystem?: boolean;
  onSelect: () => void;
}) {
  const trainingDays = new Set(slots.map(s => s.dayIndex)).size;
  const totalSets = slots.reduce((sum, s) => sum + s.sets, 0);
  const muscleCount = new Set(slots.map(s => s.muscleId)).size;

  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors border-border/50"
      onClick={onSelect}
    >
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-center gap-2">
          {isSystem ? (
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          ) : (
            <User className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">{name}</span>
        </div>
        <p className="text-[11px] text-muted-foreground">{description}</p>
        <div className="flex gap-2 text-[10px] text-muted-foreground">
          <Badge variant="outline" className="text-[10px]">{trainingDays} days</Badge>
          <Badge variant="outline" className="text-[10px]">{muscleCount} muscles</Badge>
          <Badge variant="outline" className="text-[10px]">{totalSets} sets</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniPresetPreview({ slots }: { slots: MuscleSlotData[] }) {
  return (
    <div>
      <p className="text-xs font-medium mb-2">Weekly layout</p>
      <div className="grid grid-cols-7 gap-1">
        {DAYS_OF_WEEK.map((day, i) => {
          const dayIndex = i + 1;
          const daySlots = slots.filter(s => s.dayIndex === dayIndex);
          return (
            <div key={day} className="text-center">
              <span className="text-[9px] text-muted-foreground font-medium">{day}</span>
              <div className="flex flex-col items-center gap-0.5 mt-1 min-h-[20px]">
                {daySlots.length === 0 ? (
                  <span className="text-[9px] text-muted-foreground/40">-</span>
                ) : (
                  daySlots.map(slot => {
                    const muscle = MUSCLE_MAP.get(slot.muscleId);
                    return (
                      <div
                        key={slot.muscleId}
                        className={`w-3 h-3 rounded-sm ${muscle?.colorClass || 'bg-muted'}`}
                        title={`${muscle?.label || slot.muscleId}: ${slot.sets} sets`}
                      />
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
