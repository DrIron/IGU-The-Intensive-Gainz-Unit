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
