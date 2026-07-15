/**
 * Food-log adherence — the calorie-deviation signal (P5a).
 *
 * PURE. No fetching, no React. Mirrors src/lib/foodLog.ts so the coach card is a thin shell
 * over tested arithmetic (FOOD_LOGGING_PLAN §4.6, decisions D7/D8).
 *
 * ── The model ────────────────────────────────────────────────────────────────
 * A day's band is how far consumed calories sat from the target:
 *   within ±10%  → adherent      within ±20% → slightly_off      beyond ±20% → off_track
 *
 * ── Two departures from the plan's literal table, decided 2026-07-15 ──────────
 * These are the honesty guardrails, and they are the whole point of this module:
 *
 *   1. AN UNLOGGED DAY IS `not_logged`, NEVER off_track/red. Not logging is not a nutritional
 *      failure — it is an absence of data. It must never colour red and must never drag the
 *      headline down. A tool that turns "you didn't log" into "you failed" trains people to
 *      stop logging.
 *
 *   2. TWO SEPARATE NUMBERS, NEVER CONFLATED. The headline % answers "when you logged, how
 *      on-target were you" — computed over LOGGED days only. A distinct "X/7 days logged"
 *      stat answers "how often did you log". Averaging an unlogged day in as a zero would
 *      punish consistency and quality with one shaming number; we refuse to.
 */

export type AdherenceBand = "adherent" | "slightly_off" | "off_track" | "not_logged";

/** A day is measurable only with BOTH a logged intake and a real positive target. */
function isMeasurable(consumedKcal: number | null, targetKcal: number | null): boolean {
  return (
    consumedKcal != null &&
    Number.isFinite(consumedKcal) &&
    targetKcal != null &&
    Number.isFinite(targetKcal) &&
    targetKcal > 0
  );
}

/**
 * One day's calorie band.
 *   consumed == null                 → not_logged (no data — NOT a failure)
 *   target == null || target <= 0    → not_logged (nothing to measure against)
 *   |consumed − target| / target     → ≤0.10 adherent · ≤0.20 slightly_off · else off_track
 */
export function dayCalorieBand(consumedKcal: number | null, targetKcal: number | null): AdherenceBand {
  if (consumedKcal == null || !Number.isFinite(consumedKcal)) return "not_logged";
  if (!isMeasurable(consumedKcal, targetKcal)) return "not_logged";
  const dev = Math.abs(consumedKcal - (targetKcal as number)) / (targetKcal as number);
  if (dev <= 0.1) return "adherent";
  if (dev <= 0.2) return "slightly_off";
  return "off_track";
}

export interface DayInput {
  consumedKcal: number | null;
  targetKcal: number | null;
}

export interface RollingAdherence {
  /** How on-target the LOGGED days were, on aggregate. not_logged when nothing was logged. */
  headlineBand: AdherenceBand;
  /** Signed % the logged-day average sat from target (negative = under). null if unmeasurable. */
  avgDeviationPct: number | null;
  /** Share of logged days that landed individually in the adherent band. null if none logged. */
  adherentPct: number | null;
  /** How many of the window's days were logged at all (the consistency stat). */
  loggedDays: number;
  totalDays: number;
  /** Per-day band, oldest→newest as passed, for the dot strip. */
  perDay: AdherenceBand[];
}

/**
 * Roll a window of days into a headline.
 *
 * The headline is computed over LOGGED days only (an unlogged day contributes NOTHING — it is
 * not a zero, it is an absence). loggedDays carries consistency separately. This split is the
 * §4.6 D7 decision and the reason `not_logged` exists as its own band.
 */
export function rollingAdherence(days: DayInput[]): RollingAdherence {
  const perDay = days.map((d) => dayCalorieBand(d.consumedKcal, d.targetKcal));
  const totalDays = days.length;

  const loggedDays = days.filter(
    (d) => d.consumedKcal != null && Number.isFinite(d.consumedKcal),
  ).length;

  if (loggedDays === 0) {
    // Nothing logged → neutral. Emphatically NOT off_track: there is no failure to report,
    // only missing data. The card renders an empty state, not a red band.
    return { headlineBand: "not_logged", avgDeviationPct: null, adherentPct: null, loggedDays: 0, totalDays, perDay };
  }

  const measurable = days.filter((d) => isMeasurable(d.consumedKcal, d.targetKcal));
  if (measurable.length === 0) {
    // Logged, but nothing to measure against (no target). Consistency still counts; quality
    // is unknowable, so no band and no deviation — never a red verdict.
    return { headlineBand: "not_logged", avgDeviationPct: null, adherentPct: null, loggedDays, totalDays, perDay };
  }

  const avgConsumed = measurable.reduce((s, d) => s + (d.consumedKcal as number), 0) / measurable.length;
  const avgTarget = measurable.reduce((s, d) => s + (d.targetKcal as number), 0) / measurable.length;
  const headlineBand = dayCalorieBand(avgConsumed, avgTarget);
  const avgDeviationPct = Math.round(((avgConsumed - avgTarget) / avgTarget) * 1000) / 10; // signed, 1dp

  const adherentDays = perDay.filter((b) => b === "adherent").length;
  const adherentPct = Math.round((adherentDays / loggedDays) * 100);

  return { headlineBand, avgDeviationPct, adherentPct, loggedDays, totalDays, perDay };
}

/**
 * One macro's band, using the ±15% D8 tolerance. Within ±15% is on target; beyond is off.
 * Macros get a coarser two-way split than calories on purpose — a macro alert should fire on a
 * real miss, not on the daily jitter of hitting a protein number to the gram.
 */
export function macroDeviation(avgConsumedG: number | null, avgTargetG: number | null): AdherenceBand {
  if (avgConsumedG == null || !Number.isFinite(avgConsumedG)) return "not_logged";
  if (avgTargetG == null || !Number.isFinite(avgTargetG) || avgTargetG <= 0) return "not_logged";
  const dev = Math.abs(avgConsumedG - avgTargetG) / avgTargetG;
  return dev <= 0.15 ? "adherent" : "off_track";
}

/**
 * Visual prominence of each macro (NOT alert routing — no notifications this slice). Calories
 * and protein are the numbers a cut or a bulk actually turns on, so they read LOUD; fat and
 * carbs are the residual split, so they stay QUIET.
 */
export type MacroTier = "loud" | "quiet";
export const MACRO_TIER: Record<"kcal" | "protein" | "fat" | "carbs", MacroTier> = {
  kcal: "loud",
  protein: "loud",
  fat: "quiet",
  carbs: "quiet",
};

/** Band → the app's status vocabulary (NutritionPhaseCard rail). No invented tokens. */
export const BAND_STATUS: Record<AdherenceBand, "ontrack" | "attention" | "risk" | "neutral"> = {
  adherent: "ontrack",
  slightly_off: "attention",
  off_track: "risk",
  not_logged: "neutral",
};

export const BAND_LABEL: Record<AdherenceBand, string> = {
  adherent: "On target",
  slightly_off: "Slightly off",
  off_track: "Off track",
  not_logged: "Not logged",
};
