/**
 * Kuwait-anchored time helpers.
 *
 * Asia/Kuwait is a fixed UTC+3 offset year-round (no DST), which mirrors the
 * server-side `get_current_week_bounds()` RPC (migration 20260524120000) and
 * `book_session_atomic`. Use these instead of `Date.prototype.setHours()` +
 * `toISOString()`, which anchor to the *browser's* local timezone — a coach on
 * a non-Kuwait device (or with a misconfigured clock) would otherwise create
 * session slots offset by hours (B6-N10).
 */

/** Asia/Kuwait is UTC+3 with no daylight saving. */
export const KUWAIT_UTC_OFFSET_HOURS = 3;

export interface KuwaitWallClock {
  /** Full year, e.g. 2026. */
  year: number;
  /** Calendar month, 1-12 (NOT the JS 0-indexed month). */
  month: number;
  /** Day of month, 1-31. */
  day: number;
  /** Hour in 24h Kuwait local time, 0-23. */
  hour: number;
  /** Minute, 0-59. Values outside the range roll over (e.g. 90 → +1h30m). */
  minute: number;
}

/**
 * Convert a Kuwait wall-clock time to the absolute UTC instant it represents.
 *
 * Example: 09:00 on a Tuesday in Kuwait → 06:00Z the same day (UTC+3).
 *
 * Out-of-range fields normalize via `Date.UTC` semantics, so callers may pass
 * `minute: minutes + i * duration` to lay out consecutive slots without manual
 * hour/day carry.
 */
export function kuwaitWallClockToUtc({
  year,
  month,
  day,
  hour,
  minute,
}: KuwaitWallClock): Date {
  // Date.UTC treats its args as UTC. A Kuwait wall-clock time is UTC+3, so the
  // matching UTC instant is the same wall-clock minus the offset.
  return new Date(
    Date.UTC(year, month - 1, day, hour - KUWAIT_UTC_OFFSET_HOURS, minute, 0, 0)
  );
}
