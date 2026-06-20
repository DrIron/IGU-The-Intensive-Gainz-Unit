/**
 * Interpretation layer (CC2) + status tone vocabulary (CC4).
 *
 * Single source of truth for turning raw metric values into a tone + a
 * plain-language sentence. The nutrition-phase classifier here is LIFTED
 * VERBATIM from NutritionPhaseCard.tsx so the card, badge, status rail and
 * every new dot/chip share one classification. Do not fork it.
 */

export type Tone = "on_track" | "attention" | "risk" | "neutral";

export interface Interpretation {
  tone: Tone;
  /** 1-2 words for a badge/dot. */
  label: string;
  /** Full plain-language line shown under the metric. */
  sentence: string;
}

const f1 = (n: number) => (Math.round(n * 10) / 10).toString();
// Trim to <=2 decimals without trailing zeros (0.75 -> "0.75", 0.6 -> "0.6"),
// matching the card's expected-rate strip rather than over-rounding.
const trimNum = (n: number) => Number(Math.round(n * 100) / 100).toString();

const TONE_TOKEN: Record<Tone, string> = {
  on_track: "ontrack",
  attention: "attention",
  risk: "risk",
  neutral: "neutral",
};

/**
 * Tailwind utility classes for a tone. NOTE: these strings are built
 * dynamically, so the matching `status-*` utilities are safelisted in
 * tailwind.config.ts — adding a new tone means adding to that safelist too.
 */
export const toneClasses = (tone: Tone) => {
  const t = TONE_TOKEN[tone];
  return {
    text: `text-status-${t}`,
    dot: `bg-status-${t}`,
    soft: `bg-status-${t}/10`,
    rail: `border-l-status-${t}`,
  };
};

/* ---- Nutrition phase status: EXTRACTED from NutritionPhaseCard.tsx (single source) ---- */

export type PhaseStatus = "completed" | "no_data" | "on_track" | "ahead" | "behind";

/**
 * weeklyRatePercentage is the POSITIVE magnitude stored on the phase;
 * latestActualChangePercent is signed (% vs previous week). Direction comes
 * from goalType (fat_loss signs the expected target negative).
 */
export function classifyPhaseStatus(args: {
  isActive: boolean;
  latestActualChangePercent: number | null;
  weeklyRatePercentage: number;
  goalType: "fat_loss" | "muscle_gain" | "maintenance";
}): PhaseStatus {
  const { isActive, latestActualChangePercent, weeklyRatePercentage, goalType } = args;
  // Completed takes precedence over rate-derived status (matches the card).
  if (isActive === false) return "completed";
  if (latestActualChangePercent == null) return "no_data";
  const expected = weeklyRatePercentage;
  if (goalType === "maintenance") {
    return Math.abs(latestActualChangePercent) <= 0.25 ? "on_track" : "behind";
  }
  const signedExpected = goalType === "fat_loss" ? -expected : expected;
  if (signedExpected === 0) return "on_track";
  const deviation = ((latestActualChangePercent - signedExpected) / Math.abs(signedExpected)) * 100;
  if (Math.abs(deviation) <= 30) return "on_track";
  if (goalType === "fat_loss") {
    return latestActualChangePercent < signedExpected ? "ahead" : "behind";
  }
  return latestActualChangePercent > signedExpected ? "ahead" : "behind";
}

// Tone mapping mirrors the existing status rail: on_track=green, ahead=amber
// (overshooting — too fast, not a failure), behind=red.
const PHASE_TONE: Record<PhaseStatus, Tone> = {
  on_track: "on_track",
  ahead: "attention",
  behind: "risk",
  completed: "neutral",
  no_data: "neutral",
};

/** CC2 sentence + tone layered on the canonical phase status. */
export function interpretPhaseStatus(args: {
  status: PhaseStatus;
  latestActualChangePercent: number | null;
  weeklyRatePercentage: number;
  goalType: "fat_loss" | "muscle_gain" | "maintenance";
}): Interpretation {
  const { status, latestActualChangePercent, weeklyRatePercentage, goalType } = args;
  const tone = PHASE_TONE[status];
  const lc = latestActualChangePercent;
  const mag = lc != null ? f1(Math.abs(lc)) : null;
  const target = trimNum(weeklyRatePercentage);
  // Direction follows the ACTUAL signed change, never the goal. A fat-loss
  // client who gained that week must read "up", not "Losing" -- deriving the
  // word from goalType lies whenever actual and goal point opposite ways.
  const moved = lc == null ? "" : lc <= -0.05 ? `down ${mag}%/wk` : lc >= 0.05 ? `up ${mag}%/wk` : "flat";
  switch (status) {
    case "completed":
      return { tone, label: "Completed", sentence: "This phase is complete." };
    case "no_data":
      return { tone, label: "No data yet", sentence: "Log a couple more weigh-ins to see your trend." };
    case "on_track":
      return {
        tone,
        label: "On track",
        sentence:
          goalType === "maintenance"
            ? "Holding steady, right where it should be."
            : `Weight ${moved} — right in your ${target}% target band.`,
      };
    case "ahead":
      return {
        tone,
        label: "Ahead",
        sentence: `Weight ${moved} — faster than your ${target}% target; keep an eye on recovery.`,
      };
    case "behind":
      return {
        tone,
        label: "Behind",
        sentence:
          goalType === "maintenance"
            ? `Weight ${moved} — drifting from maintenance.`
            : `Weight ${moved} — short of your ${target}% target.`,
      };
  }
}

/* ---- Net-new helpers (no existing equivalent) ---- */

/** Weekly habit completion (weigh-ins X/target, step days X/7). */
export function interpretWeeklyHabit(done: number, target: number, noun: string): Interpretation {
  if (target <= 0) return { tone: "neutral", label: "", sentence: "" };
  if (done >= target) return { tone: "on_track", label: "Done", sentence: `All ${target} ${noun} done this week — nice.` };
  if (done === 0) return { tone: "attention", label: "Not started", sentence: `0 of ${target} ${noun} so far this week.` };
  return { tone: "attention", label: `${done}/${target}`, sentence: `${done} of ${target} ${noun} — ${target - done} to go.` };
}

/** Coach check-ins due, surfacing the worst-overdue (mirrors DRIFT_DAYS_THRESHOLD = 7). */
export function interpretCheckIns(due: number, mostOverdueDays: number | null): Interpretation {
  if (due === 0) return { tone: "on_track", label: "Clear", sentence: "No check-ins due — all caught up." };
  const tail = mostOverdueDays && mostOverdueDays > 0 ? ` — 1 is ${mostOverdueDays}d overdue` : "";
  return {
    tone: mostOverdueDays && mostOverdueDays >= 7 ? "risk" : "attention",
    label: `${due} due`,
    sentence: `${due} check-in${due > 1 ? "s" : ""} due${tail}.`,
  };
}

/**
 * Broad roster-attention headline (CO1) — the deduped total spans payment +
 * inactive + check-in + pending + adjustments, so frame it generically rather
 * than as "N check-ins due" (that would under-describe it). The check-in slice
 * keeps its own interpretCheckIns sentence on the dedicated card.
 */
export function interpretAttention(total: number, mostOverdueDays: number | null): Interpretation {
  if (total <= 0) return { tone: "on_track", label: "Clear", sentence: "Nothing needs attention right now." };
  const tail = mostOverdueDays && mostOverdueDays > 0 ? ` · most overdue ${mostOverdueDays}d` : "";
  return {
    tone: mostOverdueDays && mostOverdueDays >= 7 ? "risk" : "attention",
    label: `${total} to review`,
    sentence: `${total} ${total === 1 ? "client needs" : "clients need"} attention${tail}.`,
  };
}

/** Days since last weigh-in → drift signal for the coach roster. */
export function interpretWeighInRecency(daysSince: number | null): Interpretation {
  if (daysSince == null) return { tone: "neutral", label: "No weigh-in", sentence: "No weigh-in logged yet." };
  if (daysSince >= 7) return { tone: "risk", label: "Drifting", sentence: `${daysSince} days since last weigh-in.` };
  if (daysSince >= 4) return { tone: "attention", label: "Slowing", sentence: `${daysSince} days since last weigh-in.` };
  return { tone: "on_track", label: "Active", sentence: `Weighed in ${daysSince === 0 ? "today" : `${daysSince}d ago`}.` };
}

/** Daily macro targets (CL2) — describes the plan's macro split + goal intent.
 *  Neutral tone: a prescription isn't on/off-track. Pure function of the four
 *  stored numbers — NO bodyweight or BMR/TDEE math (that lives only in
 *  calculateNutritionGoals). */
export function interpretMacroTargets(args: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  goalType: "fat_loss" | "muscle_gain" | "maintenance" | string;
}): Interpretation {
  const { calories, protein, carbs, fat, goalType } = args;
  if (!calories || calories <= 0) return { tone: "neutral", label: "", sentence: "" };
  const proteinPct = Math.round(((protein * 4) / calories) * 100);
  const carbPct = Math.round(((carbs * 4) / calories) * 100);
  const fatPct = Math.round(((fat * 9) / calories) * 100);
  const shape = proteinPct >= 35 ? "protein-forward" : proteinPct >= 25 ? "balanced" : "carb-led";
  const intent =
    goalType === "fat_loss" ? "to hold muscle while you lose fat"
    : goalType === "muscle_gain" ? "to fuel growth"
    : "to maintain where you are";
  return {
    tone: "neutral",
    label: `${proteinPct}P/${carbPct}C/${fatPct}F`,
    sentence: `${proteinPct}% protein · ${carbPct}% carbs · ${fatPct}% fat — a ${shape} split ${intent}.`,
  };
}

/** Strength trend on the exercise-detail e1RM metric (HX1). Up = good. */
export function interpretE1rmTrend(deltaKg: number, sessions: number): Interpretation {
  if (sessions < 2) return { tone: "neutral", label: "", sentence: "Log another session to see your strength trend." };
  const mag = f1(Math.abs(deltaKg));
  if (deltaKg >= 0.5) return { tone: "on_track", label: "Trending up", sentence: `Est. 1RM up ${mag} kg over ${sessions} sessions — getting stronger.` };
  if (deltaKg <= -0.5) return { tone: "attention", label: "Dipped", sentence: `Est. 1RM down ${mag} kg over ${sessions} sessions — could be fatigue or a deload.` };
  return { tone: "neutral", label: "Holding", sentence: `Est. 1RM steady over ${sessions} sessions.` };
}

/**
 * NU3 — the client "here's your new target & why" moment for an APPLIED
 * nutrition adjustment. Ground-truth only: built from the applied calorie
 * delta + the stored expected/actual percentages. It never RE-DERIVES
 * direction from raw weight signs (that path caused the PR #70 advice flip).
 */
export function interpretAdjustment(args: {
  calorieDelta: number | null;   // approved_calorie_adjustment (signed kcal)
  newCalories: number | null;    // new_daily_calories
  expectedPct: number | null;    // expected_weight_change_percentage
  actualPct: number | null;      // actual_weight_change_percentage
  isDietBreak: boolean;
}): Interpretation {
  const { calorieDelta, newCalories, expectedPct, actualPct, isDietBreak } = args;
  const target = newCalories != null ? `${Math.round(newCalories).toLocaleString()} kcal` : "your new target";
  if (isDietBreak) {
    return {
      tone: "neutral",
      label: "Diet break",
      sentence: `Recovery week — calories set to maintenance (${target}). Back to the plan next week.`,
    };
  }
  const d = calorieDelta == null ? 0 : Math.round(calorieDelta);
  const moved =
    d > 0 ? `up ${d.toLocaleString()} kcal to ${target}`
    : d < 0 ? `down ${Math.abs(d).toLocaleString()} kcal to ${target}`
    : `held at ${target}`;
  const why =
    expectedPct != null && actualPct != null
      ? ` Your weekly change came in at ${f1(actualPct)}% vs your ${f1(expectedPct)}% target.`
      : "";
  return { tone: "on_track", label: "New target", sentence: `Your daily target is ${moved}.${why}` };
}
