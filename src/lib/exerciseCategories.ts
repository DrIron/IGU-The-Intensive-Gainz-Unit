/**
 * Single source of truth for `exercise_library.category`.
 *
 * Both the library browse (ExerciseBrowse category strip) and the planning-board picker
 * (UnifiedSessionPicker category tabs) derive their category list from here, so the two can never
 * drift again (they used to hand-maintain separate copies — the powerlifting/systemic categories
 * were missing from muscle-plan creation as a result).
 *
 * Order = display order. Keep in sync with the `exercise_category` Postgres enum — add an entry here
 * when the enum grows, and map the new value in `exerciseCategoryToActivityType` (src/types/muscle-builder.ts).
 */
export interface ExerciseCategoryDef {
  value: string;
  label: string;
}

export const EXERCISE_CATEGORIES: ExerciseCategoryDef[] = [
  { value: "strength", label: "Strength" },
  { value: "cardio", label: "Cardio" },
  { value: "mobility", label: "Mobility" },
  { value: "physio", label: "Physio" },
  { value: "warmup", label: "Warmup" },
  { value: "cooldown", label: "Cooldown" },
  { value: "sport_specific", label: "Sport-Specific" },
  { value: "systemic", label: "Systemic" },
  { value: "powerlifting", label: "Powerlifting" },
];

/** The "All" pseudo-category — only surfaces where an all-categories view makes sense (library browse). */
export const ALL_CATEGORY: ExerciseCategoryDef = { value: "all", label: "All" };
