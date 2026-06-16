// Render test for the Phase 1e "New set looks like…" added-set mini-form.
// Confirms it renders for a `sets` rule with amount > 0, and is absent for
// amount <= 0 or non-`sets` targets.
//
// Uses react-dom/server static rendering (no DOM/RTL peer deps needed) — we
// only need to assert which fields the component emits, not interact with them.
//
// Run: npm test -- SlotDeltaRuleEditor.render

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SlotDeltaRuleEditor } from './SlotDeltaRuleEditor';
import { SlotDeltaRulesPanel } from './SlotDeltaRulesPanel';
import type { WeeklyDeltaRule } from './weeklyDeltaEngine';

const noop = () => {};

function markup(rule: WeeklyDeltaRule, baseValue: number | string | undefined = 3): string {
  return renderToStaticMarkup(
    <SlotDeltaRuleEditor
      rule={rule}
      baseValue={baseValue}
      totalWeeks={6}
      isDeloadByWeek={[false, false, false, false, false, false]}
      setCount={3}
      onChange={noop}
      onRemove={noop}
    />,
  );
}

describe('SlotDeltaRuleEditor — Phase 1e added-set mini-form', () => {
  it('renders the "New set looks like…" form for a sets rule with amount > 0', () => {
    const html = markup({ id: 's1', target: 'sets', op: 'add', amount: 1, activeWeekStart: 2 });

    // Section heading + all four prescribed-field labels.
    expect(html).toContain('New set looks like');
    expect(html).toContain('Reps');
    expect(html).toContain('RIR');
    expect(html).toContain('Tempo');
    expect(html).toContain('Notes');

    // Field affordances: two "clone last" numeric placeholders + the tempo hint.
    expect(html.match(/clone last/g) ?? []).toHaveLength(2);
    expect(html).toContain('e.g. 3010');
  });

  it('hides the form for a sets rule that removes sets (amount <= 0)', () => {
    const html = markup({ id: 's2', target: 'sets', op: 'add', amount: -1, activeWeekStart: 2 });
    expect(html).not.toContain('New set looks like');
  });

  it('hides the form for a non-sets target (rir)', () => {
    const html = markup({ id: 'r1', target: 'rir', op: 'add', amount: -1, scope: { kind: 'all' } });
    expect(html).not.toContain('New set looks like');
  });
});

// ============================================================
// Phase 2 — chained preview + overlap banner (via the panel)
// ============================================================

function panelMarkup(rules: WeeklyDeltaRule[]): string {
  return renderToStaticMarkup(
    <SlotDeltaRulesPanel
      rules={rules}
      totalWeeks={6}
      isDeloadByWeek={[false, false, false, false, false, false]}
      baseValues={{ sets: 3 }}
      hasExercise={false}
      onChange={noop}
    />,
  );
}

/** Pull the preview-strip cell values (the `leading-tight` value spans). */
function previewValuesFromMarkup(html: string): string[] {
  return [...html.matchAll(/leading-tight">([^<]*)</g)].map((m) => m[1]);
}

describe('SlotDeltaRulesPanel — Phase 2 chained preview', () => {
  it('previews the CHAINED sequence 3,4,5,6,8,10 for two non-overlapping Sets rules', () => {
    // Block A: +1 weeks 2-4. Block B: +2 weeks 5-6. B must build on A's W4 value (6).
    const html = panelMarkup([
      { id: 'a', target: 'sets', op: 'add', amount: 1, activeWeekStart: 2, activeWeekEnd: 4 },
      { id: 'b', target: 'sets', op: 'add', amount: 2, activeWeekStart: 5, activeWeekEnd: 6 },
    ]);
    // Two sets rows render → the same trajectory appears twice; assert the
    // first row's six cells are the chained sequence (NOT a reset to base).
    expect(previewValuesFromMarkup(html).slice(0, 6)).toEqual(['3', '4', '5', '6', '8', '10']);
    // 8 and 10 only arise from chaining (Block B from 6); a base-anchored
    // preview of either rule alone could never produce them.
    expect(html).toContain('leading-tight">8<');
    expect(html).toContain('leading-tight">10<');
  });
});

describe('SlotDeltaRulesPanel — Phase 2 overlap banner', () => {
  it('renders the inline overlap error when two same-target windows collide', () => {
    const html = panelMarkup([
      { id: 'a', target: 'sets', op: 'add', amount: 1, activeWeekStart: 2, activeWeekEnd: 4 },
      { id: 'b', target: 'sets', op: 'add', amount: 1, activeWeekStart: 3, activeWeekEnd: 5 },
    ]);
    expect(html).toContain('overlaps another rule for the same target');
  });

  it('does NOT render the overlap error for disjoint windows', () => {
    const html = panelMarkup([
      { id: 'a', target: 'sets', op: 'add', amount: 1, activeWeekStart: 2, activeWeekEnd: 4 },
      { id: 'b', target: 'sets', op: 'add', amount: 2, activeWeekStart: 5, activeWeekEnd: 6 },
    ]);
    expect(html).not.toContain('overlaps another rule for the same target');
  });
});
