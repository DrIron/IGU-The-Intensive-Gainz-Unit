/**
 * Factual one-line formatter for a weight-change proof, shared by the phase
 * picker option labels, the /my-testimonials proof chip, and the public render
 * (T3.3). Works on both the get_attachable_weight_phases preview and the stored
 * `attachment` snapshot (same shape). Sign from delta_kg.
 *
 *   { phase_name: "Summer Cut", delta_kg: -2.1, weeks: 4 } → "Summer Cut · −2.1 kg over 4 weeks"
 *   { delta_kg: 3, weeks: 8 }                              → "+3 kg over 8 weeks"
 */
export interface WeightChangeShape {
  phase_name?: string | null;
  delta_kg: number | string;
  weeks: number | string;
}

export function formatWeightChange(w: WeightChangeShape): string {
  const delta = Number(w.delta_kg);
  const weeks = Number(w.weeks);
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const kg = `${sign}${Math.abs(delta)} kg`;
  const weeksLabel = `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  const core = `${kg} over ${weeksLabel}`;
  return w.phase_name ? `${w.phase_name} · ${core}` : core;
}
