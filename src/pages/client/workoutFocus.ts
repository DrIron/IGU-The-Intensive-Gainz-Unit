/**
 * Slice 2 — the canonical client workout player opens straight INTO the workout instead of a forced
 * pre-workout start-list. Given the loaded exercises + their set logs, decide the initial view:
 *
 *  - FOCUS on the first INCOMPLETE, non-skipped exercise (resume; a fresh session, where every set is
 *    incomplete, lands on exercise 1), OR
 *  - stay on the OVERVIEW when nothing is incomplete — a fully-complete session (so the Finish
 *    affordance stays directly reachable) or an empty module (no exercise to focus, no crash).
 *
 * Mirrors the resume target the old "Begin workout" CTA computed, so behaviour is unchanged except
 * that the client no longer has to tap through the start screen.
 */
export function computeInitialFocus(
  exercises: { id: string; skipped?: boolean }[],
  logsByExercise: Record<string, { completed: boolean; skipped: boolean }[] | undefined>,
): { mode: "overview" | "focus"; focusIndex: number } {
  const firstIncomplete = exercises.findIndex((ex) => {
    const logs = logsByExercise[ex.id];
    return !ex.skipped && !!logs && logs.some((l) => !l.completed && !l.skipped);
  });
  return firstIncomplete >= 0
    ? { mode: "focus", focusIndex: firstIncomplete }
    : { mode: "overview", focusIndex: 0 };
}
