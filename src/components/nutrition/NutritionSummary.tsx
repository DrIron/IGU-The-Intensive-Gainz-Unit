import { cn } from "@/lib/utils";
import { MacroDonut } from "./MacroDonut";

/**
 * NutritionSummary — THE canonical calories + macros display (FOOD_LOGGING_PLAN Part IV).
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * Every surface that shows calories + a macro breakdown renders THIS. A day total, a
 * meal roll-up, a single food, a recipe per-serving, the coach's intake hero — same
 * object, different size. That sameness is the coherence lever: MyFitnessPal and
 * Cronometer feel unified precisely because their day total and their food item render
 * identically. Never introduce a bespoke calorie/macro visual next to this one.
 *
 * IGU today is NOT unified — the phase card uses number + ribbon, the targets card uses
 * number + ribbon + a 3-col grid, NU7 uses a donut. This is the primitive they collapse
 * into. (P1 introduces it and uses it in the food log; refactoring NutritionPhaseCard /
 * NutritionTargetsCard onto it is deliberately NOT in P1's scope — see the PR.)
 *
 * ── Why a donut and not a progress ring ─────────────────────────────────────
 * The arcs are a SPLIT (protein·4 : fat·9 : carb·4 — calorie contribution), not a fill
 * gauge. IGU has no consumer-style "kcal left" ring anywhere, and the v1 mockups that
 * used one were rebuilt. Calories are a big crimson `font-display` numeral — here,
 * centred inside the ring, so one object answers both "how many calories" and "what's
 * the split". Progress toward the target is the thin linear bar beneath, nothing else.
 *
 * ── Honesty ─────────────────────────────────────────────────────────────────
 * Over-target is stated, never scolded. There is no red "you went over" — a client in a
 * muscle-gain phase who exceeds their calories is doing the thing they were asked to do.
 * The numbers carry the information; the colour carries no verdict. (Same rule NU6 /
 * PUB6 / CL5 / CO4 enforce.)
 */

export interface NutritionTotals {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

interface NutritionSummaryProps {
  /** What was actually consumed / what this food contributes. */
  totals: NutritionTotals;
  /**
   * The coach's target for the day. Omit for a surface with no target (a single food, a
   * recipe per-serving) — the component then drops the "of N", the "/ N g" and the bar.
   * Same component, fewer props. There is no second way to render this.
   */
  target?: NutritionTotals | null;
  /**
   * Overrides the sub-label under the centred calorie number. Defaults to `kcal`.
   *
   * The coach nutrition cards render a PLAN TARGET, not consumed-vs-target — so they pass
   * `totals` with no `target` and set this to "kcal · daily target". Without it the donut
   * centre would read a bare "kcal", which on a targets card is ambiguous: is that what the
   * client ate, or what they're aiming for? Ignored when a `target` is supplied, because
   * then the centre already reads "N of M" and there is nothing left to disambiguate.
   */
  centerLabel?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: { donut: 96, stroke: 10, kcal: "text-xl", unit: "text-[10px]", sub: "text-[10px]", legend: "text-xs", gap: "gap-3" },
  md: { donut: 132, stroke: 13, kcal: "text-3xl", unit: "text-[11px]", sub: "text-xs", legend: "text-sm", gap: "gap-4" },
  lg: { donut: 168, stroke: 16, kcal: "text-4xl", unit: "text-xs", sub: "text-sm", legend: "text-sm", gap: "gap-6" },
} as const;

const MACRO_ROWS = [
  { key: "protein", label: "Protein", token: "var(--macro-protein)" },
  { key: "fat", label: "Fat", token: "var(--macro-fat)" },
  { key: "carbs", label: "Carbs", token: "var(--macro-carb)" },
] as const;

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export function NutritionSummary({
  totals,
  target,
  centerLabel,
  size = "md",
  className,
}: NutritionSummaryProps) {
  const s = SIZES[size];
  const hasTarget = target != null && target.kcal > 0;

  // The donut is split by CALORIE CONTRIBUTION, so its percentages come from the macros —
  // not from `kcal`, which is the food's own stated energy and may differ slightly (fibre,
  // alcohol, rounding). Showing the real kcal while splitting by 4/9/4 is deliberate.
  const macroCals = {
    protein: Math.max(0, totals.protein) * 4,
    fat: Math.max(0, totals.fat) * 9,
    carbs: Math.max(0, totals.carbs) * 4,
  };
  const macroTotal = macroCals.protein + macroCals.fat + macroCals.carbs;

  const pctOfTarget = hasTarget ? (totals.kcal / target!.kcal) * 100 : 0;
  const remaining = hasTarget ? target!.kcal - totals.kcal : 0;

  return (
    <div className={cn("w-full", className)}>
      <div className={cn("flex items-center", s.gap)}>
        <MacroDonut
          protein={totals.protein}
          fat={totals.fat}
          carbs={totals.carbs}
          size={s.donut}
          strokeWidth={s.stroke}
          showLegend={false}
          center={
            <>
              <span className={cn("font-display leading-none text-primary", s.kcal)}>
                {fmt(totals.kcal)}
              </span>
              {hasTarget ? (
                <span className={cn("mt-1 text-muted-foreground", s.unit)}>of {fmt(target!.kcal)}</span>
              ) : (
                /* A custom label ("kcal · daily target") is far wider than the ring's inner
                   space, so it must wrap inside the donut rather than spill over the arcs. */
                <span
                  className={cn(
                    "mt-1 max-w-[76%] text-balance leading-tight text-muted-foreground",
                    s.unit,
                  )}
                >
                  {centerLabel ?? "kcal"}
                </span>
              )}
            </>
          }
        />

        {/* Legend — one row per macro, name left, grams + % in their OWN aligned columns.
            The cramped "124g · 41%" of the old donut is fixed by giving each value a column.

            Capped width: on a wide card an uncapped flex-1 pushes the macro NAME to the far
            left and its NUMBER to the far right, and the pair stops reading as one row. The
            donut and its legend have to look like a single object at any card width. */}
        <ul className={cn("min-w-0 flex-1 space-y-2", size === "lg" ? "max-w-sm" : "max-w-xs", s.legend)}>
          {MACRO_ROWS.map((m) => {
            const grams = Math.max(0, totals[m.key]);
            const pct = macroTotal > 0 ? Math.round((macroCals[m.key] / macroTotal) * 100) : 0;
            return (
              <li key={m.key} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: `hsl(${m.token})` }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate font-medium">{m.label}</span>
                <span className="shrink-0 font-mono tabular-nums" data-macro-grams={m.key}>
                  {fmt(grams)}
                  {hasTarget && (
                    <span className="text-muted-foreground"> / {fmt(target![m.key])}</span>
                  )}
                  <span className="text-muted-foreground"> g</span>
                </span>
                <span className="w-10 shrink-0 text-right font-mono tabular-nums text-muted-foreground">
                  {pct}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* A single thin bar. Only when there is a target to progress toward. */}
      {hasTarget && (
        <div className="mt-4">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={Math.round(pctOfTarget)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Calories consumed against target"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${Math.min(100, Math.max(0, pctOfTarget))}%` }}
            />
          </div>
          {/* Stated, not judged. No red for "over". */}
          <p className={cn("mt-1.5 text-muted-foreground", s.sub)} data-remaining>
            {remaining >= 0
              ? `${fmt(remaining)} kcal left`
              : `${fmt(Math.abs(remaining))} kcal over`}
          </p>
        </div>
      )}
    </div>
  );
}
