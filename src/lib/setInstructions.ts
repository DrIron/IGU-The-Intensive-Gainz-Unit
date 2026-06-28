/**
 * Program system unification — set-instruction resolution (Weight back-off / Drop set / AMRAP).
 * Pure weight math + badge helpers consumed by the canonical WorkoutSessionV2 logger (behind the
 * canonical_session_read flag). The per-set shape lives on SetPrescription (P1 addendum:
 * amrap / weight_mode+backoff / branches). Rest & Repeat (rest_repeat branch) is a later slice.
 *
 * See docs/PROGRAM_SYSTEM_UNIFICATION_BUILD_PLAN.md "Planning Board v2 + prescription model".
 *
 * Weight model: back-off + drop derive from a reference/parent set's LOGGED weight (recompute
 * live as the client logs it), falling back to its fixed prescribed weight when set. Result is
 * rounded to `rounding` (default 2.5 kg) and floored at 0. All weights here are in canonical kg.
 */

export type WeightBasis = "percent" | "drop";

export interface BackoffSpec {
  ref_set_index: number; // 0-indexed set this backs off from
  basis: WeightBasis;
  value: number; // percent (e.g. 90 = 90%) or kg to drop
  rounding?: number;
}

export interface DropBranch {
  type: "drop";
  basis: WeightBasis;
  value: number;
  tempo?: string;
}

/** Round to the nearest increment (default 2.5 kg), floored at 0. */
export function roundToIncrement(weight: number, increment = 2.5): number {
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  const inc = increment > 0 ? increment : 2.5;
  return Math.round(weight / inc) * inc;
}

/** Apply a percent/drop basis to a reference weight, rounded + floored. */
export function applyBasis(refWeight: number, basis: WeightBasis, value: number, rounding = 2.5): number {
  const raw = basis === "percent" ? refWeight * (value / 100) : refWeight - value;
  return roundToIncrement(Math.max(0, raw), rounding);
}

/**
 * Reference weight for a dependent set: the reference set's LOGGED weight if present, else its
 * fixed prescribed weight. Returns null when neither is known (badge shows, prefill waits).
 */
export function resolveReferenceWeight(
  refLoggedWeight: number | null | undefined,
  refPrescribedWeight: number | null | undefined,
): number | null {
  if (refLoggedWeight != null && Number.isFinite(refLoggedWeight)) return refLoggedWeight;
  if (refPrescribedWeight != null && Number.isFinite(refPrescribedWeight)) return refPrescribedWeight;
  return null;
}

/** Computed prefill weight for a back-off set, or null if the reference weight isn't known yet. */
export function computeBackoffWeight(
  spec: BackoffSpec,
  refLoggedWeight: number | null | undefined,
  refPrescribedWeight: number | null | undefined,
): number | null {
  const ref = resolveReferenceWeight(refLoggedWeight, refPrescribedWeight);
  if (ref == null) return null;
  return applyBasis(ref, spec.basis, spec.value, spec.rounding ?? 2.5);
}

/** Computed weight for a drop branch off its parent set's (logged-or-prescribed) weight. */
export function computeDropWeight(
  branch: DropBranch,
  parentLoggedWeight: number | null | undefined,
  parentPrescribedWeight: number | null | undefined,
): number | null {
  const ref = resolveReferenceWeight(parentLoggedWeight, parentPrescribedWeight);
  if (ref == null) return null;
  return applyBasis(ref, branch.basis, branch.value, 2.5);
}

/** True when a set is AMRAP (rep-range target suppressed; client logs reps freely). */
export function isAmrapSet(set: { amrap?: boolean }): boolean {
  return set.amrap === true;
}

/** True when a set's weight derives from a reference set. */
export function isBackoffSet(set: { weight_mode?: string; backoff?: unknown }): boolean {
  return set.weight_mode === "backoff" && set.backoff != null;
}

/** Drop branches on a set (ignores rest_repeat / other branch types). */
export function dropBranches(set: { branches?: Array<{ type: string }> }): DropBranch[] {
  return (set.branches ?? []).filter((b): b is DropBranch => b.type === "drop");
}

/** Short badge label for a set instruction, e.g. "back-off 90% · S1", "drop −10kg", "AMRAP". */
export function backoffBadgeLabel(spec: BackoffSpec): string {
  const amount = spec.basis === "percent" ? `${spec.value}%` : `−${spec.value}kg`;
  return `back-off ${amount} · S${spec.ref_set_index + 1}`;
}

export function dropBadgeLabel(branch: DropBranch): string {
  return branch.basis === "percent" ? `drop ${branch.value}%` : `drop −${branch.value}kg`;
}
