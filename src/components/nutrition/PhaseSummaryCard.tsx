import { forwardRef } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatWeightChange, type WeightChangeShape } from "@/lib/weightChangeFormat";
import { MacroDistributionRibbon } from "./MacroDistributionRibbon";

/**
 * PhaseSummaryCard (NU6) — the branded, shareable artifact for a completed phase.
 *
 * This is the node that gets rasterised to a PNG, so it must be self-contained:
 * every value is passed in, nothing is fetched, and it renders identically on screen
 * and in the exported image.
 *
 * ── HONESTY CONTRACT (same one enforced in PUB6 / CL5 / CO4) ────────────────
 * The hero result is `text-foreground` — NEVER crimson, green or red. Colouring a
 * weight change as "success" would imply down is universally good, which is false
 * under a muscle-gain phase. The direction glyph states the sign and nothing more,
 * and the PHASE NAME rides directly beneath the number so the result reads against
 * the client's OWN goal ("-4.2 kg · Summer Cut"), not an assumed one.
 *
 * Real data only. `delta` comes from the phase summary and is formatted through the
 * shared `formatWeightChange` — never recomputed, never estimated. A phase with no
 * usable numbers renders NOTHING (the caller guards), not a zeroed card.
 *
 * Grounded in Beli's recap card / Spotify Wrapped: one big neutral hero number, the
 * brand mark, and nothing else competing with it. Flat, bg-card, 12px radius, no
 * gradient.
 */
export interface PhaseSummaryCardData {
  phaseName: string;
  /** Signed kg change for the phase. Negative = lost, positive = gained. */
  deltaKg: number;
  weeks: number;
  /** Average daily macros across the phase (grams). */
  protein: number;
  fat: number;
  carbs: number;
  /** Omitted when unknown — the card simply drops the line (null-omit). */
  firstName?: string | null;
}

interface PhaseSummaryCardProps {
  data: PhaseSummaryCardData;
  className?: string;
}

export const PhaseSummaryCard = forwardRef<HTMLDivElement, PhaseSummaryCardProps>(
  function PhaseSummaryCard({ data, className }, ref) {
    const { phaseName, deltaKg, weeks, protein, fat, carbs, firstName } = data;

    const Icon = deltaKg < 0 ? TrendingDown : TrendingUp;
    const proof: WeightChangeShape = { phase_name: phaseName, delta_kg: deltaKg, weeks };

    return (
      <div
        ref={ref}
        // Flat, 12px radius, no gradient. bg-card so the PNG has an opaque backdrop
        // rather than rasterising onto transparency.
        className={cn(
          "flex w-full max-w-sm flex-col gap-5 rounded-lg border border-border bg-card p-6",
          className,
        )}
      >
        {/* Brand mark — every share is a branded impression. */}
        <div className="flex items-center justify-between">
          <span className="font-display text-xl tracking-[0.2em] text-foreground">IGU</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Phase complete
          </span>
        </div>

        {/* HERO — the result. Neutral, never a scorecard. */}
        <div title={formatWeightChange(proof)}>
          <div className="flex items-baseline gap-2 text-foreground">
            <Icon className="h-6 w-6 shrink-0 self-center text-muted-foreground" aria-hidden />
            <span className="font-display text-6xl leading-none tracking-wide">
              {Math.abs(deltaKg).toFixed(1)}
            </span>
            <span className="text-lg font-medium text-muted-foreground">kg</span>
          </div>

          {/* Phase-framed, so the number reads against the client's own goal. */}
          <p className="mt-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {weeks} {weeks === 1 ? "week" : "weeks"} · {phaseName}
          </p>
        </div>

        {/* Macro split across the phase. */}
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Average macros
          </p>
          <MacroDistributionRibbon
            protein={Math.round(protein)}
            fat={Math.round(fat)}
            carbs={Math.round(carbs)}
          />
        </div>

        {/* Attribution — null-omits when the name isn't known. */}
        {firstName && (
          <p className="border-t border-border pt-3 text-sm text-muted-foreground">{firstName}</p>
        )}
      </div>
    );
  },
);
