/**
 * Estimated one-rep-max (e1RM) — single source for PR/strength-estimate math.
 *
 * Epley formula: 1RM ≈ w · (1 + reps/30). At reps = 1 it returns the weight
 * itself. All inputs/outputs are in canonical kilograms (the logger stores
 * `exercise_set_logs.performed_load` in kg); unit conversion is a display
 * concern handled separately by `src/utils/weightUnits.ts`.
 *
 * Keep PR/e1RM math here rather than inline in components (the workout logger
 * historically computed PB inline — converge on this helper).
 */

/** Epley estimated 1RM in kg. Returns 0 for non-positive weight/reps. */
export function epley1RM(weightKg: number, reps: number): number {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps)) return 0;
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}
