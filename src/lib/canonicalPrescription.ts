/**
 * Program system unification P3 — build a legacy-shaped prescription snapshot from a
 * canonical plan_slot, for the WorkoutSessionV2 canonical read path (behind a flag).
 *
 * ⚠️ MUST MIRROR the inline `buildPrescription` / `buildActivityPrescription` in
 * src/components/coach/programs/muscle-builder/ConvertToProgram.tsx — that is the source
 * of truth for how a muscle slot becomes the prescription the client logger renders. The
 * P3 parity check compares this resolver's output against the legacy client_* render, so
 * if ConvertToProgram's builders change, change these in lockstep. Deliberately duplicated
 * (not imported) to keep the conversion default path untouched per the P3 brief.
 *
 * SCOPE: base prescription parity only. The per-set instruction family (amrap / weight_mode
 * / backoff / branches — P1 schema addendum) is NOT resolved here; that math pairs with P4.
 */

import type { MuscleSlotData } from "@/types/muscle-builder";
import type { SetPrescription, ColumnConfig } from "@/types/workout-builder";
import { defaultColumnsForActivityType } from "@/types/workout-builder";

/** The legacy prescription_snapshot_json shape WorkoutSessionV2 reads. */
export interface PrescriptionSnapshot {
  set_count: number;
  rep_range_min?: number;
  rep_range_max?: number;
  intensity_type?: string;
  intensity_value?: number;
  rest_seconds?: number | null;
  rest_seconds_max?: number;
  tempo?: string;
  sets_json: SetPrescription[];
  column_config?: ColumnConfig[];
}

/** A subset of MuscleSlotData sufficient to build a prescription. */
export type PrescribableSlot = Pick<
  MuscleSlotData,
  | "sets" | "repMin" | "repMax" | "tempo" | "rir" | "rpe" | "setsDetail"
  | "activityType" | "duration" | "distance" | "pace" | "rounds"
  | "workSeconds" | "restSeconds" | "activityNotes"
>;

export function isStrengthSlot(slot: PrescribableSlot): boolean {
  return !slot.activityType || slot.activityType === "strength";
}

/** Strength prescription — mirrors ConvertToProgram.buildPrescription. */
export function buildStrengthPrescriptionSnapshot(
  slot: PrescribableSlot,
  presetColumnConfig: ColumnConfig[] | null,
): PrescriptionSnapshot {
  const setsJson: SetPrescription[] =
    slot.setsDetail && slot.setsDetail.length > 0
      ? slot.setsDetail
      : Array.from({ length: slot.sets || 3 }, (_, si) => {
          const repMin = slot.repMin ?? 8;
          const repMax = slot.repMax ?? 12;
          const hasRpe = slot.rpe != null && slot.rir == null;
          return {
            set_number: si + 1,
            rep_range_min: repMin,
            rep_range_max: repMax,
            rest_seconds: 90,
            ...(hasRpe ? { rpe: slot.rpe } : { rir: slot.rir ?? 2 }),
            ...(slot.tempo ? { tempo: slot.tempo } : {}),
          };
        });

  const firstSet = setsJson[0] || ({} as SetPrescription);
  const repMin = firstSet.rep_range_min ?? slot.repMin ?? 8;
  const repMax = firstSet.rep_range_max ?? slot.repMax ?? 12;
  const hasRpe =
    (firstSet.rpe != null && firstSet.rir == null) || (slot.rpe != null && slot.rir == null);
  const intensityType = hasRpe ? "RPE" : "RIR";
  const intensityValue = hasRpe
    ? firstSet.rpe ?? slot.rpe ?? 8
    : firstSet.rir ?? slot.rir ?? 2;

  const snapshot: PrescriptionSnapshot = {
    set_count: setsJson.length,
    rep_range_min: repMin,
    rep_range_max: repMax,
    intensity_type: intensityType,
    intensity_value: intensityValue,
    rest_seconds: firstSet.rest_seconds ?? 90,
    sets_json: setsJson,
  };
  if (firstSet.rest_seconds_max != null) snapshot.rest_seconds_max = firstSet.rest_seconds_max;
  if (firstSet.tempo ?? slot.tempo) snapshot.tempo = firstSet.tempo ?? slot.tempo;
  if (presetColumnConfig != null) snapshot.column_config = presetColumnConfig;
  return snapshot;
}

/** Activity (non-strength) prescription — mirrors ConvertToProgram.buildActivityPrescription. */
export function buildActivityPrescriptionSnapshot(slot: PrescribableSlot): PrescriptionSnapshot {
  const at = slot.activityType;
  const isHiit = at === "hiit";
  const durationSec = slot.duration != null ? slot.duration * 60 : undefined;
  const setCount = isHiit && slot.rounds && slot.rounds > 0 ? slot.rounds : 1;
  const baseSet: Record<string, unknown> = isHiit
    ? {
        ...(slot.workSeconds != null ? { time_seconds: slot.workSeconds } : {}),
        ...(slot.restSeconds != null ? { rest_seconds: slot.restSeconds } : {}),
        ...(slot.rounds != null ? { rounds: slot.rounds } : {}),
      }
    : {
        ...(durationSec != null ? { time_seconds: durationSec } : {}),
      };
  if (slot.distance != null) baseSet.distance_meters = slot.distance;
  if (slot.pace) baseSet.pace = slot.pace;
  if (slot.activityNotes) baseSet.notes = slot.activityNotes;
  const setsJson = Array.from({ length: setCount }, (_, si) => ({
    set_number: si + 1,
    ...baseSet,
  })) as SetPrescription[];
  return {
    set_count: setCount,
    rest_seconds: slot.restSeconds ?? null,
    sets_json: setsJson,
    column_config: defaultColumnsForActivityType(at),
  };
}

/**
 * Reconstruct a PrescribableSlot from a canonical plan_slots.prescription_json blob
 * (the shape save_plan_from_builder writes). Inverse of the P1 materializer's slot mapping.
 */
export function slotFromPrescriptionJson(pj: Record<string, unknown>): PrescribableSlot {
  const num = (v: unknown): number | undefined =>
    typeof v === "number" ? v : v == null ? undefined : Number(v);
  return {
    sets: num(pj.sets) ?? 0,
    repMin: num(pj.repMin) ?? 0,
    repMax: num(pj.repMax) ?? 0,
    tempo: typeof pj.tempo === "string" ? pj.tempo : undefined,
    rir: num(pj.rir),
    rpe: num(pj.rpe),
    setsDetail: Array.isArray(pj.setsDetail) ? (pj.setsDetail as SetPrescription[]) : undefined,
    activityType: (pj.activityType as MuscleSlotData["activityType"]) ?? undefined,
    duration: num(pj.duration),
    distance: num(pj.distance),
    pace: typeof pj.pace === "string" ? pj.pace : undefined,
    rounds: num(pj.rounds),
    workSeconds: num(pj.workSeconds),
    restSeconds: num(pj.restSeconds),
    activityNotes: typeof pj.activityNotes === "string" ? pj.activityNotes : undefined,
  };
}
