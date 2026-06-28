/**
 * Planning Board v2 — date derivation for Calendar mode. Pure helpers (UTC-anchored, no TZ leak).
 *
 * An instance's real day date = assignment.start_date + absolute day offset, where the absolute
 * day is (weekIndex-1)*7 + (dayIndex-1). This matches the legacy assign_program_to_client dating
 * (`v_day_date := p_start_date + (absolute_day_index - 1)`), so Calendar mode lines up with what
 * the client actually sees. weekIndex is 1-based; dayIndex is 1-based (1=Mon .. 7=Sun).
 */

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/**
 * An on-demand deload (Deload v2) spliced into a client's running sequence, by its 1-based
 * running-week position. A cell at week W is pushed out by 7 days for every insert at or before
 * W. See docs/DELOAD_V2.md + deloadSequence.ts. Templates have no inserts (default []) → no shift.
 */
export interface BoardDeloadInsert {
  position: number;
}

/** Weeks a board cell at `weekIndex` is shifted out by on-demand deloads at/before it. */
function insertedWeekShift(weekIndex: number, inserts: BoardDeloadInsert[]): number {
  let n = 0;
  for (const i of inserts) if (i.position <= weekIndex) n++;
  return n;
}

/** Real Date for a board cell (UTC). startDateIso = "YYYY-MM-DD". */
export function boardDayDate(
  startDateIso: string,
  weekIndex: number,
  dayIndex: number,
  inserts: BoardDeloadInsert[] = [],
): Date {
  const start = new Date(startDateIso + "T00:00:00Z");
  const week = Math.max(1, weekIndex);
  const offsetDays = (week - 1 + insertedWeekShift(week, inserts)) * 7 + (Math.max(1, dayIndex) - 1);
  return new Date(start.getTime() + offsetDays * 86400000);
}

/** Compact label, e.g. "Mon 30 Jun". */
export function formatBoardDay(date: Date): string {
  return `${WEEKDAY[date.getUTCDay()]} ${date.getUTCDate()} ${MONTH[date.getUTCMonth()]}`;
}

/** Convenience: the compact dated label for a board cell. */
export function boardDayLabel(
  startDateIso: string,
  weekIndex: number,
  dayIndex: number,
  inserts: BoardDeloadInsert[] = [],
): string {
  return formatBoardDay(boardDayDate(startDateIso, weekIndex, dayIndex, inserts));
}

export type BoardContext = "template" | "client" | "team";
export type BoardViewMode = "weeks" | "calendar";

/** Whether the Calendar ⇄ Weeks toggle is offered (instances with a start date, board v2 on). */
export function canUseCalendarMode(boardV2: boolean, ctx: BoardContext, hasStartDate: boolean): boolean {
  return boardV2 && ctx !== "template" && hasStartDate;
}

/** Default view mode by context: instances default to dated Calendar; templates to Program-weeks. */
export function defaultBoardViewMode(boardV2: boolean, ctx: BoardContext, hasStartDate: boolean): BoardViewMode {
  return canUseCalendarMode(boardV2, ctx, hasStartDate) ? "calendar" : "weeks";
}
