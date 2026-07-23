// Phase 3, 3b — volume-first group-pick: an UNFILLED powerlifting lift-group slot stores its group
// id (squat/press/hinge) in `muscleId`, the same grouping-key field a muscle slot uses. This asserts
// the CLIENT reload path (get_plan_builder_state → hydrateCanonicalWeeks) preserves that group id and
// leaves the slot unfilled. The full DB round-trip (save_template_plan → get_plan_builder_state) was
// verified live against prod (muscleId='squat' survives, exercise=null); this locks the client half.
//
// Run: npm test -- useMuscleBuilderState.groupSlotRoundTrip

import { describe, it, expect, vi } from 'vitest';

// The reducer module transitively imports the Supabase client, whose createClient() throws without
// VITE_SUPABASE_URL in CI. Stub it so importing the module never touches env.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const { hydrateCanonicalWeeks } = await import('./useMuscleBuilderState');

// Shape mirrors get_plan_builder_state output: weeks[].{sessions,slots}. One unfilled lift-group slot
// (muscleId='squat', no exercise) + one filled variation in the same group (muscleId retained).
const BUILDER_STATE_WEEKS = [
  {
    label: 'W1',
    sessions: [{ id: 'sess-1', name: 'Lower', type: 'strength', dayIndex: 1, sortOrder: 0 }],
    slots: [
      { id: 'slot-unfilled', sessionId: 'sess-1', muscleId: 'squat', activityType: 'strength', sets: 3, repMin: 3, repMax: 5, sortOrder: 0 },
      { id: 'slot-filled', sessionId: 'sess-1', muscleId: 'squat', activityType: 'strength', sets: 1, sortOrder: 1, exercise: { exerciseId: 'ex-bb-squat', name: 'Barbell Back Squat' } },
    ],
  },
];

describe('hydrateCanonicalWeeks — group-slot round-trip (3b)', () => {
  it('preserves an unfilled lift-group slot: group id on muscleId, exercise unset, dayIndex from session', () => {
    const [week] = hydrateCanonicalWeeks(BUILDER_STATE_WEEKS);
    const unfilled = week.slots.find((s) => s.id === 'slot-unfilled')!;

    expect(unfilled.muscleId).toBe('squat'); // group id survives reload — the whole point
    expect(unfilled.exercise).toBeUndefined(); // still unfilled
    expect(unfilled.sets).toBe(3);
    expect(unfilled.dayIndex).toBe(1); // hydrated from the parent session
  });

  it('keeps a filled variation in the same group linked to its group id + exercise', () => {
    const [week] = hydrateCanonicalWeeks(BUILDER_STATE_WEEKS);
    const filled = week.slots.find((s) => s.id === 'slot-filled')!;

    expect(filled.muscleId).toBe('squat'); // group id retained after fill
    expect(filled.exercise?.exerciseId).toBe('ex-bb-squat');
  });
});
