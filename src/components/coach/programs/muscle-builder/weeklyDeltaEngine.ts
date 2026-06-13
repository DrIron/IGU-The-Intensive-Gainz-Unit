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
  | { kind: 'index'; setNumber: number };       // setsDetail[setNumber - 1] (1-indexed)

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
  | (BaseRule & { target: 'sets';   op: 'add'; amount: number })
  | (BaseRule & { target: 'repMin' | 'repMax'; op: 'add'; amount: number })
  | (BaseRule & { target: 'rir' | 'rpe'; op: 'add'; amount: number; scope: SetScope })
  | (BaseRule & { target: 'tempo'; op: 'digit_add'; position: 0 | 1 | 2 | 3; amount: number })
  | (BaseRule & { target: 'instructions'; op: 'append'; text: string })
  | (BaseRule & { target: 'instructions'; op: 'replace_per_week'; texts: string[] });

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
 * Sync setsDetail length to a new sets count. Trims from the end; extends
 * by cloning the last entry (preserving its prescription). When sets goes
 * from 3 → 4, the 4th set inherits the 3rd set's reps/weight/etc.
 */
function syncSetsDetailToCount(
  setsDetail: SetPrescription[],
  targetCount: number,
): SetPrescription[] {
  if (setsDetail.length === targetCount) return setsDetail;
  if (setsDetail.length > targetCount) {
    return setsDetail.slice(0, targetCount).map((s, i) => ({ ...s, set_number: i + 1 }));
  }
  if (setsDetail.length === 0) {
    // No template to clone from — fabricate empty entries.
    const out: SetPrescription[] = [];
    for (let i = 0; i < targetCount; i++) out.push({ set_number: i + 1 });
    return out;
  }
  const last = setsDetail[setsDetail.length - 1];
  const out = [...setsDetail];
  for (let i = setsDetail.length; i < targetCount; i++) {
    out.push({ ...last, set_number: i + 1 });
  }
  return out;
}

function resolveSetIndex(scope: SetScope, setCount: number): number {
  switch (scope.kind) {
    case 'first':  return 0;
    case 'last':   return setCount - 1;
    case 'index':  return scope.setNumber - 1;
    case 'all':    return -1; // sentinel — caller routes to slot-level
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
  if (weekOffset < startOffset || weekOffset > endOffset) {
    return { ok: false, skipped: true, reason: 'out_of_active_range' };
  }

  // Steps relative to the first applied week. With default start=2, a rule
  // applied at W2 (offset 1) gets steps=1 → matches Hasan's mental model
  // (W2 = base + amount × 1).
  const effectiveSteps = weekOffset - startOffset + 1;

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
      if (candidate === undefined) {
        return { ok: false, skipped: true, reason: 'out_of_range' };
      }
      return { ok: true, value: candidate };
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
): SlotResolveResult {
  let workingSlot: MuscleSlotData = {
    ...baseSlot,
    // Detach mutable refs so the caller's W1 base isn't accidentally clobbered.
    setsDetail: baseSlot.setsDetail ? baseSlot.setsDetail.map((s) => ({ ...s })) : undefined,
    exercise: baseSlot.exercise ? { ...baseSlot.exercise } : undefined,
  };
  const derivedFields: DeltaTarget[] = [];
  const skipped: SlotResolveResult['skipped'] = [];

  for (const rule of rules) {
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
  // --- Slot-level scalars: sets, repMin, repMax, tempo ---
  if (rule.target === 'sets') {
    const result = applyRule(rule, slot.sets, weekOffset, isDeload);
    if (!result.ok) {
      skipped.push({ ruleId: rule.id, target: rule.target, reason: result.reason });
      return slot;
    }
    const newCount = result.value as number;
    const newSetsDetail = slot.setsDetail ? syncSetsDetailToCount(slot.setsDetail, newCount) : undefined;
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

  // --- Scoped per-set fields: rir, rpe ---
  if (rule.target === 'rir' || rule.target === 'rpe') {
    return applyPerSetRule(slot, rule, weekOffset, isDeload, derived, skipped);
  }

  // --- Instructions live on slot.exercise.instructions ---
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

function applyPerSetRule(
  slot: MuscleSlotData,
  rule: Extract<WeeklyDeltaRule, { target: 'rir' | 'rpe' }>,
  weekOffset: number,
  isDeload: boolean,
  derived: DeltaTarget[],
  skipped: SlotResolveResult['skipped'],
): MuscleSlotData {
  const fieldKey = rule.target; // 'rir' | 'rpe'

  // Scope 'all' — write to BOTH slot-level (when present) AND every setsDetail
  // entry (when present). The popover renders setsDetail values, so writing
  // only to slot-level leaves the UI stale even though the rule "ran". This
  // matches coach mental model: "All sets" means every per-set entry gets
  // the delta, and the slot-level scalar (which is conceptually a default for
  // the next set added) tracks alongside.
  if (rule.scope.kind === 'all') {
    let nextSlotVal: number | undefined = slot[fieldKey];
    let nextSetsDetail = slot.setsDetail;
    let touched = false;
    let lastSkipReason: SkipReason | null = null;

    // Slot-level path.
    if (slot[fieldKey] !== undefined && slot[fieldKey] !== null) {
      const result = applyRule(rule, slot[fieldKey], weekOffset, isDeload);
      if (result.ok) {
        nextSlotVal = result.value as number;
        touched = true;
      } else {
        lastSkipReason = result.reason;
      }
    }

    // setsDetail fan-out path.
    if (slot.setsDetail && slot.setsDetail.length > 0) {
      let anyEntryApplied = false;
      nextSetsDetail = slot.setsDetail.map((s) => {
        const setBase = s[fieldKey];
        if (setBase === undefined || setBase === null) {
          lastSkipReason = lastSkipReason ?? 'no_base';
          return s;
        }
        const result = applyRule(rule, setBase, weekOffset, isDeload);
        if (!result.ok) {
          lastSkipReason = result.reason;
          return s;
        }
        anyEntryApplied = true;
        return { ...s, [fieldKey]: result.value as number };
      });
      if (anyEntryApplied) touched = true;
    }

    if (!touched) {
      skipped.push({ ruleId: rule.id, target: rule.target, reason: lastSkipReason ?? 'no_base' });
      return slot;
    }
    derived.push(rule.target);
    return { ...slot, [fieldKey]: nextSlotVal, setsDetail: nextSetsDetail };
  }

  // Per-set scope needs setsDetail.
  if (!slot.setsDetail || slot.setsDetail.length === 0) {
    skipped.push({ ruleId: rule.id, target: rule.target, reason: 'missing_setsdetail' });
    return slot;
  }

  const idx = resolveSetIndex(rule.scope, slot.setsDetail.length);
  if (idx < 0 || idx >= slot.setsDetail.length) {
    skipped.push({ ruleId: rule.id, target: rule.target, reason: 'out_of_range' });
    return slot;
  }

  const base = slot.setsDetail[idx][fieldKey];
  const result = applyRule(rule, base, weekOffset, isDeload);
  if (!result.ok) {
    skipped.push({ ruleId: rule.id, target: rule.target, reason: result.reason });
    return slot;
  }

  const nextSetsDetail = slot.setsDetail.map((s, i) =>
    i === idx ? { ...s, [fieldKey]: result.value as number } : s,
  );
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
