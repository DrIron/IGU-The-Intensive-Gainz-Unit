/**
 * WeightUnitToggle — segmented kg | lb control (WK7 §4). Display/entry unit only;
 * weights persist canonically in kg. Bound to useWeightUnit(). Optimistic via the
 * hook; a failed upsert reverts + toasts.
 */
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import type { WeightUnit } from "@/utils/weightUnits";

const UNITS: WeightUnit[] = ["kg", "lb"];

export function WeightUnitToggle({
  unit,
  onChange,
  className,
}: {
  unit: WeightUnit;
  onChange: (next: WeightUnit) => Promise<void>;
  className?: string;
}) {
  const handle = async (next: WeightUnit) => {
    if (next === unit) return;
    try {
      await onChange(next);
    } catch (error) {
      toast.error("Couldn't save unit", { description: sanitizeErrorForUser(error) });
    }
  };

  return (
    <div
      className={cn("inline-flex items-center rounded-md border bg-muted/40 p-0.5", className)}
      role="group"
      aria-label="Weight unit"
    >
      {UNITS.map((u) => (
        <button
          key={u}
          type="button"
          onClick={() => handle(u)}
          aria-pressed={unit === u}
          className={cn(
            "px-2.5 py-1 text-xs font-semibold rounded uppercase transition-colors touch-manipulation",
            unit === u ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {u}
        </button>
      ))}
    </div>
  );
}
