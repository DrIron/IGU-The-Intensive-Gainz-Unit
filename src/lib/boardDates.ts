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

/** Real Date for a board cell (UTC). startDateIso = "YYYY-MM-DD". */
export function boardDayDate(startDateIso: string, weekIndex: number, dayIndex: number): Date {
  const start = new Date(startDateIso + "T00:00:00Z");
  const offsetDays = (Math.max(1, weekIndex) - 1) * 7 + (Math.max(1, dayIndex) - 1);
  return new Date(start.getTime() + offsetDays * 86400000);
}

/** Compact label, e.g. "Mon 30 Jun". */
export function formatBoardDay(date: Date): string {
  return `${WEEKDAY[date.getUTCDay()]} ${date.getUTCDate()} ${MONTH[date.getUTCMonth()]}`;
}

/** Convenience: the compact dated label for a board cell. */
export function boardDayLabel(startDateIso: string, weekIndex: number, dayIndex: number): string {
  return formatBoardDay(boardDayDate(startDateIso, weekIndex, dayIndex));
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
