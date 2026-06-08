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
import { Plus, MoreVertical, Copy, Trash2, Tag, Zap, ChevronDown, Wand2, FileX } from "lucide-react";
import type { WeekData } from "@/types/muscle-builder";
import { cn } from "@/lib/utils";

interface WeekTabStripProps {
  weeks: WeekData[];
  currentWeekIndex: number;
  onSelectWeek: (weekIndex: number) => void;
  onAddWeek: () => void;
  onAddWeekWithRules?: () => void;
  onAddWeekBlank?: () => void;
  /** When true, the Add Week split button defaults to "apply rules" instead of "clone verbatim". */
  hasAnyDeltaRules?: boolean;
  onRemoveWeek: (weekIndex: number) => void;
  onDuplicateWeek: (weekIndex: number) => void;
  onSetWeekLabel: (weekIndex: number, label: string) => void;
  onToggleDeload: (weekIndex: number) => void;
  /** Phase 5 — opens the deload customisation dialog (clone/fresh + preset). */
  onOpenDeloadDialog?: (weekIndex: number) => void;
}

export const WeekTabStrip = memo(function WeekTabStrip({
  weeks,
  currentWeekIndex,
  onSelectWeek,
  onAddWeek,
  onAddWeekWithRules,
  onAddWeekBlank,
  hasAnyDeltaRules,
  onRemoveWeek,
  onDuplicateWeek,
  onSetWeekLabel,
  onToggleDeload,
  onOpenDeloadDialog,
}: WeekTabStripProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  // When rules exist on W1, default click goes to "apply rules"; otherwise to
  // verbatim clone (matches today's muscle memory). Coach can always pick
  // either of the other two modes from the caret dropdown.
  const defaultAddWeek = hasAnyDeltaRules && onAddWeekWithRules ? onAddWeekWithRules : onAddWeek;
  const defaultLabel = hasAnyDeltaRules && onAddWeekWithRules
    ? "Add week (apply rules)"
    : "Add week (clone last)";
  const showSplit = !!(onAddWeekWithRules || onAddWeekBlank);

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
    // Single-week state: the dropdown trio doesn't pay for itself because no
    // rules can have been authored yet (rules are W1-scoped, but their value
    // only shows once there's a W2 to apply to). Keep the simple button.
    // Fresh blank is still useful (e.g. coach wants W1 = strength, W2 =
    // mobility from scratch), so surface it via a small split caret.
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Week 1</span>
        <div className="inline-flex items-center">
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-7 text-xs", showSplit && "rounded-r-none pr-1.5")}
            onClick={onAddWeek}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Week
          </Button>
          {showSplit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-1 rounded-l-none border-l border-border/40"
                  aria-label="More Add Week options"
                >
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={onAddWeek}>
                  <Copy className="h-3.5 w-3.5 mr-2" />
                  Clone last week
                </DropdownMenuItem>
                {onAddWeekBlank && (
                  <DropdownMenuItem onClick={onAddWeekBlank}>
                    <FileX className="h-3.5 w-3.5 mr-2" />
                    Fresh blank week
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
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
                  <DropdownMenuItem
                    onClick={() => {
                      // Phase 5 — marking opens the dialog (clone/fresh + preset).
                      // Unmarking just flips the flag back off.
                      if (week.isDeload || !onOpenDeloadDialog) {
                        onToggleDeload(i);
                      } else {
                        onOpenDeloadDialog(i);
                      }
                    }}
                  >
                    <Zap className="h-3.5 w-3.5 mr-2" />
                    {week.isDeload ? "Unmark Deload" : "Mark as Deload..."}
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

      {/* Add Week — single button OR split button with 3 modes once any rules / blank are wired. */}
      {showSplit ? (
        <div className="inline-flex items-center shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-r-none"
            onClick={defaultAddWeek}
            title={defaultLabel}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-4 rounded-l-none border-l border-border/40 px-0"
                aria-label="More Add Week options"
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {onAddWeekWithRules && (
                <DropdownMenuItem onClick={onAddWeekWithRules} disabled={!hasAnyDeltaRules}>
                  <Wand2 className="h-3.5 w-3.5 mr-2" />
                  <span className="flex-1">Same workouts + apply rules</span>
                  {hasAnyDeltaRules && (
                    <span className="text-[10px] text-muted-foreground ml-2">default</span>
                  )}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onAddWeek}>
                <Copy className="h-3.5 w-3.5 mr-2" />
                <span className="flex-1">Clone last week</span>
                {!hasAnyDeltaRules && (
                  <span className="text-[10px] text-muted-foreground ml-2">default</span>
                )}
              </DropdownMenuItem>
              {onAddWeekBlank && (
                <DropdownMenuItem onClick={onAddWeekBlank}>
                  <FileX className="h-3.5 w-3.5 mr-2" />
                  <span className="flex-1">Fresh blank week</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onAddWeek}
          title="Add week (clone last)"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
});
