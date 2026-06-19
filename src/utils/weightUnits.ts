/**
 * Weight unit conversion — single source of truth.
 *
 * Canonical storage for ALL logged and prescribed weights is kilograms
 * (`exercise_set_logs.performed_load`, prescription snapshots, charts,
 * progression). Pounds is a display/entry convenience only, controlled by the
 * per-client `client_preferences.weight_unit`.
 *
 * Never inline the conversion factor anywhere — it drifts. Always go through
 * these helpers.
 */

export type WeightUnit = "kg" | "lb";

export const LB_PER_KG = 2.20462262185;

/** Kilograms → pounds. */
export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

/** Pounds → kilograms. */
export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Convert a *displayed* value between units (e.g. the number already typed in an
 * input when the client flips the kg/lb toggle). Rounded for display. Returns
 * null for empty/NaN so blank inputs stay blank.
 */
export function convertWeight(
  value: number | null | undefined,
  from: WeightUnit,
  to: WeightUnit,
  decimals = 1,
): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  if (from === to) return roundTo(value, decimals);
  return roundTo(from === "kg" ? kgToLb(value) : lbToKg(value), decimals);
}

/** Convert a value the client TYPED in `unit` into canonical kg for storage. */
export function toCanonicalKg(
  value: number | null | undefined,
  unit: WeightUnit,
): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return unit === "kg" ? value : lbToKg(value);
}

/** Convert canonical kg into the client's display `unit` (rounded). */
export function fromCanonicalKg(
  kg: number | null | undefined,
  unit: WeightUnit,
  decimals = 1,
): number | null {
  if (kg === null || kg === undefined || Number.isNaN(kg)) return null;
  return roundTo(unit === "kg" ? kg : kgToLb(kg), decimals);
}
