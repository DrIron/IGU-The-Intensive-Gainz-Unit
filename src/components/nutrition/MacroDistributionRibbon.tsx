import { cn } from "@/lib/utils";

/**
 * Thin stacked-bar ribbon showing the protein / fat / carb energy split
 * as a single horizontal strip. Mirrors the muscle-distribution ribbon
 * pattern from Planning Board's DayColumn -- monospace labels underneath,
 * colored bands whose width is the % of total calories from each macro.
 *
 * The ribbon re-normalizes on its own: it doesn't trust that the grams
 * provided will sum to `targetCalories`, which keeps it stable while the
 * coach is still typing and the numbers are mid-recalc.
 */
interface MacroDistributionRibbonProps {
  protein: number; // grams
  fat: number; // grams
  carbs: number; // grams
  variant?: "full" | "thin";
  /** When true, show the P/F/C gram labels below the ribbon. */
  showLabels?: boolean;
  className?: string;
}

const COLOR_PROTEIN = "hsl(0 72% 51%)"; // red
const COLOR_FAT = "hsl(38 92% 50%)"; // amber
const COLOR_CARBS = "hsl(217 91% 60%)"; // blue

export function MacroDistributionRibbon({
  protein,
  fat,
  carbs,
  variant = "full",
  showLabels = true,
  className,
}: MacroDistributionRibbonProps) {
  const proteinCal = Math.max(0, protein) * 4;
  const fatCal = Math.max(0, fat) * 9;
  const carbCal = Math.max(0, carbs) * 4;
  const total = proteinCal + fatCal + carbCal;

  // If there's no data yet, render a flat neutral bar so the layout doesn't jump.
  if (total <= 0) {
    return (
      <div className={cn("w-full space-y-1", className)} aria-hidden>
        <div className={cn(variant === "thin" ? "h-1" : "h-2", "w-full rounded-full bg-muted")} />
      </div>
    );
  }

  const pPct = (proteinCal / total) * 100;
  const fPct = (fatCal / total) * 100;
  const cPct = (carbCal / total) * 100;

  return (
    <div className={cn("w-full space-y-1.5", className)}>
      <div
        className={cn(variant === "thin" ? "h-1" : "h-2", "w-full overflow-hidden rounded-full bg-muted flex")}
        role="img"
        aria-label={`Macro split: ${Math.round(pPct)}% protein, ${Math.round(fPct)}% fat, ${Math.round(cPct)}% carbs`}
      >
        <div style={{ width: `${pPct}%`, backgroundColor: COLOR_PROTEIN }} />
        <div style={{ width: `${fPct}%`, backgroundColor: COLOR_FAT }} />
        <div style={{ width: `${cPct}%`, backgroundColor: COLOR_CARBS }} />
      </div>
      {showLabels && (
        <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground tabular-nums">
          <span style={{ color: COLOR_PROTEIN }}>P {Math.round(protein)}g</span>
          <span style={{ color: COLOR_FAT }}>F {Math.round(fat)}g</span>
          <span style={{ color: COLOR_CARBS }}>C {Math.round(carbs)}g</span>
        </div>
      )}
    </div>
  );
}
