// Tests for the Planning Board weekly-delta engine.
// Run: npm test -- weeklyDeltaEngine
//
// Coverage targets:
//  - Per-target arithmetic + clamps
//  - Tempo literal-token skip (A/X)
//  - RIR scope: all / first / last / index
//  - Deload modes: skip / apply / invert / fixed
//  - Active range bounds
//  - Override protection
//  - setsDetail length sync on sets rules
//  - Composition (multiple rules on the same slot)
//  - Defaults factory

import { describe, it, expect } from 'vitest';
import {
  applyRule,
  resolveSlotForWeek,
  createDefaultRule,
  type WeeklyDeltaRule,
  type DeltaTarget,
} from './weeklyDeltaEngine';
import type { MuscleSlotData } from '@/types/muscle-builder';
import type { SetPrescription } from '@/types/workout-builder';

// ============================================================
// Test fixtures
// ============================================================

function rule<T extends WeeklyDeltaRule>(r: T): T {
  return r;
}

function baseSlot(overrides: Partial<MuscleSlotData> = {}): MuscleSlotData {
  return {
    id: 'slot-1',
    dayIndex: 1,
    muscleId: 'chest',
    sets: 3,
    repMin: 8,
    repMax: 12,
    sortOrder: 0,
    ...overrides,
  };
}

function setsDetailOfLength(n: number, overrides: Partial<SetPrescription> = {}): SetPrescription[] {
  return Array.from({ length: n }, (_, i) => ({ set_number: i + 1, ...overrides }));
}

// ============================================================
// applyRule — sets
// ============================================================

describe('applyRule — sets', () => {
  const r = rule({ id: 's1', target: 'sets', op: 'add', amount: 1 });

  it('W1 is dormant (rule starts W2 by default)', () => {
    const result = applyRule(r, 3, 0, false);
    expect(result).toEqual({ ok: false, skipped: true, reason: 'out_of_active_range' });
  });

  it('W2 = base + 1', () => {
    expect(applyRule(r, 3, 1, false)).toEqual({ ok: true, value: 4 });
  });

  it('W3 = base + 2 (anchored to W1, not chained from W2)', () => {
    expect(applyRule(r, 3, 2, false)).toEqual({ ok: true, value: 5 });
  });

  it('clamps at 20', () => {
    expect(applyRule(r, 19, 5, false)).toEqual({ ok: true, value: 20 });
  });

  it('clamps at 1 on negative', () => {
    const downR = rule({ id: 's2', target: 'sets', op: 'add', amount: -2 });
    expect(applyRule(downR, 3, 3, false)).toEqual({ ok: true, value: 1 });
  });

  it('skips when base is undefined', () => {
    expect(applyRule(r, undefined, 1, false)).toEqual({ ok: false, skipped: true, reason: 'no_base' });
  });
});

// ============================================================
// applyRule — repMin / repMax
// ============================================================

describe('applyRule — reps', () => {
  it('repMin +1/wk: 8 → 9 → 10', () => {
    const r = rule({ id: 'r1', target: 'repMin', op: 'add', amount: 1 });
    expect(applyRule(r, 8, 1, false)).toEqual({ ok: true, value: 9 });
    expect(applyRule(r, 8, 2, false)).toEqual({ ok: true, value: 10 });
  });

  it('repMax +1/wk preserves range width when paired', () => {
    const minR = rule({ id: 'rmin', target: 'repMin', op: 'add', amount: 1 });
    const maxR = rule({ id: 'rmax', target: 'repMax', op: 'add', amount: 1 });
    const w3min = applyRule(minR, 8, 2, false);
    const w3max = applyRule(maxR, 12, 2, false);
    expect(w3min).toEqual({ ok: true, value: 10 });
    expect(w3max).toEqual({ ok: true, value: 14 });
    // Width preserved
    expect((w3max as { value: number }).value - (w3min as { value: number }).value).toBe(4);
  });
});

// ============================================================
// applyRule — RIR / RPE arithmetic (scope handled in resolveSlotForWeek)
// ============================================================

describe('applyRule — RIR / RPE math', () => {
  it('RIR -1/wk: 3 → 2 → 1 → 0 (Hasan example)', () => {
    const r = rule({ id: 'rir1', target: 'rir', op: 'add', amount: -1, scope: { kind: 'all' } });
    expect(applyRule(r, 3, 1, false)).toEqual({ ok: true, value: 2 });
    expect(applyRule(r, 3, 2, false)).toEqual({ ok: true, value: 1 });
    expect(applyRule(r, 3, 3, false)).toEqual({ ok: true, value: 0 });
  });

  it('RIR clamps at 0 — W5 stays at 0', () => {
    const r = rule({ id: 'rir2', target: 'rir', op: 'add', amount: -1, scope: { kind: 'all' } });
    expect(applyRule(r, 3, 4, false)).toEqual({ ok: true, value: 0 });
    expect(applyRule(r, 3, 5, false)).toEqual({ ok: true, value: 0 });
  });

  it('RPE +0.5/wk supports half-steps', () => {
    const r = rule({ id: 'rpe1', target: 'rpe', op: 'add', amount: 0.5, scope: { kind: 'all' } });
    expect(applyRule(r, 7, 1, false)).toEqual({ ok: true, value: 7.5 });
    expect(applyRule(r, 7, 2, false)).toEqual({ ok: true, value: 8 });
  });

  it('RPE clamps at 10', () => {
    const r = rule({ id: 'rpe2', target: 'rpe', op: 'add', amount: 1, scope: { kind: 'all' } });
    expect(applyRule(r, 8, 4, false)).toEqual({ ok: true, value: 10 });
  });
});

// ============================================================
// applyRule — tempo
// ============================================================

describe('applyRule — tempo digit_add', () => {
  it('pos 0 -1/wk on "3010": W2 "2010", W3 "1010", W4 "0010"', () => {
    const r = rule({ id: 't1', target: 'tempo', op: 'digit_add', position: 0, amount: -1 });
    expect(applyRule(r, '3010', 1, false)).toEqual({ ok: true, value: '2010' });
    expect(applyRule(r, '3010', 2, false)).toEqual({ ok: true, value: '1010' });
    expect(applyRule(r, '3010', 3, false)).toEqual({ ok: true, value: '0010' });
  });

  it('pos 0 -1/wk on "3010": W5 sticks at "0010" (clamp 0)', () => {
    const r = rule({ id: 't2', target: 'tempo', op: 'digit_add', position: 0, amount: -1 });
    expect(applyRule(r, '3010', 4, false)).toEqual({ ok: true, value: '0010' });
    expect(applyRule(r, '3010', 5, false)).toEqual({ ok: true, value: '0010' });
  });

  it('clamps top at 9', () => {
    const r = rule({ id: 't3', target: 'tempo', op: 'digit_add', position: 0, amount: 5 });
    expect(applyRule(r, '3010', 3, false)).toEqual({ ok: true, value: '9010' });
  });

  it('skips a literal-token position (A)', () => {
    const r = rule({ id: 't4', target: 'tempo', op: 'digit_add', position: 0, amount: -1 });
    expect(applyRule(r, 'A010', 1, false)).toEqual({
      ok: false,
      skipped: true,
      reason: 'literal_token',
    });
  });

  it('skips a literal-token position (X)', () => {
    const r = rule({ id: 't5', target: 'tempo', op: 'digit_add', position: 2, amount: -1 });
    expect(applyRule(r, '30X0', 1, false)).toEqual({
      ok: false,
      skipped: true,
      reason: 'literal_token',
    });
  });

  it('does not auto-convert digit → letter at floor (D2)', () => {
    const r = rule({ id: 't6', target: 'tempo', op: 'digit_add', position: 0, amount: -1 });
    // Starts at 0 — stays at 0, NEVER becomes A.
    expect(applyRule(r, '0010', 1, false)).toEqual({ ok: true, value: '0010' });
    expect(applyRule(r, '0010', 5, false)).toEqual({ ok: true, value: '0010' });
  });

  it('skips when base is empty/undefined', () => {
    const r = rule({ id: 't7', target: 'tempo', op: 'digit_add', position: 0, amount: -1 });
    expect(applyRule(r, undefined, 1, false)).toEqual({ ok: false, skipped: true, reason: 'no_base' });
    expect(applyRule(r, '', 1, false)).toEqual({ ok: false, skipped: true, reason: 'no_base' });
  });

  it('only mutates the targeted position', () => {
    const r = rule({ id: 't8', target: 'tempo', op: 'digit_add', position: 2, amount: 1 });
    expect(applyRule(r, '3010', 1, false)).toEqual({ ok: true, value: '3020' });
    expect(applyRule(r, '3010', 2, false)).toEqual({ ok: true, value: '3030' });
  });
});

// ============================================================
// applyRule — deload behavior
// ============================================================

describe('applyRule — deload behavior', () => {
  const r = rule({
    id: 'rir-dl',
    target: 'rir',
    op: 'add',
    amount: -1,
    scope: { kind: 'all' },
  });

  it('deload=skip (default): returns deload_skip on deload week', () => {
    expect(applyRule(r, 3, 2, true)).toEqual({ ok: false, skipped: true, reason: 'deload_skip' });
  });

  it('deload=apply: rule runs as normal', () => {
    const r2 = { ...r, deload: 'apply' as const };
    expect(applyRule(r2, 3, 2, true)).toEqual({ ok: true, value: 1 });
  });

  it('deload=fixed: writes the deloadFixedValue verbatim', () => {
    const r2 = { ...r, deload: 'fixed' as const, deloadFixedValue: 4 };
    expect(applyRule(r2, 3, 2, true)).toEqual({ ok: true, value: 4 });
  });

  it('deload=fixed without deloadFixedValue: out_of_range', () => {
    const r2 = { ...r, deload: 'fixed' as const };
    expect(applyRule(r2, 3, 2, true)).toEqual({ ok: false, skipped: true, reason: 'out_of_range' });
  });

  it('deload=invert: amount sign flips', () => {
    const r2 = { ...r, deload: 'invert' as const };
    // Without invert: W3 = 3 + (-1) × 2 = 1
    // With invert on deload: W3 = 3 + (+1) × 2 = 5
    expect(applyRule(r2, 3, 2, true)).toEqual({ ok: true, value: 5 });
  });

  it('non-deload week ignores deload mode entirely', () => {
    const r2 = { ...r, deload: 'fixed' as const, deloadFixedValue: 99 };
    expect(applyRule(r2, 3, 2, false)).toEqual({ ok: true, value: 1 }); // runs normally
  });
});

// ============================================================
// applyRule — active range
// ============================================================

describe('applyRule — active range', () => {
  it('rule with activeWeekStart=3 is dormant before W3', () => {
    const r = rule({
      id: 'ar1',
      target: 'rir',
      op: 'add',
      amount: -1,
      scope: { kind: 'all' },
      activeWeekStart: 3,
    });
    expect(applyRule(r, 3, 1, false)).toEqual({ ok: false, skipped: true, reason: 'out_of_active_range' });
    // W3 (offset 2) is first applied week → amount × 1
    expect(applyRule(r, 3, 2, false)).toEqual({ ok: true, value: 2 });
    expect(applyRule(r, 3, 3, false)).toEqual({ ok: true, value: 1 });
  });

  it('rule with activeWeekEnd=4 stops applying after W4', () => {
    const r = rule({
      id: 'ar2',
      target: 'rir',
      op: 'add',
      amount: -1,
      scope: { kind: 'all' },
      activeWeekEnd: 4,
    });
    expect(applyRule(r, 3, 3, false)).toEqual({ ok: true, value: 0 }); // W4 = 3 - 3 = 0
    expect(applyRule(r, 3, 4, false)).toEqual({ ok: false, skipped: true, reason: 'out_of_active_range' });
  });
});

// ============================================================
// applyRule — instructions
// ============================================================

describe('applyRule — instructions', () => {
  it('append concatenates with newline when base is non-empty', () => {
    const r = rule({ id: 'i1', target: 'instructions', op: 'append', text: 'Focus on tempo' });
    expect(applyRule(r, 'Hold a 2s pause at bottom', 1, false)).toEqual({
      ok: true,
      value: 'Hold a 2s pause at bottom\nFocus on tempo',
    });
  });

  it('append returns the new text when base is empty', () => {
    const r = rule({ id: 'i2', target: 'instructions', op: 'append', text: 'New cue' });
    expect(applyRule(r, '', 1, false)).toEqual({ ok: true, value: 'New cue' });
  });

  it('replace_per_week returns the index-aligned text', () => {
    const r = rule({
      id: 'i3',
      target: 'instructions',
      op: 'replace_per_week',
      texts: ['W2 cue', 'W3 cue', 'W4 cue'],
    });
    expect(applyRule(r, 'W1 cue', 1, false)).toEqual({ ok: true, value: 'W2 cue' });
    expect(applyRule(r, 'W1 cue', 2, false)).toEqual({ ok: true, value: 'W3 cue' });
    expect(applyRule(r, 'W1 cue', 3, false)).toEqual({ ok: true, value: 'W4 cue' });
  });

  it('replace_per_week beyond the texts array: out_of_range', () => {
    const r = rule({
      id: 'i4',
      target: 'instructions',
      op: 'replace_per_week',
      texts: ['W2 cue'],
    });
    expect(applyRule(r, 'W1 cue', 2, false)).toEqual({
      ok: false,
      skipped: true,
      reason: 'out_of_range',
    });
  });
});

// ============================================================
// resolveSlotForWeek — RIR scope on setsDetail
// ============================================================

describe('resolveSlotForWeek — RIR scope', () => {
  it('scope all writes slot-level rir', () => {
    const slot = baseSlot({ rir: 3 });
    const r = rule({ id: 'r', target: 'rir', op: 'add', amount: -1, scope: { kind: 'all' } });
    const out = resolveSlotForWeek(slot, [r], 1, false);
    expect(out.slot.rir).toBe(2);
    expect(out.derivedFields).toContain('rir');
  });

  it('scope last only mutates the final setsDetail entry', () => {
    const slot = baseSlot({
      sets: 4,
      setsDetail: setsDetailOfLength(4, { rir: 3 }),
    });
    const r = rule({ id: 'r', target: 'rir', op: 'add', amount: -1, scope: { kind: 'last' } });
    const out = resolveSlotForWeek(slot, [r], 1, false);
    expect(out.slot.setsDetail).toBeDefined();
    expect(out.slot.setsDetail![0].rir).toBe(3); // untouched
    expect(out.slot.setsDetail![1].rir).toBe(3);
    expect(out.slot.setsDetail![2].rir).toBe(3);
    expect(out.slot.setsDetail![3].rir).toBe(2); // only last
  });

  it('scope first only mutates setsDetail[0]', () => {
    const slot = baseSlot({
      sets: 3,
      setsDetail: setsDetailOfLength(3, { rir: 3 }),
    });
    const r = rule({ id: 'r', target: 'rir', op: 'add', amount: -1, scope: { kind: 'first' } });
    const out = resolveSlotForWeek(slot, [r], 1, false);
    expect(out.slot.setsDetail![0].rir).toBe(2);
    expect(out.slot.setsDetail![1].rir).toBe(3);
    expect(out.slot.setsDetail![2].rir).toBe(3);
  });

  it('scope index 2 mutates setsDetail[1]', () => {
    const slot = baseSlot({
      sets: 4,
      setsDetail: setsDetailOfLength(4, { rir: 3 }),
    });
    const r = rule({ id: 'r', target: 'rir', op: 'add', amount: -1, scope: { kind: 'index', setNumber: 2 } });
    const out = resolveSlotForWeek(slot, [r], 1, false);
    expect(out.slot.setsDetail![0].rir).toBe(3);
    expect(out.slot.setsDetail![1].rir).toBe(2);
    expect(out.slot.setsDetail![2].rir).toBe(3);
    expect(out.slot.setsDetail![3].rir).toBe(3);
  });

  it('scope last on slot without setsDetail: skip with missing_setsdetail', () => {
    const slot = baseSlot({ rir: 3 });
    const r = rule({ id: 'r', target: 'rir', op: 'add', amount: -1, scope: { kind: 'last' } });
    const out = resolveSlotForWeek(slot, [r], 1, false);
    expect(out.skipped).toEqual([
      { ruleId: 'r', target: 'rir', reason: 'missing_setsdetail' },
    ]);
    expect(out.derivedFields).not.toContain('rir');
  });

  // B3 — scope=all on slot without slot-level rir but with setsDetail should
  // fan out across every setsDetail entry. Previously this silently no-op'd.
  it('scope all fans out across setsDetail when slot-level rir is absent', () => {
    const slot = baseSlot({
      // No slot-level rir.
      setsDetail: [
        { set_number: 1, rir: 4 },
        { set_number: 2, rir: 3 },
        { set_number: 3, rir: 2 },
        { set_number: 4, rir: 2 },
      ],
    });
    const r = rule({ id: 'r', target: 'rir', op: 'add', amount: -1, scope: { kind: 'all' } });
    const out = resolveSlotForWeek(slot, [r], 1, false);
    expect(out.derivedFields).toContain('rir');
    expect(out.slot.setsDetail).toBeDefined();
    expect(out.slot.setsDetail!.map((s) => s.rir)).toEqual([3, 2, 1, 1]);
    expect(out.slot.rir).toBeUndefined(); // slot-level untouched
  });

  it('scope all on slot with NO rir at all (no slot-level, no setsDetail rir): skip no_base', () => {
    const slot = baseSlot({ setsDetail: [{ set_number: 1 }, { set_number: 2 }] });
    const r = rule({ id: 'r', target: 'rir', op: 'add', amount: -1, scope: { kind: 'all' } });
    const out = resolveSlotForWeek(slot, [r], 1, false);
    expect(out.skipped).toEqual([{ ruleId: 'r', target: 'rir', reason: 'no_base' }]);
    expect(out.derivedFields).toEqual([]);
  });

  it('scope all writes to BOTH slot-level rir AND every setsDetail entry', () => {
    const slot = baseSlot({
      rir: 3,
      setsDetail: [
        { set_number: 1, rir: 4 },
        { set_number: 2, rir: 4 },
      ],
    });
    const r = rule({ id: 'r', target: 'rir', op: 'add', amount: -1, scope: { kind: 'all' } });
    const out = resolveSlotForWeek(slot, [r], 1, false);
    expect(out.slot.rir).toBe(2);
    // setsDetail entries ALL get the delta — the popover reads from these,
    // so leaving them stale would surface as "rule didn't run" in the UI.
    expect(out.slot.setsDetail!.map((s) => s.rir)).toEqual([3, 3]);
  });

  it('scope index beyond setsDetail length: skip with out_of_range', () => {
    const slot = baseSlot({
      sets: 3,
      setsDetail: setsDetailOfLength(3, { rir: 3 }),
    });
    const r = rule({ id: 'r', target: 'rir', op: 'add', amount: -1, scope: { kind: 'index', setNumber: 5 } });
    const out = resolveSlotForWeek(slot, [r], 1, false);
    expect(out.skipped[0].reason).toBe('out_of_range');
  });
});

// ============================================================
// resolveSlotForWeek — sets rule syncs setsDetail length
// ============================================================

describe('resolveSlotForWeek — setsDetail sync', () => {
  it('extends setsDetail by cloning last entry when sets +1', () => {
    const slot = baseSlot({
      sets: 3,
      setsDetail: [
        { set_number: 1, reps: 8, weight: 50 },
        { set_number: 2, reps: 8, weight: 55 },
        { set_number: 3, reps: 8, weight: 60 },
      ],
    });
    const r = rule({ id: 's', target: 'sets', op: 'add', amount: 1 });
    const out = resolveSlotForWeek(slot, [r], 1, false);
    expect(out.slot.sets).toBe(4);
    expect(out.slot.setsDetail).toHaveLength(4);
    expect(out.slot.setsDetail![3]).toEqual({ set_number: 4, reps: 8, weight: 60 });
  });

  it('trims setsDetail when sets -1', () => {
    const slot = baseSlot({
      sets: 4,
      setsDetail: setsDetailOfLength(4),
    });
    const r = rule({ id: 's', target: 'sets', op: 'add', amount: -1 });
    const out = resolveSlotForWeek(slot, [r], 1, false);
    expect(out.slot.sets).toBe(3);
    expect(out.slot.setsDetail).toHaveLength(3);
  });

  it('does not touch setsDetail when slot has none', () => {
    const slot = baseSlot({ sets: 3 });
    const r = rule({ id: 's', target: 'sets', op: 'add', amount: 1 });
    const out = resolveSlotForWeek(slot, [r], 1, false);
    expect(out.slot.sets).toBe(4);
    expect(out.slot.setsDetail).toBeUndefined();
  });
});

// ============================================================
// resolveSlotForWeek — composition
// ============================================================

describe('resolveSlotForWeek — composition', () => {
  it('multiple independent rules all apply', () => {
    const slot = baseSlot({ rir: 3, tempo: '3010' });
    const rules: WeeklyDeltaRule[] = [
      { id: 's', target: 'sets', op: 'add', amount: 1 },
      { id: 'r', target: 'rir', op: 'add', amount: -1, scope: { kind: 'all' } },
      { id: 't', target: 'tempo', op: 'digit_add', position: 0, amount: -1 },
    ];
    const out = resolveSlotForWeek(slot, rules, 2, false); // W3
    expect(out.slot.sets).toBe(5);       // 3 + 1×2
    expect(out.slot.rir).toBe(1);        // 3 + (-1)×2
    expect(out.slot.tempo).toBe('1010'); // ecc 3 → 1
    expect(out.derivedFields.sort()).toEqual(['rir', 'sets', 'tempo']);
    expect(out.skipped).toEqual([]);
  });

  it('skipped rules surface separately and do not block other rules', () => {
    const slot = baseSlot({ rir: 3, tempo: 'A010' });
    const rules: WeeklyDeltaRule[] = [
      { id: 'r', target: 'rir', op: 'add', amount: -1, scope: { kind: 'all' } },
      { id: 't', target: 'tempo', op: 'digit_add', position: 0, amount: -1 },
    ];
    const out = resolveSlotForWeek(slot, rules, 1, false);
    expect(out.slot.rir).toBe(2);          // applied
    expect(out.slot.tempo).toBe('A010');   // untouched
    expect(out.derivedFields).toEqual(['rir']);
    expect(out.skipped).toEqual([
      { ruleId: 't', target: 'tempo', reason: 'literal_token' },
    ]);
  });
});

// ============================================================
// resolveSlotForWeek — manual overrides
// ============================================================

describe('resolveSlotForWeek — manual overrides', () => {
  it('override on rir blocks its rule but lets sets rule through', () => {
    const slot = baseSlot({ rir: 99 }); // pretend coach hand-edited
    const rules: WeeklyDeltaRule[] = [
      { id: 's', target: 'sets', op: 'add', amount: 1 },
      { id: 'r', target: 'rir', op: 'add', amount: -1, scope: { kind: 'all' } },
    ];
    const out = resolveSlotForWeek(slot, rules, 1, false, ['rir']);
    expect(out.slot.sets).toBe(4);     // sets rule applied
    expect(out.slot.rir).toBe(99);     // override preserved
    expect(out.derivedFields).toEqual(['sets']);
    expect(out.skipped).toEqual([]);   // overridden rules don't appear as skipped
  });

  it('all overrides → no rules apply, slot unchanged', () => {
    const slot = baseSlot({ rir: 3 });
    const rules: WeeklyDeltaRule[] = [
      { id: 's', target: 'sets', op: 'add', amount: 1 },
      { id: 'r', target: 'rir', op: 'add', amount: -1, scope: { kind: 'all' } },
    ];
    const allTargets: DeltaTarget[] = ['sets', 'repMin', 'repMax', 'tempo', 'rir', 'rpe', 'instructions'];
    const out = resolveSlotForWeek(slot, rules, 2, false, allTargets);
    expect(out.slot.sets).toBe(3);
    expect(out.slot.rir).toBe(3);
    expect(out.derivedFields).toEqual([]);
  });
});

// ============================================================
// resolveSlotForWeek — does not mutate input
// ============================================================

describe('resolveSlotForWeek — immutability', () => {
  it('does not mutate the baseSlot reference', () => {
    const slot = baseSlot({
      rir: 3,
      tempo: '3010',
      setsDetail: setsDetailOfLength(3, { rir: 3, weight: 50 }),
    });
    const snapshot = JSON.stringify(slot);
    const rules: WeeklyDeltaRule[] = [
      { id: 's', target: 'sets', op: 'add', amount: 1 },
      { id: 'r', target: 'rir', op: 'add', amount: -1, scope: { kind: 'last' } },
    ];
    resolveSlotForWeek(slot, rules, 2, false);
    expect(JSON.stringify(slot)).toBe(snapshot);
  });
});

// ============================================================
// resolveSlotForWeek — instructions on exercise
// ============================================================

describe('resolveSlotForWeek — instructions', () => {
  it('appends to slot.exercise.instructions', () => {
    const slot = baseSlot({
      exercise: { exerciseId: 'ex-1', name: 'Bench Press', instructions: 'Pause 1s at chest' },
    });
    const r = rule({ id: 'i', target: 'instructions', op: 'append', text: 'Add 2s pause this week' });
    const out = resolveSlotForWeek(slot, [r], 1, false);
    expect(out.slot.exercise?.instructions).toBe('Pause 1s at chest\nAdd 2s pause this week');
    expect(out.derivedFields).toEqual(['instructions']);
  });

  it('skips when slot has no exercise assigned yet', () => {
    const slot = baseSlot();
    const r = rule({ id: 'i', target: 'instructions', op: 'append', text: 'Whatever' });
    const out = resolveSlotForWeek(slot, [r], 1, false);
    expect(out.skipped[0].reason).toBe('no_base');
  });
});

// ============================================================
// Hasan's example (chat verification) — end-to-end
// ============================================================

describe('Hasan example end-to-end', () => {
  it('RIR 3 with -1/wk → W3 RIR = 1', () => {
    const slot = baseSlot({ rir: 3 });
    const r = rule({ id: 'r', target: 'rir', op: 'add', amount: -1, scope: { kind: 'all' } });
    const w3 = resolveSlotForWeek(slot, [r], 2, false);
    expect(w3.slot.rir).toBe(1);
  });

  // NOTE: load rule deferred — weight only lives on SetPrescription, no
  // slot-level field. This test demonstrates the same +1.25 math via RPE
  // (slot-level numeric) to confirm the engine's arithmetic.
  it('arithmetic anchors to W1 base (verifies +1.25/wk math)', () => {
    const r = rule({ id: 'rpe', target: 'rpe', op: 'add', amount: 1.25, scope: { kind: 'all' } });
    expect(applyRule(r, 5, 1, false)).toEqual({ ok: true, value: 6.25 });
    expect(applyRule(r, 5, 2, false)).toEqual({ ok: true, value: 7.5 });
    // W4 would be 8.75 if uncapped; capped at 10.
    expect(applyRule(r, 5, 3, false)).toEqual({ ok: true, value: 8.75 });
  });
});

// ============================================================
// Defaults factory (D11)
// ============================================================

describe('createDefaultRule', () => {
  it('sets defaults to +1/wk', () => {
    const r = createDefaultRule('sets');
    expect(r.target).toBe('sets');
    if (r.target === 'sets') expect(r.amount).toBe(1);
  });

  it('rir defaults to -1/wk, scope all', () => {
    const r = createDefaultRule('rir');
    expect(r.target).toBe('rir');
    if (r.target === 'rir') {
      expect(r.amount).toBe(-1);
      expect(r.scope).toEqual({ kind: 'all' });
    }
  });

  it('tempo defaults to position 0, -1/wk', () => {
    const r = createDefaultRule('tempo');
    expect(r.target).toBe('tempo');
    if (r.target === 'tempo') {
      expect(r.position).toBe(0);
      expect(r.amount).toBe(-1);
    }
  });

  it('every default starts with deload=skip', () => {
    const targets: DeltaTarget[] = ['sets', 'repMin', 'repMax', 'tempo', 'rir', 'rpe', 'instructions'];
    for (const t of targets) {
      const r = createDefaultRule(t);
      expect(r.deload).toBe('skip');
      expect(r.id).toBeTruthy();
    }
  });
});
