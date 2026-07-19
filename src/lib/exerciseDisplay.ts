/**
 * Exercise display-name binding — the interface contract for which label column headlines a surface.
 *
 * `exercise_library` carries two label columns:
 *  - `name`        — the coach shorthand: muscle + equipment code + positioning + movement + a
 *                    trailing `(L/M/S)` resistance tag, e.g. "Glute Max BB Reverse Lunge (L)".
 *                    Always present.
 *  - `client_name` — the friendly client label, e.g. "Glute Max Barbell Reverse Lunge". May be NULL
 *                    for older cardio/mobility/warmup or deactivated rows.
 *
 * The contract:
 *  - COACH-facing surfaces headline `name` (coaches want the precise shorthand).
 *  - CLIENT-facing surfaces headline `client_name`, falling back to `name` so a null client_name
 *    never renders blank.
 *
 * Route every exercise headline through this helper rather than sprinkling the ternary, so the
 * coach/client split stays in one place.
 */
export type ExerciseNameAudience = "coach" | "client";

interface ExerciseNameFields {
  name: string;
  client_name?: string | null;
}

export function getExerciseDisplayName(
  exercise: ExerciseNameFields,
  audience: ExerciseNameAudience,
): string {
  if (audience === "coach") return exercise.name;
  return exercise.client_name?.trim() ? exercise.client_name : exercise.name;
}
