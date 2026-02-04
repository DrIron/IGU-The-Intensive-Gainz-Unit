import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSpecializationTags } from "@/hooks/useSpecializationTags";

interface SpecializationTagPickerProps {
  selectedTags: string[];  // Array of tag values (e.g., ["strength_training", "bodybuilding"])
  onToggle: (tagValue: string) => void;
  maxTags?: number;
  disabled?: boolean;
}

/**
 * Reusable multi-select component for coach specialization tags.
 * Fetches active tags from the database and displays them as selectable pills.
 * Stores tag values (snake_case) but displays labels (Title Case).
 */
export function SpecializationTagPicker({
  selectedTags,
  onToggle,
  maxTags = 15,
  disabled = false,
}: SpecializationTagPickerProps) {
  const { tags, loading, error } = useSpecializationTags();

  const isAtMaxSelections = selectedTags.length >= maxTags;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading specializations...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-4 text-sm text-destructive">
        Failed to load specializations.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => {
          const isSelected = selectedTags.includes(tag.value);
          const isDisabledTag = disabled || (isAtMaxSelections && !isSelected);

          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => !isDisabledTag && onToggle(tag.value)}
              disabled={isDisabledTag}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                isSelected
                  ? "bg-primary text-primary-foreground border-primary"
                  : isDisabledTag
                  ? "bg-muted/50 text-muted-foreground/50 border-border cursor-not-allowed"
                  : "bg-background text-foreground border-border hover:border-primary/50 cursor-pointer"
              )}
            >
              {isSelected && <span>✓</span>}
              {tag.label}
            </button>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">
        {selectedTags.length}/{maxTags} selected
      </p>
    </div>
  );
}
