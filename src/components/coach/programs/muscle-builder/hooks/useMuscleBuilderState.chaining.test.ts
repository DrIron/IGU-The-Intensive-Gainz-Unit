// Phase 2 — convert/materialization test.
//
// ConvertToProgram serializes whatever per-week values live in state.weeks
// (`weeks.flatMap(w => w.slots)`). It does NOT call the engine itself — so for
// a two-block slot to CONVERT to chained values, the reducer must have
// materialized them via recomputeDownstreamWeeks (with ctx). This asserts the
// exact per-week slot.sets a convert would read.
//
// Run: npm test -- useMuscleBuilderState.chaining

import { describe, it, expect, vi } from 'vitest';
import type { MusclePlanState, MuscleSlotData, WeekData } from '@/types/muscle-builder';
import type { WeeklyDeltaRule } from '../weeklyDeltaEngine';

// recomputeDownstreamWeeks is pure, but its module transitively imports the
// Supabase client, whose createClient() throws without VITE_SUPABASE_URL (e.g.
// in CI). Stub the client module so importing the reducer never touches env.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const { recomputeDownstreamWeeks } = await import('./useMuscleBuilderState');

let idCounter = 0;
function slot(overrides: Partial<MuscleSlotData> = {}): MuscleSlotData {
  idCounter += 1;
  return {
    id: `slot-${idCounter}`,
    dayIndex: 1,
    muscleId: 'chest',
    sets: 3,
    repMin: 8,
    repMax: 12,
    sortOrder: 0,
    ...overrides,
  };
}

// Block A: weeks 2-4, +1/wk. Block B: weeks 5-6, +2/wk. (The doc's worked example.)
const TWO_BLOCK_RULES: WeeklyDeltaRule[] = [
  { id: 'a', target: 'sets', op: 'add', amount: 1, activeWeekStart: 2, activeWeekEnd: 4 },
  { id: 'b', target: 'sets', op: 'add', amount: 2, activeWeekStart: 5, activeWeekEnd: 6 },
];

function buildState(deloadWeeks: number[] = []): MusclePlanState {
  const w1: WeekData = { slots: [slot({ deltaRules: TWO_BLOCK_RULES })], isDeload: false };
  const downstream: WeekData[] = Array.from({ length: 5 }, (_, i) => ({
    // Stale sets (99) on a sibling slot — recompute must overwrite with the
    // chained value matched by (dayIndex, sortOrder).
    slots: [slot({ sets: 99 })],
    isDeload: deloadWeeks.includes(i + 2), // i+2 → week number of this downstream week
  }));
  return {
    templateId: null,
    name: '',
    description: '',
    weeks: [w1, ...downstream],
    currentWeekIndex: 0,
    selectedDayIndex: 1,
    isDirty: false,
    isSaving: false,
    globalClientInputs: [],
    globalPrescriptionColumns: [],
  };
}

describe('recomputeDownstreamWeeks — two-block convert/materialization', () => {
  it('materializes the chained per-week sets a convert would read: [3,4,5,6,8,10]', () => {
    const result = recomputeDownstreamWeeks(buildState());
    const perWeekSets = result.weeks.map((w) => w.slots[0].sets);
    expect(perWeekSets).toEqual([3, 4, 5, 6, 8, 10]);
  });

  it('targeted recompute by slotId materializes the same chained values', () => {
    const state = buildState();
    const w1SlotId = state.weeks[0].slots[0].id;
    const result = recomputeDownstreamWeeks(state, w1SlotId);
    expect(result.weeks.map((w) => w.slots[0].sets)).toEqual([3, 4, 5, 6, 8, 10]);
  });

  it('a deload week (W4) materializes the one-week dip; the chain resumes underneath', () => {
    // W4 deload (default skip behavior on the rules → engine default is skip).
    const result = recomputeDownstreamWeeks(buildState([4]));
    const perWeekSets = result.weeks.map((w) => w.slots[0].sets);
    // W1-3: 3,4,5. W4 deload-skip → holds 5 (true running 6). W5: block B from 6 → 8, W6 → 10.
    expect(perWeekSets).toEqual([3, 4, 5, 5, 8, 10]);
  });
});
