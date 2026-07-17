/**
 * WK5 — per-set type marker (warm-up / drop / failure), stored in the existing
 * exercise_set_logs.performed_json blob under `set_type` (no migration; same pattern as
 * performed_time / performed_side). Default 'normal' is implicit — it's never persisted and
 * shows no chip.
 *
 * The one analytics touch lives in setTonnage (workoutFlags): a warm-up set is not working
 * volume. drop/failure ARE working sets and still count.
 */
export type SetType = "normal" | "warmup" | "drop" | "failure";

/** Selectable types in the logger, in display order. */
export const SET_TYPES: readonly SetType[] = ["normal", "warmup", "drop", "failure"] as const;

/** Coerce a raw performed_json value into a SetType (unknown / 'normal' → 'normal'). */
export function parseSetType(v: unknown): SetType {
  return v === "warmup" || v === "drop" || v === "failure" ? v : "normal";
}

export const SET_TYPE_LABEL: Record<SetType, string> = {
  normal: "Normal",
  warmup: "Warm-up",
  drop: "Drop",
  failure: "Failure",
};

/**
 * Chip styling per non-normal type. Deliberately CALM — no red / alarm: warm-up is muted, drop
 * is a soft amber (attention token), failure is a soft slate (neutral token). 'normal' has no
 * chip, so it isn't in this map.
 */
export const SET_TYPE_CHIP: Record<Exclude<SetType, "normal">, string> = {
  warmup: "bg-muted text-muted-foreground",
  drop: "bg-status-attention/15 text-status-attention",
  failure: "bg-status-neutral/15 text-status-neutral",
};
