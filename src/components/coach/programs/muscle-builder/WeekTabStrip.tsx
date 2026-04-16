import { memo, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreVertical, Copy, Trash2, Tag, Zap } from "lucide-react";
import type { WeekData } from "@/types/muscle-builder";
import { cn } from "@/lib/utils";

interface WeekTabStripProps {
  weeks: WeekData[];
  currentWeekIndex: number;
  onSelectWeek: (weekIndex: number) => void;
  onAddWeek: () => void;
  onRemoveWeek: (weekIndex: number) => void;
  onDuplicateWeek: (weekIndex: number) => void;
  onSetWeekLabel: (weekIndex: number, label: string) => void;
  onToggleDeload: (weekIndex: number) => void;
}

export const WeekTabStrip = memo(function WeekTabStrip({
  weeks,
  currentWeekIndex,
  onSelectWeek,
  onAddWeek,
  onRemoveWeek,
  onDuplicateWeek,
  onSetWeekLabel,
  onToggleDeload,
}: WeekTabStripProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleStartRename = useCallback((weekIndex: number, currentLabel: string) => {
    setEditingIndex(weekIndex);
    setEditValue(currentLabel || "");
  }, []);

  const handleFinishRename = useCallback(() => {
    if (editingIndex != null) {
      onSetWeekLabel(editingIndex, editValue.trim());
      setEditingIndex(null);
    }
  }, [editingIndex, editValue, onSetWeekLabel]);

  if (weeks.length <= 1) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Week 1</span>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onAddWeek}>
          <Plus className="h-3 w-3 mr-1" />
          Add Week
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
      {weeks.map((week, i) => {
        const isActive = i === currentWeekIndex;
        const label = week.label || `W${i + 1}`;
        const isEditing = editingIndex === i;

        return (
          <div key={i} className="flex items-center shrink-0">
            <button
              onClick={() => onSelectWeek(i)}
              className={cn(
                "relative flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
                isActive
                  ? "bg-primary/10 text-primary font-medium border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                week.isDeload && "border-amber-500/40 bg-amber-500/5"
              )}
            >
              {isEditing ? (
                <Input
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={handleFinishRename}
                  onKeyDown={e => { if (e.key === 'Enter') handleFinishRename(); }}
                  className="h-5 w-16 text-xs p-0 border-none bg-transparent focus-visible:ring-0"
                  autoFocus
                />
              ) : (
                <span>{label}</span>
              )}
              {week.isDeload && (
                <span className="text-[10px] text-amber-500 font-medium">DL</span>
              )}
            </button>

            {isActive && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 ml-0.5 shrink-0">
                    <MoreVertical className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  <DropdownMenuItem onClick={() => onDuplicateWeek(i)}>
                    <Copy className="h-3.5 w-3.5 mr-2" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleStartRename(i, week.label || "")}>
                    <Tag className="h-3.5 w-3.5 mr-2" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onToggleDeload(i)}>
                    <Zap className="h-3.5 w-3.5 mr-2" />
                    {week.isDeload ? "Unmark Deload" : "Mark as Deload"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onRemoveWeek(i)}
                    disabled={weeks.length <= 1}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Remove Week
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        );
      })}

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={onAddWeek}
        title="Add week (clone last)"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
});
