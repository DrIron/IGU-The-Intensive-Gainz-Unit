import type { SetPrescription } from "@/types/workout-builder";

// Tempo helpers --------------------------------------------------------------
//
// Tempo strings are 4 chars: eccentric, pause, concentric, pause. Digits are
// seconds; letters X/A represent explosive/fast — roughly half a second.
// Anything else (spaces, N) is counted as 0 so a 3020 string reads as 5s/rep
// while a 30X0 string reads as 3.5s/rep.

const TEMPO_LETTER_SECONDS = 0.5;

function tempoCharSeconds(ch: string): number {
  if (/[0-9]/.test(ch)) return Number(ch);
  const upper = ch.toUpperCase();
  if (upper === "X" || upper === "A") return TEMPO_LETTER_SECONDS;
  return 0;
}

export function tempoSecondsPerRep(tempo?: string | null): number | null {
  if (!tempo) return null;
  const trimmed = tempo.trim();
  if (trimmed.length === 0) return null;
  const chars = trimmed.slice(0, 4).split("");
  if (chars.length === 0) return null;
  let total = 0;
  for (const ch of chars) total += tempoCharSeconds(ch);
  return total;
}

// Defaults used when tempo is absent — coach/user confirmed 2-4s per rep.
const DEFAULT_TEMPO_MIN = 2;
const DEFAULT_TEMPO_MAX = 4;

// Rest defaults when a set has no rest configured and no rest_seconds_max.
// Keeps the estimator from reporting suspiciously short sessions just because
// the coach didn't fill rest in yet.
const DEFAULT_REST_MIN = 60;
const DEFAULT_REST_MAX = 120;

// Set-level estimate ---------------------------------------------------------
//
// For a single set: duration = repRange * tempoPerRep + restRange. The final
// set in an exercise typically has no rest, but for session-level estimates
// the rest between the last set and the next exercise IS meaningful, so we
// count rest on every set and then optionally subtract one rest period.

export interface SetDurationEstimate {
  /** Lower bound in seconds. */
  minSeconds: number;
  /** Upper bound in seconds. */
  maxSeconds: number;
  /** Rest portion (min) in seconds — useful for subtracting the last set's rest. */
  restMinSeconds: number;
  /** Rest portion (max) in seconds. */
  restMaxSeconds: number;
  /** True when duration was inferred from fallbacks (no tempo or no rest). */
  inferred: boolean;
}

export interface SetDurationInputs {
  reps?: number;
  rep_range_min?: number;
  rep_range_max?: number;
  tempo?: string;
  rest_seconds?: number;
  rest_seconds_max?: number;
}

export function estimateSetDuration(set: SetDurationInputs): SetDurationEstimate {
  // Reps: prefer explicit range, else a single reps count (acts as both bounds),
  // else 8-12 as a reasonable fallback.
  const repsMin = set.rep_range_min ?? set.reps ?? 8;
  const repsMax = set.rep_range_max ?? set.reps ?? Math.max(12, repsMin);

  const tempoSec = tempoSecondsPerRep(set.tempo);
  const tempoMin = tempoSec ?? DEFAULT_TEMPO_MIN;
  const tempoMax = tempoSec ?? DEFAULT_TEMPO_MAX;

  const workMin = repsMin * tempoMin;
  const workMax = repsMax * tempoMax;

  const restLo = set.rest_seconds;
  const restHi = set.rest_seconds_max;
  let restMin: number;
  let restMax: number;
  let restInferred = false;
  if (restLo != null && restHi != null) {
    // Auto-swap if written out of order.
    restMin = Math.min(restLo, restHi);
    restMax = Math.max(restLo, restHi);
  } else if (restLo != null) {
    restMin = restLo;
    restMax = restLo;
  } else if (restHi != null) {
    restMin = restHi;
    restMax = restHi;
  } else {
    restMin = DEFAULT_REST_MIN;
    restMax = DEFAULT_REST_MAX;
    restInferred = true;
  }

  return {
    minSeconds: workMin + restMin,
    maxSeconds: workMax + restMax,
    restMinSeconds: restMin,
    restMaxSeconds: restMax,
    inferred: tempoSec == null || restInferred,
  };
}

// Exercise-level: sum N sets, drop the last set's rest (post-last-set rest is
// not part of the exercise; it's between exercises / end of session).
export function estimateExerciseDuration(sets: SetDurationInputs[]): {
  minSeconds: number;
  maxSeconds: number;
  inferred: boolean;
} {
  if (sets.length === 0) return { minSeconds: 0, maxSeconds: 0, inferred: false };
  let min = 0;
  let max = 0;
  let inferred = false;
  let lastRestMin = 0;
  let lastRestMax = 0;
  for (const set of sets) {
    const est = estimateSetDuration(set);
    min += est.minSeconds;
    max += est.maxSeconds;
    lastRestMin = est.restMinSeconds;
    lastRestMax = est.restMaxSeconds;
    if (est.inferred) inferred = true;
  }
  return {
    minSeconds: Math.max(0, min - lastRestMin),
    maxSeconds: Math.max(0, max - lastRestMax),
    inferred,
  };
}

// Accept SetPrescription array (workout-builder type) directly.
export function estimateExerciseDurationFromSets(sets: SetPrescription[]): {
  minSeconds: number;
  maxSeconds: number;
  inferred: boolean;
} {
  return estimateExerciseDuration(
    sets.map(s => ({
      reps: s.reps,
      rep_range_min: s.rep_range_min,
      rep_range_max: s.rep_range_max,
      tempo: s.tempo,
      rest_seconds: s.rest_seconds,
      rest_seconds_max: s.rest_seconds_max,
    }))
  );
}

// Session-level: sum exercises. Between exercises we assume the last set's
// rest of the previous exercise serves as the transition, so exercise-level
// drops the last rest — we keep that behavior but add a small transition
// buffer (30s) between exercises.
const EXERCISE_TRANSITION_SECONDS = 30;

export function estimateSessionDuration(exercises: SetDurationInputs[][]): {
  minSeconds: number;
  maxSeconds: number;
  inferred: boolean;
} {
  const exerciseBounds = exercises
    .filter(ex => ex.length > 0)
    .map(ex => estimateExerciseDuration(ex));
  if (exerciseBounds.length === 0) return { minSeconds: 0, maxSeconds: 0, inferred: false };
  const min = exerciseBounds.reduce((s, e) => s + e.minSeconds, 0)
    + EXERCISE_TRANSITION_SECONDS * (exerciseBounds.length - 1);
  const max = exerciseBounds.reduce((s, e) => s + e.maxSeconds, 0)
    + EXERCISE_TRANSITION_SECONDS * (exerciseBounds.length - 1);
  const inferred = exerciseBounds.some(e => e.inferred);
  return { minSeconds: min, maxSeconds: max, inferred };
}

// Formatting -----------------------------------------------------------------
//
// Rounds to the nearest 5 minutes for short sessions and the nearest minute
// otherwise -- coaches read "~45-60m", not "43:12".

export function formatDurationRange(minSeconds: number, maxSeconds: number): string {
  const toMin = (s: number) => Math.max(0, Math.round(s / 60));
  const lo = toMin(minSeconds);
  const hi = toMin(maxSeconds);
  if (lo === hi) return `${lo}m`;
  return `${lo}-${hi}m`;
}
