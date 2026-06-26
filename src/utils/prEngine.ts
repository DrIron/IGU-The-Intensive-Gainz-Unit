// src/utils/prEngine.ts
//
// Activity-aware significant-PR engine (redesign B3). The single source of PR
// truth, implementing docs/PR_MATRIX.md (locked 2026-06-26). Generalises the
// strength-only A3 detector (detectSetPr/classifySetPr in WorkoutSessionV2) to
// strength + cardio + HIIT + mobility + physio.
//
// A PR is judged per exercise, vs the client's OWN prior history for that
// movement (set logs for all instances of the same exercise_id, excluding the
// current session) -- same basis as A3's pr_refs.
//
// Routing: exercise category selects the rule group. warmup / cooldown /
// recovery are supportive work -> no PRs. All loads canonical kg; pace is
// time-per-distance (lower = faster). Thresholds live in this file, not callers.

export type ExerciseCategory =
  | "strength"
  | "cardio"
  | "mobility"
  | "physio"
  | "warmup"
  | "cooldown"
  | "sport_specific"
  // planning ActivityType variants that also reach us:
  | "hiit"
  | "yoga_mobility"
  | "recovery";

export interface LoggedSet {
  performedLoad: number | null; // kg
  performedReps: number | null;
  performedRir: number | null;
  performedRpe: number | null;
  performedTime: number | null; // seconds
  performedDistance: number | null; // metres
  performedPace: number | null; // sec per unit (lower = faster)
  performedRounds: number | null;
  performedCalories: number | null;
  performedSide: string | null;
}

export type PrId =
  | "S1" | "S2" | "S3" | "S4"
  | "C1" | "C2" | "C3" | "C4" | "C5"
  | "H1" | "H2" | "H3"
  | "M1"
  | "P1";

export interface PrMatch {
  id: PrId;
  label: string;
  /** physio P1 is progress-framed, not celebrated as a "PR". */
  celebrate: boolean;
}

type RuleGroup = "strength" | "cardio" | "hiit" | "mobility" | "physio" | "none";

export function ruleGroupForCategory(category: string | null | undefined): RuleGroup {
  switch (category) {
    case "strength":
      return "strength";
    case "cardio":
      return "cardio";
    case "hiit":
    case "sport_specific":
      return "hiit";
    case "mobility":
    case "yoga_mobility":
      return "mobility";
    case "physio":
      return "physio";
    case "warmup":
    case "cooldown":
    case "recovery":
      return "none";
    default:
      return "none";
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// History accumulator (the client's prior bests for one exercise)
// ──────────────────────────────────────────────────────────────────────────────

const DISTANCE_BUCKET_M = 500; // C4/C5: round to 0.5 km
const TIME_CAP_BUCKET_S = 30; // H3: round time-cap to 30 s

function distanceBucket(m: number): number {
  return Math.round(m / DISTANCE_BUCKET_M) * DISTANCE_BUCKET_M;
}
function timeCapBucket(s: number): number {
  return Math.round(s / TIME_CAP_BUCKET_S) * TIME_CAP_BUCKET_S;
}

export interface ExerciseHistory {
  // strength
  bestLoad: number;
  bestLoadAtReps: Map<number, number>; // S2 helper
  bestRepsAtLoad: Map<number, number>; // S4
  bestRirAtLoadReps: Map<string, number>; // S3 (higher rir = easier)
  bestRpeAtLoadReps: Map<string, number>; // S3 (lower rpe = easier)
  // cardio
  bestDistance: number;
  bestDurationTime: number; // C2 longest time
  bestPace: number; // C3 lowest (Infinity until seen)
  bestTimeAtDistance: Map<number, number>; // C4 shortest time at distance bucket
  distanceBucketsSeen: Set<number>; // C5
  // hiit
  bestRounds: number;
  bestTimeAtRounds: Map<number, number>; // H2 shortest time at round count
  bestRepsAtTimeCap: Map<number, number>; // H3 most reps at time-cap bucket
  // mobility
  bestHoldBySide: Map<string, number>; // M1 (side key, "" when none)
  // physio
  bestRepsOrRounds: number; // P1
}

function emptyHistory(): ExerciseHistory {
  return {
    bestLoad: 0,
    bestLoadAtReps: new Map(),
    bestRepsAtLoad: new Map(),
    bestRirAtLoadReps: new Map(),
    bestRpeAtLoadReps: new Map(),
    bestDistance: 0,
    bestDurationTime: 0,
    bestPace: Infinity,
    bestTimeAtDistance: new Map(),
    distanceBucketsSeen: new Set(),
    bestRounds: 0,
    bestTimeAtRounds: new Map(),
    bestRepsAtTimeCap: new Map(),
    bestHoldBySide: new Map(),
    bestRepsOrRounds: 0,
  };
}

function maxInto(map: Map<number | string, number>, key: number | string, v: number) {
  const cur = map.get(key);
  if (cur == null || v > cur) map.set(key, v);
}
function minInto(map: Map<number, number>, key: number, v: number) {
  const cur = map.get(key);
  if (cur == null || v < cur) map.set(key, v);
}

/** Fold a set of prior logs into the bests structure for an exercise. */
export function buildExerciseHistory(priorSets: LoggedSet[]): ExerciseHistory {
  const h = emptyHistory();
  for (const s of priorSets) {
    // strength
    if (s.performedLoad != null && s.performedReps != null) {
      if (s.performedLoad > h.bestLoad) h.bestLoad = s.performedLoad;
      maxInto(h.bestLoadAtReps, s.performedReps, s.performedLoad);
      maxInto(h.bestRepsAtLoad, s.performedLoad, s.performedReps);
      const key = `${s.performedLoad}:${s.performedReps}`;
      if (s.performedRir != null) maxInto(h.bestRirAtLoadReps, key, s.performedRir);
      if (s.performedRpe != null) {
        const cur = h.bestRpeAtLoadReps.get(key);
        if (cur == null || s.performedRpe < cur) h.bestRpeAtLoadReps.set(key, s.performedRpe);
      }
    }
    // cardio / activity metrics
    if (s.performedDistance != null && s.performedDistance > 0) {
      if (s.performedDistance > h.bestDistance) h.bestDistance = s.performedDistance;
      h.distanceBucketsSeen.add(distanceBucket(s.performedDistance));
      if (s.performedTime != null && s.performedTime > 0) {
        minInto(h.bestTimeAtDistance, distanceBucket(s.performedDistance), s.performedTime);
      }
    }
    if (s.performedTime != null && s.performedTime > 0) {
      if (s.performedTime > h.bestDurationTime) h.bestDurationTime = s.performedTime;
    }
    if (s.performedPace != null && s.performedPace > 0) {
      if (s.performedPace < h.bestPace) h.bestPace = s.performedPace;
    }
    // hiit
    if (s.performedRounds != null && s.performedRounds > 0) {
      if (s.performedRounds > h.bestRounds) h.bestRounds = s.performedRounds;
      if (s.performedTime != null && s.performedTime > 0) {
        minInto(h.bestTimeAtRounds, s.performedRounds, s.performedTime);
      }
    }
    if (s.performedReps != null && s.performedTime != null && s.performedTime > 0) {
      maxInto(h.bestRepsAtTimeCap, timeCapBucket(s.performedTime), s.performedReps);
    }
    // mobility (hold = time, optionally per side)
    if (s.performedTime != null && s.performedTime > 0) {
      const sideKey = s.performedSide ?? "";
      maxInto(h.bestHoldBySide, sideKey, s.performedTime);
    }
    // physio volume
    const vol = s.performedReps ?? s.performedRounds ?? 0;
    if (vol > h.bestRepsOrRounds) h.bestRepsOrRounds = vol;
  }
  return h;
}

// ──────────────────────────────────────────────────────────────────────────────
// Significance helpers (noise floor — see PR_MATRIX.md §Significant thresholds)
// ──────────────────────────────────────────────────────────────────────────────

const higherByPct = (cur: number, best: number, pct: number, floorAbs: number) =>
  best > 0 && cur - best >= Math.max(best * pct, floorAbs);
const lowerByPct = (cur: number, best: number, pct: number, floorAbs: number) =>
  best > 0 && Number.isFinite(best) && best - cur >= Math.max(best * pct, floorAbs);

// ──────────────────────────────────────────────────────────────────────────────
// Per-set detection
// ──────────────────────────────────────────────────────────────────────────────

/** Significant PRs for one set vs the exercise's prior history. */
export function detectSetPrs(
  set: LoggedSet,
  h: ExerciseHistory,
  group: RuleGroup,
): PrMatch[] {
  const out: PrMatch[] = [];
  const add = (id: PrId, label: string, celebrate = true) => out.push({ id, label, celebrate });

  if (group === "strength") {
    const load = set.performedLoad;
    const reps = set.performedReps;
    if (load == null || reps == null) return out;
    // S1 heaviest ever
    if (load > h.bestLoad) add("S1", "Heaviest ever");
    // S2 heaviest at this rep-count ±1
    let bestAtReps = 0;
    for (let r = reps - 1; r <= reps + 1; r++) bestAtReps = Math.max(bestAtReps, h.bestLoadAtReps.get(r) ?? 0);
    if (bestAtReps > 0 && load > bestAtReps) add("S2", `Heaviest @ ${reps} reps`);
    // S4 more reps at this exact load
    const bestRepsHere = h.bestRepsAtLoad.get(load);
    if (bestRepsHere != null && reps > bestRepsHere) add("S4", "Rep PR at weight");
    // S3 got easier (same load×reps, higher RIR or lower RPE)
    const key = `${load}:${reps}`;
    const priorRir = h.bestRirAtLoadReps.get(key);
    const priorRpe = h.bestRpeAtLoadReps.get(key);
    const easierByRir = set.performedRir != null && priorRir != null && set.performedRir - priorRir >= 1;
    const easierByRpe = set.performedRpe != null && priorRpe != null && priorRpe - set.performedRpe >= 0.5;
    if (easierByRir || easierByRpe) add("S3", "Same weight, easier");
    return out;
  }

  if (group === "cardio") {
    const dist = set.performedDistance;
    const time = set.performedTime;
    const pace = set.performedPace;
    if (dist != null && dist > 0) {
      if (higherByPct(dist, h.bestDistance, 0.01, 50)) add("C1", "Longest distance");
      const bucket = distanceBucket(dist);
      if (!h.distanceBucketsSeen.has(bucket)) add("C5", "New distance");
      if (time != null && time > 0) {
        const bestAt = h.bestTimeAtDistance.get(bucket);
        if (bestAt != null && lowerByPct(time, bestAt, 0.01, 2)) add("C4", "Faster at distance");
      }
    }
    if (time != null && time > 0 && higherByPct(time, h.bestDurationTime, 0.01, 30)) add("C2", "Longest duration");
    if (pace != null && pace > 0 && lowerByPct(pace, h.bestPace, 0.01, 0)) add("C3", "Fastest pace");
    return out;
  }

  if (group === "hiit") {
    const rounds = set.performedRounds;
    const time = set.performedTime;
    const reps = set.performedReps;
    if (rounds != null && rounds > 0) {
      if (rounds > h.bestRounds) add("H1", "Most rounds");
      if (time != null && time > 0) {
        const bestAt = h.bestTimeAtRounds.get(rounds);
        if (bestAt != null && lowerByPct(time, bestAt, 0.01, 2)) add("H2", "Fastest workout");
      }
    }
    if (reps != null && time != null && time > 0) {
      const bestReps = h.bestRepsAtTimeCap.get(timeCapBucket(time));
      if (bestReps != null && reps > bestReps) add("H3", "Most reps in cap");
    }
    return out;
  }

  if (group === "mobility") {
    const time = set.performedTime;
    if (time != null && time > 0) {
      const sideKey = set.performedSide ?? "";
      const best = h.bestHoldBySide.get(sideKey) ?? 0;
      // M1: longer hold, ≥1s AND ≥5%
      if (best > 0 && time - best >= 1 && time - best >= best * 0.05) add("M1", "Longest hold");
    }
    return out;
  }

  if (group === "physio") {
    const vol = set.performedReps ?? set.performedRounds ?? null;
    if (vol != null && vol > h.bestRepsOrRounds) add("P1", "Progress", false);
    return out;
  }

  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// Session-level detection
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Distinct PRs an exercise hit THIS session, vs the client's prior history.
 * Each PR type counts at most once per exercise per session (the best set that
 * triggers it), so multiple ascending sets don't inflate the count.
 */
export function detectExercisePrs(
  category: string | null | undefined,
  sessionSets: LoggedSet[],
  priorSets: LoggedSet[],
): PrMatch[] {
  const group = ruleGroupForCategory(category);
  if (group === "none") return [];
  const h = buildExerciseHistory(priorSets);
  const byId = new Map<PrId, PrMatch>();
  for (const set of sessionSets) {
    for (const m of detectSetPrs(set, h, group)) {
      if (!byId.has(m.id)) byId.set(m.id, m);
    }
  }
  return [...byId.values()];
}
