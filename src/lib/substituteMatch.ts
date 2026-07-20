import { equipmentLabel } from "@/lib/equipmentLabels";

/**
 * Shared model + pure helpers for the weighted get_substitute_exercises RPC (Fix 3).
 *
 * The RPC returns each substitute already sorted by score desc, tiered best/strong/partial, with a
 * `matched_dimensions` list explaining WHY it matched. During this transition release it also keeps
 * the legacy `match` ("exact"|"close") flag, which we use only as the `match_tier` fallback.
 */

export type MatchTier = "best" | "strong" | "partial";

export interface SubstituteExercise {
  id: string;
  name: string;
  equipment: string | null;
  primary_muscle: string | null;
  resistance_profiles: string[] | null;
  cardio_movement_id: string | null;
  technique_id: string | null;
  target_region_id: string | null;
  // Weighted RPC additions (optional for safety against older cached responses).
  muscle_id?: string | null;
  subdivision_id?: string | null;
  movement_pattern_id?: string | null;
  match_score?: number;
  match_tier?: MatchTier;
  matched_dimensions?: string[];
  /** Legacy tier flag — retained one release as the `match_tier` fallback. */
  match: "exact" | "close";
}

export interface SubstituteResult {
  source: { id: string; name: string; category: string };
  substitutes: SubstituteExercise[];
}

/** A row's tier: prefer the weighted `match_tier`; fall back to legacy `match` (exact→best, close→partial). */
export function tierOf(sub: Pick<SubstituteExercise, "match_tier" | "match">): MatchTier {
  if (sub.match_tier === "best" || sub.match_tier === "strong" || sub.match_tier === "partial") {
    return sub.match_tier;
  }
  return sub.match === "exact" ? "best" : "partial";
}

/** Bucket substitutes into best/strong/partial, PRESERVING the RPC's score-desc order within each. */
export function bucketByTier<T extends Pick<SubstituteExercise, "match_tier" | "match">>(
  subs: T[],
): Record<MatchTier, T[]> {
  const out: Record<MatchTier, T[]> = { best: [], strong: [], partial: [] };
  for (const s of subs) out[tierOf(s)].push(s);
  return out;
}

export const TIER_ORDER: MatchTier[] = ["best", "strong", "partial"];

export const TIER_META: Record<MatchTier, { label: string; section: string; badgeClass: string }> = {
  best:    { label: "Best",   section: "Best match",   badgeClass: "border-status-ontrack/30 bg-status-ontrack/15 text-status-ontrack" },
  strong:  { label: "Strong", section: "Strong match", badgeClass: "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  partial: { label: "More",   section: "More options", badgeClass: "border-border bg-muted text-muted-foreground" },
};

/**
 * `matched_dimensions` → human "why it matches" chip copy. `subdivision` uses the resolved display
 * name (fallback "Same subdivision"); `equipment` uses `equipmentLabel`. Blank/unknown dims are
 * dropped so no empty chip renders.
 */
export function matchDimensionChips(
  dimensions: string[] | undefined | null,
  ctx: { equipment?: string | null; subdivisionName?: string | null },
): string[] {
  const out: string[] = [];
  for (const d of dimensions ?? []) {
    switch (d) {
      case "subdivision": out.push(ctx.subdivisionName?.trim() || "Same subdivision"); break;
      case "movement_pattern": out.push("Same movement"); break;
      case "resistance": out.push("Same resistance"); break;
      case "equipment": {
        const label = equipmentLabel(ctx.equipment);
        if (label) out.push(label);
        break;
      }
      case "laterality": out.push("Same side pattern"); break;
      case "cardio_movement": out.push("Same movement"); break;
      case "technique": out.push("Same technique"); break;
      case "target_region": out.push("Same region"); break;
      default: break;
    }
  }
  return out;
}

/** Cap visible chips at `max`, returning the overflow count for a "+N" pill. */
export function capChips(chips: string[], max = 4): { visible: string[]; overflow: number } {
  if (chips.length <= max) return { visible: chips, overflow: 0 };
  return { visible: chips.slice(0, max), overflow: chips.length - max };
}
