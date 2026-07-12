/**
 * TUST (time under significant tension) formatters.
 *
 * Lifted verbatim from `muscle-builder/VolumeOverview.tsx` so both `VolumeTiles`
 * and the volume bars/tooltips that stay in `VolumeOverview` format identically.
 * Pure functions — no React, no data access.
 */

/** Seconds as minutes with 1 decimal, or raw seconds under a minute. */
export function formatTust(seconds: number): string {
  if (seconds === 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  return `${(seconds / 60).toFixed(1)} min`;
}

/** A min-max TUST range, collapsing to a single value when both ends match. */
export function formatTustRange(min: number, max: number): string {
  if (min === 0 && max === 0) return "0s";
  if (min === max) return formatTust(min);
  return `${formatTust(min)}-${formatTust(max)}`;
}
