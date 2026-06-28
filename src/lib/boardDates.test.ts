import { describe, it, expect } from "vitest";
import {
  boardDayDate,
  formatBoardDay,
  boardDayLabel,
  canUseCalendarMode,
  defaultBoardViewMode,
} from "./boardDates";

describe("boardDayDate — start_date + (week-1)*7 + (day-1)", () => {
  const start = "2026-06-01";
  it("week 1 day 1 = start_date", () => {
    const d = boardDayDate(start, 1, 1);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(5); // Jun
    expect(d.getUTCDate()).toBe(1);
  });
  it("week 1 day 7 = +6 days", () => {
    expect(boardDayDate(start, 1, 7).getUTCDate()).toBe(7);
  });
  it("week 2 day 1 = +7 days", () => {
    expect(boardDayDate(start, 2, 1).getUTCDate()).toBe(8);
  });
  it("week 2 day 3 = +9 days", () => {
    expect(boardDayDate(start, 2, 3).getUTCDate()).toBe(10);
  });
  it("rolls over month boundaries", () => {
    const d = boardDayDate("2026-06-29", 1, 3); // +2 days -> Jul 1
    expect(d.getUTCMonth()).toBe(6); // Jul
    expect(d.getUTCDate()).toBe(1);
  });
});

describe("formatBoardDay / boardDayLabel", () => {
  it("formats as 'Wkd D Mon'", () => {
    expect(formatBoardDay(new Date("2026-06-30T00:00:00Z"))).toMatch(/^[A-Z][a-z]{2} 30 Jun$/);
  });
  it("boardDayLabel reflects the offset date", () => {
    expect(boardDayLabel("2026-06-01", 2, 1)).toMatch(/ 8 Jun$/); // week 2 day 1
    expect(boardDayLabel("2026-06-29", 1, 3)).toMatch(/ 1 Jul$/); // month rollover
  });
});

describe("canUseCalendarMode / defaultBoardViewMode — default by context", () => {
  it("board v2 off → never calendar (template board unchanged)", () => {
    expect(canUseCalendarMode(false, "client", true)).toBe(false);
    expect(defaultBoardViewMode(false, "client", true)).toBe("weeks");
  });
  it("template → always Program-weeks (date-less)", () => {
    expect(canUseCalendarMode(true, "template", true)).toBe(false);
    expect(defaultBoardViewMode(true, "template", true)).toBe("weeks");
  });
  it("client/team instance with a start date → default Calendar", () => {
    expect(defaultBoardViewMode(true, "client", true)).toBe("calendar");
    expect(defaultBoardViewMode(true, "team", true)).toBe("calendar");
  });
  it("no start date → falls back to Program-weeks", () => {
    expect(canUseCalendarMode(true, "client", false)).toBe(false);
    expect(defaultBoardViewMode(true, "client", false)).toBe("weeks");
  });
});
