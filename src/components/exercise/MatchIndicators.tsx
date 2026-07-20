import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TIER_META, matchDimensionChips, capChips, type MatchTier } from "@/lib/substituteMatch";

/**
 * Shared match-quality UI for the weighted substitute RPC (Fix 3): a tier badge (Best/Strong/More)
 * and the "why it matches" chip row. Used by SwapExerciseDialog and the ExercisePickerDialog shelf.
 */

export function MatchTierBadge({ tier, className }: { tier: MatchTier; className?: string }) {
  const meta = TIER_META[tier];
  return (
    <Badge variant="outline" className={cn("shrink-0 text-[10px]", meta.badgeClass, className)}>
      {meta.label}
    </Badge>
  );
}

const chipClass = "rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground";

export function MatchChips({
  dimensions,
  equipment,
  subdivisionName,
  max = 4,
}: {
  dimensions: string[] | undefined | null;
  equipment?: string | null;
  subdivisionName?: string | null;
  /** Max visible chips before collapsing the rest into a "+N" pill. */
  max?: number;
}) {
  const chips = matchDimensionChips(dimensions, { equipment, subdivisionName });
  if (chips.length === 0) return null;
  const { visible, overflow } = capChips(chips, max);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((c, i) => (
        <span key={`${c}-${i}`} className={chipClass}>
          {c}
        </span>
      ))}
      {overflow > 0 && <span className={chipClass}>+{overflow}</span>}
    </div>
  );
}
