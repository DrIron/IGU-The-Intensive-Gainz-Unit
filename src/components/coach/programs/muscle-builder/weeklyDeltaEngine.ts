// src/components/coach/programs/muscle-builder/weeklyDeltaEngine.ts
//
// Pure engine for the Planning Board "weekly delta" system.
//
// Concept: a coach attaches small rules to fields on a W1 slot ("RIR -1/wk",
// "ecc tempo digit -1/wk"). The engine resolves W2-WN values by walking from
// the W1 base + amount * weekOffset. Math is ALWAYS anchored to W1 — never
// chained from the previous week. The caller (reducer) is responsible for
// passing the W1 base every time it asks for a derived week.
//
// Spec: docs/PLANNING_BOARD_WEEKLY_DELTAS_PLAN.md  §1 (engine),  §6 (D1-D14).
// No React, no Supabase, no reducer wiring. Pure functions only.

import type { MuscleSlotData, SlotExercise } from "@/types/muscle-builder";
import type { SetPrescription } from "@/types/workout-builder";

// ============================================================
// Types — discriminated union, one shape per target field
// ============================================================

/**
 * Field a rule targets. `weight` and `rest_seconds` deferred to a follow-up
 * (they only exist on `SetPrescription`, not slot-level — UI cost is higher
 * than engine benefit for MVP).
 */
export type DeltaTarget =
  | 'sets'
  | 'repMin'
  | 'repMax'
  | 'tempo'
  | 'rir'
  | 'rpe'
  | 'instructions';

/** Where a per-set scoped rule writes when `setsDetail` is populated. */
export type SetScope =
  | { kind: 'all' }                             // mutates slot-level field
  | { kind: 'first' }                           // setsDetail[0]
  | { kind: 'last' }                            // setsDetail[N-1]
  | { kind: 'index'; setNumber: number }        // setsDetail[setNumber - 1] (1-indexed)
  | { kind: 'set_numbers'; setNumbers: number[] }; // setsDetail[n-1] for each (1-indexed) n

export type DeloadBehavior =
  | 'skip'        // keep base; don't apply rule on deload week
  | 'apply'       // apply rule normally
  | 'invert'      // amount * -1, then apply normally
  | 'fixed';      // ignore rule; write deloadFixedValue verbatim

interface BaseRule {
  id: string;
  /** Default `'skip'`. */
  deload?: DeloadBehavior;
  /** Required when `deload === 'fixed'`. */
  deloadFixedValue?: number;
  /**
   * 1-indexed week from which the rule starts applying. Default `2` (rule
   * is dormant on W1, active from W2 onward). Deferred per D13 but engine
   * supports it.
   */
  activeWeekStart?: number;
  /** 1-indexed last week the rule applies. Default undefined (no end). */
  activeWeekEnd?: number;
}

export type WeeklyDeltaRule =
  // `sets` (count) is slot-level only — you can't apply a count change "to set 3".
  // `addedSetSpec` (Phase 1e) prescribes what a newly-added set looks like.
  | (BaseRule & { target: 'sets';   op: 'add'; amount: number; addedSetSpec?: Partial<SetPrescription> })
  // `scope` is OPTIONAL on these — absent ⇒ slot-level (back-compat); present ⇒ per-set (Phase 1d).
  | (BaseRule & { target: 'repMin' | 'repMax'; op: 'add'; amount: number; scope?: SetScope })
  | (BaseRule & { target: 'rir' | 'rpe'; op: 'add'; amount: number; scope: SetScope })
  | (BaseRule & { target: 'tempo'; op: 'digit_add'; position: 0 | 1 | 2 | 3; amount: number; scope?: SetScope })
  | (BaseRule & { target: 'instructions'; op: 'append'; text: string; scope?: SetScope })
  | (BaseRule & { target: 'instructions'; op: 'replace_per_week'; texts: string[]; scope?: SetScope });

export type SkipReason =
  | 'literal_token'           // tempo position holds 'A' or 'X'
  | 'out_of_range'            // index ≥ array length, etc.
  | 'deload_skip'             // rule.deload === 'skip' on a deload week
  | 'no_base'                 // base value is undefined/null/NaN
  | 'out_of_active_range'     // weekOffset outside activeWeekStart..activeWeekEnd
  | 'missing_setsdetail';     // per-set scope but slot has no setsDetail

export type ApplyResult =
  | { ok: true;  value: number | string }
  | { ok: false; skipped: true; reason: SkipReason };

export interface SlotResolveResult {
  /** Slot with all derivable fields filled in. */
  slot: MuscleSlotData;
  /** Fields touched by a rule this pass — for UI "auto" badges. */
  derivedFields: DeltaTarget[];
  /** Rules the engine couldn't apply, with reasons — for UI warnings. */
  skipped: Array<{ ruleId: string; target: DeltaTarget; reason: SkipReason }>;
}

// ============================================================
// Constants — clamp ranges per the plan §1.2
// ============================================================

const CLAMP = {
  sets:        { min: 1, max: 20 },
  repMin:      { min: 1, max: 50 },
  repMax:      { min: 1, max: 50 },
  rir:         { min: 0, max: 10 },
  rpe:         { min: 1, max: 10 },
  tempoDigit:  { min: 0, max: 9 },
} as const;

/**
 * Tempo positions that are not numeric digits. Coach-set per slot; the
 * engine NEVER auto-converts digits ↔ letters (D2).
 */
const TEMPO_LITERAL_TOKENS = new Set(['A', 'X']);

/** Targets that can be scoped to individual sets (Phase 1d). `sets` cannot. */
export type PerSetTarget = 'repMin' | 'repMax' | 'tempo' | 'rir' | 'rpe' | 'instructions';

/**
 * The `SetPrescription` field a per-set rule writes for each target. Note the
 * slot-level → per-set name shifts: slot `repMin`/`repMax` live as
 * `rep_range_min`/`rep_range_max` per set, and a per-set `instructions` rule
 * writes the set's `notes` (distinct from the exercise-level instruction cue).
 */
export const PER_SET_PRESCRIPTION_FIELD: Record<PerSetTarget, keyof SetPrescription> = {
  repMin: 'rep_range_min',
  repMax: 'rep_range_max',
  tempo: 'tempo',
  rir: 'rir',
  rpe: 'rpe',
  instructions: 'notes',
} as const;

/**
 * The slot-level scalar field that scope:'all' also mirrors. `instructions`
 * has no per-set-equivalent slot scalar (its slot-level home is
 * `exercise.instructions`, handled separately), so it returns null — per-set
 * instructions rules only ever touch `setsDetail[n].notes`.
 */
const PER_SET_SLOT_FIELD: Record<PerSetTarget, keyof MuscleSlotData | null> = {
  repMin: 'repMin',
  repMax: 'repMax',
  tempo: 'tempo',
  rir: 'rir',
  rpe: 'rpe',
  instructions: null,
} as const;

/**
 * True when a rule carries a per-set scope (any kind, including 'all'). `rir`/
 * `rpe` always do; `repMin`/`repMax`/`tempo`/`instructions` do only when the
 * coach opted into per-set mode. A scoped rule routes through `applyPerSetRule`.
 */
function isScopedRule(rule: WeeklyDeltaRule): rule is WeeklyDeltaRule & { scope: SetScope } {
  return 'scope' in rule && rule.scope !== undefined;
}

// ============================================================
// Phase 2 — chaining: windows, overlap, per-field trajectory
// ============================================================

/**
 * Targets the chaining engine walks week-by-week, carrying a running value
 * across window boundaries. `instructions` is intentionally excluded — text
 * has no running-accumulator semantics; multiple instructions rules (rare)
 * apply per-window independently via the legacy per-rule path.
 */
const CHAINABLE_TARGETS: ReadonlySet<DeltaTarget> = new Set<DeltaTarget>([
  'sets', 'repMin', 'repMax', 'rir', 'rpe', 'tempo',
]);

/** Context the chaining path needs: program length + per-week deload flags. */
export interface ResolveCtx {
  totalWeeks: number;
  /** length === totalWeeks; index i flags week (i+1) as a deload. */
  isDeloadByWeek: boolean[];
}

/** 1-indexed first week a rule applies (default W2). */
function windowStartWeek(rule: WeeklyDeltaRule): number {
  return rule.activeWeekStart ?? 2;
}
/** 1-indexed last week a rule applies (Infinity when open-ended). */
function windowEndWeek(rule: WeeklyDeltaRule): number {
  return rule.activeWeekEnd ?? Infinity;
}

/**
 * True when two rules' [start, end] windows overlap on any week. Open-ended
 * windows (no `activeWeekEnd`) extend to Infinity and "consume the rest", so
 * any later-starting window collides with them.
 */
export function windowsOverlap(a: WeeklyDeltaRule, b: WeeklyDeltaRule): boolean {
  return windowStartWeek(a) <= windowEndWeek(b) && windowStartWeek(b) <= windowEndWeek(a);
}

/**
 * Find the first overlapping pair among rules that share a target. Returns the
 * two rule ids (and target) or null when every same-target pair is disjoint.
 * Used by the editor/panel to reject overlapping windows (2a).
 */
export function findWindowOverlap(
  rules: WeeklyDeltaRule[],
): { target: DeltaTarget; a: string; b: string } | null {
  const byTarget = new Map<DeltaTarget, WeeklyDeltaRule[]>();
  for (const r of rules) {
    const arr = byTarget.get(r.target) ?? [];
    arr.push(r);
    byTarget.set(r.target, arr);
  }
  for (const [target, group] of byTarget) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (windowsOverlap(group[i], group[j])) {
          return { target, a: group[i].id, b: group[j].id };
        }
      }
    }
  }
  return null;
}

/**
 * Walk weeks 1..totalWeeks carrying a running value, chaining across the
 * (non-overlapping) windows in `rulesForTarget`. Returns the per-week value
 * array (index 0 = W1 = base).
 *
 * Semantics (Phase 2b/2c):
 *  - Before the first window: hold `base` (running hasn't advanced).
 *  - Inside a window: advance `running` one step per week, chained from the
 *    prior week's running (NOT from base) — reusing applyRule's per-step
 *    arithmetic/clamp/tempo logic for DRY.
 *  - Gaps between windows and after the last window: hold `running` (plateau).
 *  - Deload weeks: TWO tracks. The true `running` always advances (ignores
 *    deload) so the chain continues underneath; the *emitted* value applies the
 *    active rule's DeloadBehavior (skip → hold prior, apply → stepped, invert →
 *    reverse step, fixed → fixedValue). A deload is a one-week dip, not a
 *    permanent lowering.
 */
export function resolveFieldTrajectory(
  base: number | string | undefined,
  rulesForTarget: WeeklyDeltaRule[],
  totalWeeks: number,
  isDeloadByWeek: boolean[],
): (number | string | undefined)[] {
  const out: (number | string | undefined)[] = new Array(totalWeeks);
  out[0] = base;
  let running: number | string | undefined = base;
  // Earliest-start first so the per-week lookup is deterministic.
  const sorted = [...rulesForTarget].sort((a, b) => windowStartWeek(a) - windowStartWeek(b));

  for (let wi = 1; wi < totalWeeks; wi++) {
    const weekNum = wi + 1;
    const rule = sorted.find((r) => weekNum >= windowStartWeek(r) && weekNum <= windowEndWeek(r));
    if (!rule) {
      out[wi] = running; // hold: base before first window; plateau in gaps / after last
      continue;
    }
    // oneStepOffset == the rule's startOffset → applyRule yields effectiveSteps=1,
    // i.e. exactly one increment applied to `running`.
    const oneStepOffset = windowStartWeek(rule) - 1;
    const isDl = !!isDeloadByWeek[wi];
    const prevRunning = running;
    const trueRes = applyRule(rule, prevRunning, oneStepOffset, false);
    if (trueRes.ok) running = trueRes.value; // chain continues regardless of deload
    if (isDl) {
      const emitRes = applyRule(rule, prevRunning, oneStepOffset, true);
      out[wi] = emitRes.ok ? emitRes.value : prevRunning; // skip/literal → hold prior
    } else {
      out[wi] = trueRes.ok ? trueRes.value : prevRunning;
    }
  }
  return out;
}

/** Does a rule write the slot-level scalar for its target? (sets always; unscoped or scope:'all'.) */
function ruleWritesSlotLevel(rule: WeeklyDeltaRule): boolean {
  if (rule.target === 'sets') return true;
  if (!isScopedRule(rule)) return true;
  return rule.scope.kind === 'all';
}

/** Does a rule write setsDetail entry `setIndex` (0-based) of `setCount`? */
function ruleWritesSet(rule: WeeklyDeltaRule, setIndex: number, setCount: number): boolean {
  if (rule.target === 'sets' || !isScopedRule(rule)) return false;
  const s = rule.scope;
  switch (s.kind) {
    case 'all':         return true;
    case 'first':       return setIndex === 0;
    case 'last':        return setIndex === setCount - 1;
    case 'index':       return setIndex === s.setNumber - 1;
    case 'set_numbers': return s.setNumbers.includes(setIndex + 1);
  }
}

/**
 * Resolve a target that has ≥2 rules by chaining per LOCATION (Phase 2b).
 * Locations: the slot-level scalar (for `sets`, and for unscoped/`all` rules)
 * plus each setsDetail entry whose value a rule's scope covers. Each location
 * builds its own trajectory from the rules that touch it and writes
 * `traj[weekOffset]`.
 */
function applyChainedTarget(
  slot: MuscleSlotData,
  target: DeltaTarget,
  rules: WeeklyDeltaRule[],
  weekOffset: number,
  ctx: ResolveCtx,
  derived: DeltaTarget[],
  skipped: SlotResolveResult['skipped'],
): MuscleSlotData {
  const { totalWeeks, isDeloadByWeek } = ctx;

  // `sets` — slot-level count drives setsDetail length (uses the covering
  // rule's addedSetSpec, Phase 1e).
  if (target === 'sets') {
    const traj = resolveFieldTrajectory(slot.sets, rules, totalWeeks, isDeloadByWeek);
    const newCount = traj[weekOffset] as number;
    const weekNum = weekOffset + 1;
    const covering = [...rules]
      .sort((a, b) => windowStartWeek(a) - windowStartWeek(b))
      .find((r) => weekNum >= windowStartWeek(r) && weekNum <= windowEndWeek(r));
    const addedSetSpec = covering && covering.target === 'sets' ? covering.addedSetSpec : undefined;
    const newSetsDetail = slot.setsDetail
      ? syncSetsDetailToCount(slot.setsDetail, newCount, addedSetSpec)
      : undefined;
    derived.push('sets');
    return { ...slot, sets: newCount, setsDetail: newSetsDetail };
  }

  const slotField = PER_SET_SLOT_FIELD[target as PerSetTarget];
  const setField = PER_SET_PRESCRIPTION_FIELD[target as PerSetTarget];
  const nextSlot: MuscleSlotData = { ...slot };
  const nextSetsDetail = slot.setsDetail ? [...slot.setsDetail] : undefined;
  let touched = false;
  let lastSkipReason: SkipReason | null = null;

  // Slot-level location.
  if (slotField !== null) {
    const slotRules = rules.filter(ruleWritesSlotLevel);
    if (slotRules.length > 0) {
      const base = slot[slotField];
      if (base !== undefined && base !== null) {
        const traj = resolveFieldTrajectory(base as number | string, slotRules, totalWeeks, isDeloadByWeek);
        (nextSlot as Record<string, unknown>)[slotField] = traj[weekOffset];
        touched = true;
      } else {
        lastSkipReason = 'no_base';
      }
    }
  }

  // Per-set locations.
  if (nextSetsDetail && nextSetsDetail.length > 0) {
    const count = nextSetsDetail.length;
    for (let i = 0; i < count; i++) {
      const setRules = rules.filter((r) => ruleWritesSet(r, i, count));
      if (setRules.length === 0) continue;
      const base = nextSetsDetail[i][setField];
      if (base === undefined || base === null) {
        lastSkipReason = lastSkipReason ?? 'no_base';
        continue;
      }
      const traj = resolveFieldTrajectory(base as number | string, setRules, totalWeeks, isDeloadByWeek);
      nextSetsDetail[i] = { ...nextSetsDetail[i], [setField]: traj[weekOffset] } as SetPrescription;
      touched = true;
    }
  } else if (rules.some((r) => isScopedRule(r) && r.scope.kind !== 'all')) {
    // Per-set-only rules with no setsDetail to write into.
    lastSkipReason = lastSkipReason ?? 'missing_setsdetail';
  }

  if (!touched) {
    skipped.push({ ruleId: rules[0].id, target, reason: lastSkipReason ?? 'no_base' });
    return slot;
  }
  derived.push(target);
  return { ...nextSlot, setsDetail: nextSetsDetail };
}

// ============================================================
// Helpers
// ============================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.length > 0) {
    const parsed = parseFloat(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

type TempoPart =
  | { kind: 'digit';   value: number }
  | { kind: 'literal'; value: string }
  | null;

/**
 * Parse a 4-char tempo string into positions. Missing/short strings pad
 * with `null` so position access is always safe.
 */
function parseTempo(tempo: string | undefined): [TempoPart, TempoPart, TempoPart, TempoPart] {
  const out: TempoPart[] = [null, null, null, null];
  if (!tempo) return out as [TempoPart, TempoPart, TempoPart, TempoPart];
  for (let i = 0; i < 4 && i < tempo.length; i++) {
    const c = tempo[i].toUpperCase();
    if (TEMPO_LITERAL_TOKENS.has(c)) {
      out[i] = { kind: 'literal', value: c };
    } else if (c >= '0' && c <= '9') {
      out[i] = { kind: 'digit', value: parseInt(c, 10) };
    } else {
      out[i] = null;
    }
  }
  return out as [TempoPart, TempoPart, TempoPart, TempoPart];
}

function serializeTempo(parts: TempoPart[]): string {
  return parts
    .map((p) => {
      if (p === null) return '0';
      if (p.kind === 'digit') return String(p.value);
      return p.value;
    })
    .join('');
}

/**
 * Sync setsDetail length to a new sets count. Trims from the end; extends to
 * reach `targetCount`.
 *
 * Phase 1e: when `addedSetSpec` is provided, new entries are prescribed from
 * it — merged onto the last entry as a sensible default so unspecified fields
 * (weight, rest, …) still carry over while the coach's chosen reps/RIR/tempo/
 * notes win. Absent `addedSetSpec`, the historical clone-last behavior holds.
 */
function syncSetsDetailToCount(
  setsDetail: SetPrescription[],
  targetCount: number,
  addedSetSpec?: Partial<SetPrescription>,
): SetPrescription[] {
  if (setsDetail.length === targetCount) return setsDetail;
  if (setsDetail.length > targetCount) {
    return setsDetail.slice(0, targetCount).map((s, i) => ({ ...s, set_number: i + 1 }));
  }
  if (setsDetail.length === 0) {
    // No template to clone from — fabricate entries from the spec (or empty).
    const out: SetPrescription[] = [];
    for (let i = 0; i < targetCount; i++) out.push({ ...addedSetSpec, set_number: i + 1 });
    return out;
  }
  const last = setsDetail[setsDetail.length - 1];
  const out = [...setsDetail];
  for (let i = setsDetail.length; i < targetCount; i++) {
    // Clone-last as the default base, then overlay the coach's added-set spec.
    out.push({ ...last, ...addedSetSpec, set_number: i + 1 });
  }
  return out;
}

function resolveSetIndex(scope: SetScope, setCount: number): number {
  switch (scope.kind) {
    case 'first':       return 0;
    case 'last':        return setCount - 1;
    case 'index':       return scope.setNumber - 1;
    case 'all':         return -1; // sentinel — caller routes to slot-level
    case 'set_numbers': return -1; // handled by the caller's iteration path
  }
}

// ============================================================
// applyRule — single rule, single base value
// ============================================================

/**
 * Apply one rule to one base value at a given week offset.
 *
 *   weekOffset is 0-indexed against the program: W1 = 0, W2 = 1, W3 = 2.
 *   The math is anchored to the W1 base, never chained from the prior week.
 *
 * Pure function. The caller decides where to write the result.
 */
export function applyRule(
  rule: WeeklyDeltaRule,
  base: number | string | undefined,
  weekOffset: number,
  isDeload: boolean,
): ApplyResult {
  // Active week window — engine supports it cheaply per D13.
  const startOffset = (rule.activeWeekStart ?? 2) - 1;     // default W2 → offset 1
  const endOffset = rule.activeWeekEnd !== undefined ? rule.activeWeekEnd - 1 : Infinity;
  // Before the window opens → dormant (field falls back to W1 base).
  if (weekOffset < startOffset) {
    return { ok: false, skipped: true, reason: 'out_of_active_range' };
  }

  // Hold-at-last (Phase 1b): once the window closes, do NOT snap back to base.
  // Clamp the step count to the window's last in-range week so the value
  // plateaus at whatever it reached on `endOffset`.
  const isHoldZone = weekOffset > endOffset;
  const clampedOffset = isHoldZone ? endOffset : weekOffset;

  // Steps relative to the first applied week. With default start=2, a rule
  // applied at W2 (offset 1) gets steps=1 → matches Hasan's mental model
  // (W2 = base + amount × 1).
  const effectiveSteps = clampedOffset - startOffset + 1;

  // Deload handling — runs before arithmetic.
  const deloadMode: DeloadBehavior = rule.deload ?? 'skip';
  if (isDeload) {
    if (deloadMode === 'skip') {
      return { ok: false, skipped: true, reason: 'deload_skip' };
    }
    if (deloadMode === 'fixed') {
      if (rule.deloadFixedValue === undefined) {
        return { ok: false, skipped: true, reason: 'out_of_range' };
      }
      return { ok: true, value: rule.deloadFixedValue };
    }
    // 'apply' falls through; 'invert' handled in arithmetic.
  }

  // Apply per target.
  switch (rule.target) {
    case 'sets': {
      const num = toFiniteNumber(base);
      if (num === null) return { ok: false, skipped: true, reason: 'no_base' };
      const amount = isDeload && deloadMode === 'invert' ? -rule.amount : rule.amount;
      return { ok: true, value: clamp(num + amount * effectiveSteps, CLAMP.sets.min, CLAMP.sets.max) };
    }

    case 'repMin':
    case 'repMax': {
      const num = toFiniteNumber(base);
      if (num === null) return { ok: false, skipped: true, reason: 'no_base' };
      const amount = isDeload && deloadMode === 'invert' ? -rule.amount : rule.amount;
      const range = CLAMP[rule.target];
      return { ok: true, value: clamp(num + amount * effectiveSteps, range.min, range.max) };
    }

    case 'rir':
    case 'rpe': {
      const num = toFiniteNumber(base);
      if (num === null) return { ok: false, skipped: true, reason: 'no_base' };
      const amount = isDeload && deloadMode === 'invert' ? -rule.amount : rule.amount;
      const range = CLAMP[rule.target];
      return { ok: true, value: clamp(num + amount * effectiveSteps, range.min, range.max) };
    }

    case 'tempo': {
      if (typeof base !== 'string' || base.length === 0) {
        return { ok: false, skipped: true, reason: 'no_base' };
      }
      const parts = parseTempo(base);
      const pos = parts[rule.position];
      if (pos === null) return { ok: false, skipped: true, reason: 'no_base' };
      if (pos.kind === 'literal') {
        return { ok: false, skipped: true, reason: 'literal_token' };
      }
      const amount = isDeload && deloadMode === 'invert' ? -rule.amount : rule.amount;
      const newDigit = clamp(
        pos.value + amount * effectiveSteps,
        CLAMP.tempoDigit.min,
        CLAMP.tempoDigit.max,
      );
      const newParts: TempoPart[] = [...parts];
      newParts[rule.position] = { kind: 'digit', value: newDigit };
      return { ok: true, value: serializeTempo(newParts) };
    }

    case 'instructions': {
      if (rule.op === 'append') {
        const baseStr = typeof base === 'string' ? base : '';
        return { ok: true, value: baseStr ? `${baseStr}\n${rule.text}` : rule.text };
      }
      // op === 'replace_per_week'
      const idx = effectiveSteps - 1;
      const candidate = rule.texts[idx];
      if (candidate !== undefined) {
        return { ok: true, value: candidate };
      }
      // Past the window end (Phase 1b): hold the last provided text instead of
      // snapping back. Inside an open-ended window with the texts array simply
      // exhausted, keep the historical out_of_range skip.
      if (isHoldZone && rule.texts.length > 0) {
        return { ok: true, value: rule.texts[rule.texts.length - 1] };
      }
      return { ok: false, skipped: true, reason: 'out_of_range' };
    }
  }
}

// ============================================================
// resolveSlotForWeek — apply all rules to a slot, respect overrides
// ============================================================

/**
 * Apply every active rule from a W1 baseSlot to produce the W(weekOffset+1) slot.
 *
 * Override protection: fields listed in `manualOverrides` are LEFT UNTOUCHED.
 * Coach-edited cells survive recompute.
 *
 * setsDetail handling: when a sets rule changes the count, setsDetail is
 * extended/trimmed to match (clones the last entry on extend). Per-set
 * scoped rules (rir/rpe with scope !== 'all') only run when setsDetail is
 * populated; otherwise skipped with `missing_setsdetail`.
 */
export function resolveSlotForWeek(
  baseSlot: MuscleSlotData,
  rules: WeeklyDeltaRule[],
  weekOffset: number,
  isDeload: boolean,
  manualOverrides: DeltaTarget[] = [],
  ctx?: ResolveCtx,
): SlotResolveResult {
  let workingSlot: MuscleSlotData = {
    ...baseSlot,
    // Detach mutable refs so the caller's W1 base isn't accidentally clobbered.
    setsDetail: baseSlot.setsDetail ? baseSlot.setsDetail.map((s) => ({ ...s })) : undefined,
    exercise: baseSlot.exercise ? { ...baseSlot.exercise } : undefined,
  };
  const derivedFields: DeltaTarget[] = [];
  const skipped: SlotResolveResult['skipped'] = [];

  // Phase 2: targets with ≥2 chainable rules are resolved by the chaining
  // walker (needs ctx). Everything else — single-rule targets and
  // instructions — flows through the unchanged per-rule path, so all Phase-1
  // behavior (and its tests) is preserved byte-for-byte. Without ctx, NO target
  // chains (the legacy path runs for all rules) — which can silently
  // mis-resolve multi-window rules, so warn loudly in dev when that happens.
  const counts = new Map<DeltaTarget, number>();
  for (const r of rules) counts.set(r.target, (counts.get(r.target) ?? 0) + 1);
  const chainedTargets = new Set<DeltaTarget>();
  for (const [t, c] of counts) {
    if (c < 2 || !CHAINABLE_TARGETS.has(t)) continue;
    if (ctx) {
      chainedTargets.add(t);
    } else if (import.meta.env?.DEV) {
      console.warn(
        `[deltaEngine] multi-window chaining needs ctx — falling back, values may be wrong (target: ${t})`,
      );
    }
  }

  for (const t of chainedTargets) {
    if (manualOverrides.includes(t)) continue; // override masks the write; chain not fed
    const rulesForTarget = rules.filter((r) => r.target === t);
    workingSlot = applyChainedTarget(workingSlot, t, rulesForTarget, weekOffset, ctx!, derivedFields, skipped);
  }

  for (const rule of rules) {
    if (chainedTargets.has(rule.target)) continue; // handled by the chaining walker
    if (manualOverrides.includes(rule.target)) {
      continue; // Manual override wins; rule does not write.
    }
    workingSlot = applyRuleToSlot(workingSlot, rule, weekOffset, isDeload, derivedFields, skipped);
  }

  return { slot: workingSlot, derivedFields, skipped };
}

function applyRuleToSlot(
  slot: MuscleSlotData,
  rule: WeeklyDeltaRule,
  weekOffset: number,
  isDeload: boolean,
  derived: DeltaTarget[],
  skipped: SlotResolveResult['skipped'],
): MuscleSlotData {
  // --- Per-set routing (Phase 1c/1d): rir/rpe always; repMin/repMax/tempo/
  // instructions only when the coach opted into a per-set scope. `sets`
  // (count) is never per-set. ---
  if (rule.target !== 'sets' && isScopedRule(rule)) {
    return applyPerSetRule(slot, rule, weekOffset, isDeload, derived, skipped);
  }

  // --- Slot-level scalars: sets, repMin, repMax, tempo ---
  if (rule.target === 'sets') {
    const result = applyRule(rule, slot.sets, weekOffset, isDeload);
    if (!result.ok) {
      skipped.push({ ruleId: rule.id, target: rule.target, reason: result.reason });
      return slot;
    }
    const newCount = result.value as number;
    const newSetsDetail = slot.setsDetail
      ? syncSetsDetailToCount(slot.setsDetail, newCount, rule.addedSetSpec)
      : undefined;
    derived.push('sets');
    return { ...slot, sets: newCount, setsDetail: newSetsDetail };
  }

  if (rule.target === 'repMin' || rule.target === 'repMax') {
    const base = rule.target === 'repMin' ? slot.repMin : slot.repMax;
    const result = applyRule(rule, base, weekOffset, isDeload);
    if (!result.ok) {
      skipped.push({ ruleId: rule.id, target: rule.target, reason: result.reason });
      return slot;
    }
    derived.push(rule.target);
    return { ...slot, [rule.target]: result.value as number };
  }

  if (rule.target === 'tempo') {
    const result = applyRule(rule, slot.tempo, weekOffset, isDeload);
    if (!result.ok) {
      skipped.push({ ruleId: rule.id, target: rule.target, reason: result.reason });
      return slot;
    }
    derived.push('tempo');
    return { ...slot, tempo: result.value as string };
  }

  // Scoped rir/rpe (always) and scoped repMin/repMax/tempo/instructions are
  // routed to applyPerSetRule above, before this point.

  // --- Slot-level instructions live on slot.exercise.instructions ---
  if (rule.target === 'instructions') {
    const base = slot.exercise?.instructions ?? '';
    const result = applyRule(rule, base, weekOffset, isDeload);
    if (!result.ok) {
      skipped.push({ ruleId: rule.id, target: rule.target, reason: result.reason });
      return slot;
    }
    if (!slot.exercise) {
      // No exercise assigned yet — can't write instructions.
      skipped.push({ ruleId: rule.id, target: rule.target, reason: 'no_base' });
      return slot;
    }
    derived.push('instructions');
    const nextExercise: SlotExercise = { ...slot.exercise, instructions: result.value as string };
    return { ...slot, exercise: nextExercise };
  }

  return slot;
}

/**
 * Apply a per-set-scoped rule. Handles rir/rpe (always per-set) plus
 * repMin/repMax/tempo/instructions when the coach opted into a scope (Phase
 * 1d). The target's per-set home is `PER_SET_PRESCRIPTION_FIELD[target]`; its
 * slot-level scalar mirror (for scope:'all') is `PER_SET_SLOT_FIELD[target]`
 * (null for instructions, which only writes `setsDetail[n].notes`).
 */
function applyPerSetRule(
  slot: MuscleSlotData,
  rule: WeeklyDeltaRule & { scope: SetScope },
  weekOffset: number,
  isDeload: boolean,
  derived: DeltaTarget[],
  skipped: SlotResolveResult['skipped'],
): MuscleSlotData {
  const target = rule.target as PerSetTarget;
  const setField = PER_SET_PRESCRIPTION_FIELD[target];
  const slotField = PER_SET_SLOT_FIELD[target];
  // `notes` (instructions) may legitimately start empty — applyRule's append/
  // replace ops treat a missing base as "". Numeric/tempo targets need a base.
  const allowEmptyBase = target === 'instructions';

  // Scope 'all' — write to BOTH the slot-level scalar (when one exists and is
  // set) AND every setsDetail entry (when present). The popover renders
  // setsDetail values, so writing only to slot-level leaves the UI stale even
  // though the rule "ran". "All sets" means every per-set entry gets the delta,
  // and the slot-level scalar (a default for the next set added) tracks along.
  if (rule.scope.kind === 'all') {
    const nextSlot: MuscleSlotData = { ...slot };
    let nextSetsDetail = slot.setsDetail;
    let touched = false;
    let lastSkipReason: SkipReason | null = null;

    // Slot-level scalar path (skipped for instructions — slotField is null).
    if (slotField !== null) {
      const cur = slot[slotField];
      if (cur !== undefined && cur !== null) {
        const result = applyRule(rule, cur as number | string, weekOffset, isDeload);
        if (result.ok) {
          (nextSlot as Record<string, unknown>)[slotField] = result.value;
          touched = true;
        } else {
          lastSkipReason = result.reason;
        }
      }
    }

    // setsDetail fan-out path.
    if (slot.setsDetail && slot.setsDetail.length > 0) {
      let anyEntryApplied = false;
      nextSetsDetail = slot.setsDetail.map((s) => {
        const setBase = s[setField];
        if ((setBase === undefined || setBase === null) && !allowEmptyBase) {
          lastSkipReason = lastSkipReason ?? 'no_base';
          return s;
        }
        const result = applyRule(rule, setBase as number | string | undefined, weekOffset, isDeload);
        if (!result.ok) {
          lastSkipReason = result.reason;
          return s;
        }
        anyEntryApplied = true;
        return { ...s, [setField]: result.value } as SetPrescription;
      });
      if (anyEntryApplied) touched = true;
    }

    if (!touched) {
      skipped.push({ ruleId: rule.id, target: rule.target, reason: lastSkipReason ?? 'no_base' });
      return slot;
    }
    derived.push(rule.target);
    return { ...nextSlot, setsDetail: nextSetsDetail };
  }

  // Specific-set scopes (first / last / index / set_numbers) need setsDetail.
  if (!slot.setsDetail || slot.setsDetail.length === 0) {
    skipped.push({ ruleId: rule.id, target: rule.target, reason: 'missing_setsdetail' });
    return slot;
  }

  // Resolve the 0-indexed targets. set_numbers iterates; the others are single.
  const indices =
    rule.scope.kind === 'set_numbers'
      ? rule.scope.setNumbers.map((n) => n - 1)
      : [resolveSetIndex(rule.scope, slot.setsDetail.length)];

  const nextSetsDetail = [...slot.setsDetail];
  let anyApplied = false;
  let lastSkipReason: SkipReason | null = null;
  for (const idx of indices) {
    if (idx < 0 || idx >= nextSetsDetail.length) {
      lastSkipReason = 'out_of_range';
      continue;
    }
    const base = nextSetsDetail[idx][setField];
    if ((base === undefined || base === null) && !allowEmptyBase) {
      lastSkipReason = 'no_base';
      continue;
    }
    const result = applyRule(rule, base as number | string | undefined, weekOffset, isDeload);
    if (!result.ok) {
      lastSkipReason = result.reason;
      continue;
    }
    nextSetsDetail[idx] = { ...nextSetsDetail[idx], [setField]: result.value } as SetPrescription;
    anyApplied = true;
  }

  if (!anyApplied) {
    skipped.push({ ruleId: rule.id, target: rule.target, reason: lastSkipReason ?? 'out_of_range' });
    return slot;
  }
  derived.push(rule.target);
  return { ...slot, setsDetail: nextSetsDetail };
}

// ============================================================
// Defaults factory (D11 — pre-fill sensible amounts)
// ============================================================

/** Generate a unique-ish id for a new rule. Falls back when crypto isn't available (test env). */
function newRuleId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Deep-clone a rule and stamp it with a fresh id. Rules are pure JSON (no
 * functions / Dates), so a JSON round-trip is a safe, dependency-free deep copy
 * of nested `scope` / `texts` / `setNumbers` / `addedSetSpec`. A fresh id keeps
 * pasted rules from sharing identity with the source slot's rules (ids are React
 * keys and the overlap-map key within a slot).
 */
export function cloneRuleWithNewId(rule: WeeklyDeltaRule): WeeklyDeltaRule {
  const cloned = JSON.parse(JSON.stringify(rule)) as WeeklyDeltaRule;
  cloned.id = newRuleId();
  return cloned;
}

/**
 * Merge `sourceRules` onto `targetRules` for the "copy progression" paste.
 *
 * Conflict policy = MERGE per target: for every DeltaTarget the source carries
 * a rule for, the target's existing rule(s) for that target are REPLACED by
 * fresh-id clones of the source's rules. Targets the source doesn't touch keep
 * the target's own rules untouched.
 *
 * Invariants preserved:
 *  - Single-rule-per-target / no overlapping windows (D12): we never mix source
 *    and target rules for the same target — the whole target is swapped — so the
 *    source's already-valid (non-overlapping) windows carry over intact and the
 *    target's surviving rules are for disjoint targets.
 *  - Pasted rules get fresh ids (no cross-slot id collisions).
 *
 * Pure function — does not mutate either input.
 */
export function mergeDeltaRules(
  targetRules: WeeklyDeltaRule[],
  sourceRules: WeeklyDeltaRule[],
): WeeklyDeltaRule[] {
  const sourceTargets = new Set(sourceRules.map((r) => r.target));
  const kept = targetRules.filter((r) => !sourceTargets.has(r.target));
  const stamped = sourceRules.map(cloneRuleWithNewId);
  return [...kept, ...stamped];
}

/**
 * Build a rule pre-filled with the sensible default per D11. Coach can tweak
 * before saving. Tempo defaults to position 0 (eccentric, the most common
 * target).
 */
export function createDefaultRule(target: DeltaTarget): WeeklyDeltaRule {
  const id = newRuleId();
  const deload: DeloadBehavior = 'skip';

  switch (target) {
    case 'sets':
      return { id, target: 'sets', op: 'add', amount: 1, deload };
    case 'repMin':
      return { id, target: 'repMin', op: 'add', amount: 1, deload };
    case 'repMax':
      return { id, target: 'repMax', op: 'add', amount: 1, deload };
    case 'tempo':
      return { id, target: 'tempo', op: 'digit_add', position: 0, amount: -1, deload };
    case 'rir':
      return { id, target: 'rir', op: 'add', amount: -1, scope: { kind: 'all' }, deload };
    case 'rpe':
      return { id, target: 'rpe', op: 'add', amount: 0.5, scope: { kind: 'all' }, deload };
    case 'instructions':
      return { id, target: 'instructions', op: 'append', text: '', deload };
  }
}
