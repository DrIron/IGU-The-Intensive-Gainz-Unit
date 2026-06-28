/**
 * Deload v2 — pure running-week sequence model. See docs/DELOAD_V2.md.
 *
 * A client's running sequence = the base plan weeks (on-demand deload TEMPLATES excluded),
 * ordered by week_index, with their assignment's inserted on-demand deloads spliced in at each
 * insert's position. Inserting at position P makes the deload the P-th running week and pushes
 * every later week out by one (+7 days). Multiple inserts at the same position stack in order.
 *
 * Pinned deload weeks stay in the base sequence and run in place; only on_demand deload weeks
 * are excluded from the base sequence and become insertable. Position is a 1-based ORDINAL into
 * the base sequence (the client's current week number), not a raw plan_weeks.week_index — so it
 * stays correct even when an on-demand template sits among the numbered weeks.
 */

export interface SequencePlanWeek {
  id: string;
  week_index: number;
  is_deload: boolean;
  deload_placement: string | null;
}

export interface SequenceInsert {
  id?: string | null;
  position_week_index: number;
  source_plan_week_id: string;
  preset_id: string | null;
}

export interface RunningWeek {
  kind: "base" | "inserted";
  /** 1-based position in the client's running timeline. */
  runningIndex: number;
  /** plan_weeks.id supplying this week's CONTENT (the base week, or the source deload week). */
  contentPlanWeekId: string;
  /** plan_weeks.week_index for base weeks; null for inserted deloads. */
  baseWeekIndex: number | null;
  /** true for inserted deloads AND pinned base deload weeks (display + read-time handling). */
  isDeload: boolean;
  /** preset id carried for display (inserted deload's snapshot; null for plain base weeks). */
  presetId: string | null;
  /** client_plan_inserted_deloads.id for inserted weeks; null for base. */
  insertId: string | null;
}

/** The base weeks that run in the normal sequence (on-demand deload templates excluded). */
export function baseRunningWeeks(weeks: SequencePlanWeek[]): SequencePlanWeek[] {
  return weeks
    .filter((w) => !(w.is_deload && w.deload_placement === "on_demand"))
    .slice()
    .sort((a, b) => a.week_index - b.week_index);
}

/**
 * Build the client's running week sequence: base weeks (on-demand templates excluded), with
 * inserted on-demand deloads spliced at their position ordinal. Returns running-ordered weeks.
 */
export function buildRunningSequence(
  weeks: SequencePlanWeek[],
  inserts: SequenceInsert[],
): RunningWeek[] {
  const base = baseRunningWeeks(weeks);
  const sorted = inserts
    .slice()
    .sort((a, b) => a.position_week_index - b.position_week_index);
  const result: RunningWeek[] = [];
  let running = 1;
  let insIdx = 0;

  const pushInsert = (ins: SequenceInsert) => {
    result.push({
      kind: "inserted",
      runningIndex: running++,
      contentPlanWeekId: ins.source_plan_week_id,
      baseWeekIndex: null,
      isDeload: true,
      presetId: ins.preset_id ?? null,
      insertId: ins.id ?? null,
    });
  };

  base.forEach((w, i) => {
    const ordinal = i + 1;
    // Splice every insert positioned at or before this ordinal that hasn't landed yet (sorted
    // ascending, so this stacks same-position inserts and clamps stragglers forward).
    while (insIdx < sorted.length && sorted[insIdx].position_week_index <= ordinal) {
      pushInsert(sorted[insIdx]);
      insIdx++;
    }
    result.push({
      kind: "base",
      runningIndex: running++,
      contentPlanWeekId: w.id,
      baseWeekIndex: w.week_index,
      isDeload: !!w.is_deload, // pinned deload weeks stay in place
      presetId: null,
      insertId: null,
    });
  });
  // Inserts positioned past the last base week (clamp to the end).
  while (insIdx < sorted.length) {
    pushInsert(sorted[insIdx]);
    insIdx++;
  }

  return result;
}
