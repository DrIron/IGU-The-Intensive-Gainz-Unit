// src/components/coach/programs/SessionTypeSelector.tsx
// Component for selecting session type and timing

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SessionType,
  SessionTiming,
  SESSION_TYPES,
  SESSION_TIMINGS,
} from "@/types/workout-builder";
import { Dumbbell, Heart, Zap, StretchHorizontal, Bed, Target, MoreHorizontal, Sun, Moon, Clock } from "lucide-react";

interface SessionTypeSelectorProps {
  sessionType: SessionType;
  sessionTiming: SessionTiming;
  onSessionTypeChange: (type: SessionType) => void;
  onSessionTimingChange: (timing: SessionTiming) => void;
  compact?: boolean;
}

const SESSION_TYPE_ICONS: Record<SessionType, React.ReactNode> = {
  strength: <Dumbbell className="h-4 w-4" />,
  cardio: <Heart className="h-4 w-4" />,
  hiit: <Zap className="h-4 w-4" />,
  mobility: <StretchHorizontal className="h-4 w-4" />,
  recovery: <Bed className="h-4 w-4" />,
  sport_specific: <Target className="h-4 w-4" />,
  other: <MoreHorizontal className="h-4 w-4" />,
};

const SESSION_TIMING_ICONS: Record<SessionTiming, React.ReactNode> = {
  morning: <Sun className="h-4 w-4" />,
  afternoon: <Sun className="h-4 w-4 text-orange-500" />,
  evening: <Moon className="h-4 w-4" />,
  anytime: <Clock className="h-4 w-4" />,
};

export function SessionTypeSelector({
  sessionType,
  sessionTiming,
  onSessionTypeChange,
  onSessionTimingChange,
  compact = false,
}: SessionTypeSelectorProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Select value={sessionType} onValueChange={(v) => onSessionTypeChange(v as SessionType)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SESSION_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                <div className="flex items-center gap-2">
                  {SESSION_TYPE_ICONS[type.value]}
                  <span>{type.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sessionTiming} onValueChange={(v) => onSessionTimingChange(v as SessionTiming)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SESSION_TIMINGS.map((timing) => (
              <SelectItem key={timing.value} value={timing.value}>
                <div className="flex items-center gap-2">
                  {SESSION_TIMING_ICONS[timing.value]}
                  <span>{timing.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Session Type */}
      <div className="space-y-2">
        <Label>Session Type</Label>
        <RadioGroup
          value={sessionType}
          onValueChange={(v) => onSessionTypeChange(v as SessionType)}
          className="grid grid-cols-2 gap-2"
        >
          {SESSION_TYPES.map((type) => (
            <div key={type.value} className="flex items-center">
              <RadioGroupItem value={type.value} id={`type-${type.value}`} className="peer sr-only" />
              <Label
                htmlFor={`type-${type.value}`}
                className="flex items-center gap-2 w-full p-3 border rounded-lg cursor-pointer transition-all
                  peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5
                  hover:bg-muted/50"
              >
                <div className={`p-1.5 rounded ${type.color} text-white`}>
                  {SESSION_TYPE_ICONS[type.value]}
                </div>
                <span className="text-sm font-medium">{type.label}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* Session Timing */}
      <div className="space-y-2">
        <Label>Preferred Time</Label>
        <RadioGroup
          value={sessionTiming}
          onValueChange={(v) => onSessionTimingChange(v as SessionTiming)}
          className="grid grid-cols-4 gap-2"
        >
          {SESSION_TIMINGS.map((timing) => (
            <div key={timing.value} className="flex items-center">
              <RadioGroupItem value={timing.value} id={`timing-${timing.value}`} className="peer sr-only" />
              <Label
                htmlFor={`timing-${timing.value}`}
                className="flex flex-col items-center gap-1 w-full p-3 border rounded-lg cursor-pointer transition-all
                  peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5
                  hover:bg-muted/50"
              >
                {SESSION_TIMING_ICONS[timing.value]}
                <span className="text-xs font-medium">{timing.label}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}

export default SessionTypeSelector;
