import { calculateReverseTDEE } from "@/utils/nutritionCalculations";
import type { TrendPoint } from "@/components/client-overview/charts/PhaseAnnotatedTrendChart";

/**
 * NU2 — a rolling REAL (reverse) TDEE series from what the client actually logged.
 *
 * For each anchor day D, over a trailing window:
 *   TDEE(D) = calculateReverseTDEE(avgLoggedCalories, smoothedWeightChangeKg, windowDays)
 * where the weight change is a SMOOTHED end-minus-start (average the first-N and last-N weigh-ins
 * in the window, never two raw daily points — daily weight noise would swamp the signal).
 *
 * ── The honesty gate (load-bearing) ──────────────────────────────────────────
 * A point is emitted ONLY when the window has ≥ minLoggedDays logged calorie days AND ≥
 * minWeighIns weigh-ins spanning ≥ minSpanDays. Below that the estimate is noise, so we emit
 * NOTHING — never a fabricated TDEE number off sparse logging (same discipline as the adherence
 * gate). This is why a coach can trust a plotted point.
 */

export interface LoggedKcalDay {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  kcal: number;
}
export interface WeighIn {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  kg: number;
}

export interface ReverseTdeeOptions {
  windowDays?: number; // trailing window length (the reverseTDEE totalDays)
  minLoggedDays?: number; // ≥ this many logged calorie days in the window
  minWeighIns?: number; // ≥ this many weigh-ins in the window
  minSpanDays?: number; // first→last weigh-in must span ≥ this many days
  smoothN?: number; // average up to this many weigh-ins at each end
}

const DEFAULTS: Required<ReverseTdeeOptions> = {
  windowDays: 14,
  minLoggedDays: 7,
  minWeighIns: 2,
  minSpanDays: 10,
  smoothN: 3,
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** Midnight-of-day ms for an ISO date (local), matching the intake-trends' day math. */
function dayMs(isoDate: string): number {
  return new Date(isoDate + "T00:00:00").getTime();
}
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

export function computeReverseTdeeSeries(
  loggedDays: LoggedKcalDay[],
  weighIns: WeighIn[],
  options: ReverseTdeeOptions = {},
): TrendPoint[] {
  const opt = { ...DEFAULTS, ...options };

  const logs = loggedDays
    .map((d) => ({ t: dayMs(d.date), kcal: Number(d.kcal) }))
    .filter((d) => Number.isFinite(d.t) && Number.isFinite(d.kcal))
    .sort((a, b) => a.t - b.t);
  const weights = weighIns
    .map((w) => ({ t: dayMs(w.date), kg: Number(w.kg) }))
    .filter((w) => Number.isFinite(w.t) && Number.isFinite(w.kg))
    .sort((a, b) => a.t - b.t);

  if (logs.length === 0) return [];

  const out: TrendPoint[] = [];
  // Anchor a candidate point on each logged calorie day; the trailing window ends there.
  for (const anchor of logs) {
    const windowStart = anchor.t - (opt.windowDays - 1) * DAY_MS;

    const logsInWindow = logs.filter((d) => d.t >= windowStart && d.t <= anchor.t);
    if (logsInWindow.length < opt.minLoggedDays) continue;

    const wInWindow = weights.filter((w) => w.t >= windowStart && w.t <= anchor.t);
    if (wInWindow.length < opt.minWeighIns) continue;

    const spanDays = (wInWindow[wInWindow.length - 1].t - wInWindow[0].t) / DAY_MS;
    if (spanDays < opt.minSpanDays) continue;

    // Non-overlapping end groups: average the first-n and last-n weigh-ins (n scales down so the
    // two groups never overlap — with only 2 weigh-ins this is start=first, end=last).
    const n = Math.max(1, Math.min(opt.smoothN, Math.floor(wInWindow.length / 2)));
    const startAvg = mean(wInWindow.slice(0, n).map((w) => w.kg));
    const endAvg = mean(wInWindow.slice(-n).map((w) => w.kg));
    const weightChangeKg = endAvg - startAvg;

    const avgCalories = mean(logsInWindow.map((d) => d.kcal));
    const value = calculateReverseTDEE(avgCalories, weightChangeKg, opt.windowDays);
    if (!Number.isFinite(value)) continue;

    out.push({ t: anchor.t, value: Math.round(value) });
  }

  return out;
}
