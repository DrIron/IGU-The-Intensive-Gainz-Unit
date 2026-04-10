import React, { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, X, GripVertical } from 'lucide-react';

interface BulletPointEditorProps {
  label: string;
  points: string[];
  onChange: (points: string[]) => void;
  placeholder?: string;
  maxPoints?: number;
}

export default function BulletPointEditor({
  label,
  points,
  onChange,
  placeholder = 'Enter instruction...',
  maxPoints = 20,
}: BulletPointEditorProps) {
  const addPoint = useCallback(() => {
    if (points.length >= maxPoints) return;
    onChange([...points, '']);
  }, [points, onChange, maxPoints]);

  const updatePoint = useCallback(
    (index: number, value: string) => {
      const updated = [...points];
      updated[index] = value;
      onChange(updated);
    },
    [points, onChange]
  );

  const removePoint = useCallback(
    (index: number) => {
      onChange(points.filter((_, i) => i !== index));
    },
    [points, onChange]
  );

  const handleBlur = useCallback(
    (index: number) => {
      // Remove empty points on blur (except if it's the only one being edited)
      if (points[index]?.trim() === '' && points.length > 1) {
        onChange(points.filter((_, i) => i !== index));
      }
    },
    [points, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Add new point after current
        const updated = [...points];
        updated.splice(index + 1, 0, '');
        onChange(updated);
        // Focus will naturally go to next input on re-render
        setTimeout(() => {
          const inputs = document.querySelectorAll(`[data-bullet-index="${index + 1}"]`);
          (inputs[0] as HTMLInputElement)?.focus();
        }, 50);
      }
      if (e.key === 'Backspace' && points[index] === '' && points.length > 1) {
        e.preventDefault();
        removePoint(index);
      }
    },
    [points, onChange, removePoint]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addPoint}
          disabled={points.length >= maxPoints}
          className="h-7 text-xs gap-1"
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>

      {points.length === 0 ? (
        <button
          type="button"
          onClick={addPoint}
          className="w-full border border-dashed border-border rounded-md py-3 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
        >
          + Add first instruction point
        </button>
      ) : (
        <div className="space-y-1.5">
          {points.map((point, index) => (
            <div key={index} className="flex items-center gap-1.5 group">
              <span className="text-muted-foreground text-xs w-4 shrink-0 text-center select-none">
                {index + 1}.
              </span>
              <Input
                data-bullet-index={index}
                value={point}
                onChange={(e) => updatePoint(index, e.target.value)}
                onBlur={() => handleBlur(index)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                placeholder={placeholder}
                className="h-8 text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removePoint(index)}
                className="h-8 w-8 p-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {points.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Press Enter to add a new point. Backspace on empty to remove.
        </p>
      )}
    </div>
  );
}
