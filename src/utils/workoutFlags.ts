// src/utils/workoutFlags.ts
//
// Progression flags + pulse-metric helpers for the coach Workouts Pulse (B3).
//
// Flags compare an exercise's best working set THIS session to the same
// exercise's previous session (and prescription):
//   up / stale / down / off_prescription / none.
// They are strength-oriented (the redesign's examples are all strength); for
// activity exercises the flag is "none" and progress is surfaced via PRs
// instead (see prEngine).
//
// TUST is ESTIMATED (no per-set duration is logged): prescribed tempo seconds
// per rep x performed reps, summed over working sets (RIR <= 4). See
// docs/PR_MATRIX.md / docs/COACH_CLIENT_REDESIGN.md.

import type { LoggedSet } from "./prEngine";

export type ProgressionFlag = "up" | "stale" | "down" | "off_prescription" | "none";

export interface Prescription {
  repMin: number | null;
  repMax: number | null;
  intensityType: "RIR" | "RPE" | null;
  intensityValue: number | null;
}

export interface BestSet {
  load: number;
  reps: number;
  rir: number | null;
  rpe: number | null;
}

/** RIR<=4 (or unknown) = a working set; warm-ups / easy back-offs are excluded. */
export function isWorkingSet(set: LoggedSet): boolean {
  return set.performedRir == null || set.performedRir <= 4;
}

/** Top completed working set by load, then reps. Null when none qualify. */
export function bestStrengthSet(sets: LoggedSet[]): BestSet | null {
  let best: BestSet | null = null;
  for (const s of sets) {
    if (s.performedLoad == null || s.performedReps == null) continue;
    if (!isWorkingSet(s)) continue;
    const cand: BestSet = {
      load: s.performedLoad,
      reps: s.performedReps,
      rir: s.performedRir,
      rpe: s.performedRpe,
    };
    if (
      best == null ||
      cand.load > best.load ||
      (cand.load === best.load && cand.reps > best.reps)
    ) {
      best = cand;
    }
  }
  return best;
}

const OFF_RX_INTENSITY_DELTA = 2;

/** Off-prescription if the best set's reps fall outside the Rx range, or its
 *  RIR/RPE deviates from the Rx target by >= 2. */
function isOffPrescription(best: BestSet, rx: Prescription): boolean {
  if (rx.repMin != null && best.reps < rx.repMin) return true;
  if (rx.repMax != null && best.reps > rx.repMax) return true;
  if (rx.intensityType === "RIR" && rx.intensityValue != null && best.rir != null) {
    if (Math.abs(best.rir - rx.intensityValue) >= OFF_RX_INTENSITY_DELTA) return true;
  }
  if (rx.intensityType === "RPE" && rx.intensityValue != null && best.rpe != null) {
    if (Math.abs(best.rpe - rx.intensityValue) >= OFF_RX_INTENSITY_DELTA) return true;
  }
  return false;
}

/**
 * Progression flag for a strength exercise. Off-prescription takes priority;
 * otherwise compares this session's best working set to last session's.
 *
 * NOTE: "stale" fires when this session is identical to the previous one. The
 * spec's stricter "2+ sessions in a row" needs a third session — pass
 * `prevWasStale` true (previous flag was already stale) to require the streak.
 */
export function progressionFlag(args: {
  category: string | null | undefined;
  thisSets: LoggedSet[];
  prevSets: LoggedSet[];
  prescription: Prescription | null;
  prevWasStale?: boolean;
}): ProgressionFlag {
  const { category, thisSets, prevSets, prescription, prevWasStale } = args;
  if (category !== "strength") return "none";

  const cur = bestStrengthSet(thisSets);
  if (cur == null) return "none";

  if (prescription && isOffPrescription(cur, prescription)) return "off_prescription";

  const prev = bestStrengthSet(prevSets);
  if (prev == null) return "none"; // first time — no comparison

  if (cur.load > prev.load) return "up";
  if (cur.load < prev.load) return "down";
  // same load
  if (cur.reps > prev.reps) return "up";
  if (cur.reps < prev.reps) return "down";
  // same load + reps -> compare effort (higher RIR / lower RPE = easier = up)
  if (cur.rir != null && prev.rir != null) {
    if (cur.rir > prev.rir) return "up";
    if (cur.rir < prev.rir) return "down";
  } else if (cur.rpe != null && prev.rpe != null) {
    if (cur.rpe < prev.rpe) return "up";
    if (cur.rpe > prev.rpe) return "down";
  }
  // identical -> stale (only when the previous session was already stale, to
  // honour "2+ in a row"; otherwise this is just the first repeat -> none).
  return prevWasStale ? "stale" : "none";
}

// ──────────────────────────────────────────────────────────────────────────────
// Pulse metric helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Tonnage (kg) for one completed strength set = load x reps. */
export function setTonnage(set: LoggedSet): number {
  if (set.performedLoad == null || set.performedReps == null) return 0;
  return set.performedLoad * set.performedReps;
}

/**
 * Tempo -> seconds per rep (sum of the phase counts). Handles both the
 * separated form ("3-0-1-0", "3:0:1:0", "2 0 1 0") and the concatenated
 * 4-digit bodybuilding form ("2010" = ecc-pauseBottom-con-pauseTop = 3s).
 * "X" (explosive) counts as 1.
 */
export function tempoSecondsPerRep(tempo: string | null | undefined): number {
  if (!tempo) return 0;
  const t = tempo.trim();
  const phaseValue = (p: string): number => {
    if (p === "" ) return 0;
    if (p.toLowerCase() === "x") return 1;
    const n = parseFloat(p);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  // Separated: "3-0-1-0"
  if (/[-:\s]/.test(t)) {
    return t.split(/[-:\s]+/).reduce((s, p) => s + phaseValue(p), 0);
  }
  // Concatenated digits: "2010" -> 2+0+1+0
  if (/^[0-9xX]{3,5}$/.test(t)) {
    return [...t].reduce((s, ch) => s + phaseValue(ch), 0);
  }
  // Fallback: a single number (already seconds/rep).
  return phaseValue(t);
}

/**
 * Estimated time under significant tension (seconds) for one set: tempo
 * seconds-per-rep x performed reps, counted only for working sets (RIR<=4).
 * Falls back to a 3 s/rep default when no tempo is prescribed.
 */
export function estimateSetTust(set: LoggedSet, tempo: string | null | undefined): number {
  if (set.performedReps == null || set.performedReps <= 0) return 0;
  if (!isWorkingSet(set)) return 0;
  const perRep = tempoSecondsPerRep(tempo) || 3;
  return perRep * set.performedReps;
}
