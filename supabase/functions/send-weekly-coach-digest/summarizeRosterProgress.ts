// AD3 — pure roster-progress cruncher for the weekly coach digest.
//
// The coach-scoped RPCs (get_coach_roster_stats / get_coach_roster_logged_adherence) key off
// auth.uid(), which is NULL in the service-role edge context, so they return {} here. Instead the
// handler runs a few ROSTER-WIDE batched queries against the raw tables and hands the rows to this
// pure function. Keeping the number-crunching here (like resolveRosterAdherence /
// computeReverseTdeeSeries) makes it unit-testable without a live DB.
//
// Honesty: a metric with no data is 0 — never a fabricated number, never NaN/null.

export interface RosterProgressInput {
  /** The coach's active roster (client user_ids this week). */
  rosterUserIds: string[];
  /** weight_logs rows this week (user_id per row). */
  weighInRows: Array<{ user_id: string }>;
  /** adherence_logs rows this week. */
  checkInRows: Array<{ user_id: string; followed_calories: boolean | null }>;
  /** exercise_set_logs rows this week (author + skip flag). */
  setLogRows: Array<{ created_by_user_id: string; skipped: boolean | null }>;
}

export interface RosterProgress {
  /** Roster size. */
  total: number;
  /** Distinct clients who logged ANY set this week (the "active this week" set). */
  activeClientIds: string[];
  /** Distinct clients with a weigh-in this week. */
  weighIns: number;
  /** Distinct clients who logged a check-in (adherence_logs) this week. */
  checkIns: number;
  /** Of those who checked in, how many followed their calories. */
  onTrack: number;
  /** Total NON-skipped set rows across the roster this week. */
  setsLogged: number;
}

export function summarizeRosterProgress(input: RosterProgressInput): RosterProgress {
  const roster = new Set(input.rosterUserIds);
  const total = roster.size;

  // Distinct clients who logged any set → "active this week".
  const activeSet = new Set<string>();
  for (const r of input.setLogRows) {
    if (roster.has(r.created_by_user_id)) activeSet.add(r.created_by_user_id);
  }

  // Non-skipped set rows (roster-scoped) → total sets logged.
  const setsLogged = input.setLogRows.filter(
    (r) => roster.has(r.created_by_user_id) && r.skipped !== true,
  ).length;

  // Distinct clients with a weigh-in.
  const weighInSet = new Set<string>();
  for (const r of input.weighInRows) {
    if (roster.has(r.user_id)) weighInSet.add(r.user_id);
  }

  // Distinct clients who checked in, and (of those) who followed calories.
  const checkInSet = new Set<string>();
  const onTrackSet = new Set<string>();
  for (const r of input.checkInRows) {
    if (!roster.has(r.user_id)) continue;
    checkInSet.add(r.user_id);
    if (r.followed_calories === true) onTrackSet.add(r.user_id);
  }

  return {
    total,
    activeClientIds: [...activeSet],
    weighIns: weighInSet.size,
    checkIns: checkInSet.size,
    onTrack: onTrackSet.size,
    setsLogged,
  };
}
