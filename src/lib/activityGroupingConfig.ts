/**
 * ACTIVITY_GROUPING_CONFIG (Phase 3, D4 decision — a FRONTEND CONSTANT, not an RPC).
 *
 * Per exercise-library category, the ordered list of volume "lenses" the multi-lens rail renders.
 * Each lens names its data `source` + `volumeMetric` (+ optional drilldown/secondary), so the rail
 * reads lenses from config rather than hardcoding them. 3a consumes the strength/powerlifting +
 * cardio lenses; 3b will use the same config to drive the group-pick add-flow.
 */

export type VolumeMetric = "sets_landmark" | "sets_count" | "minutes";

export interface LensDef {
  /** stable id: muscle | movement | modality | region */
  id: string;
  label: string;
  /** where the lens sources its groups: MUSCLE_GROUPS | get_movement_group_config | cardio_movement | target_region | technique */
  source: string;
  volumeMetric: VolumeMetric;
  /** drill-down dimension, if any: subdivision | subGroup | hr_zone */
  drilldown?: string;
  /** secondary metric shown alongside (e.g. cardio hr_zone distribution) */
  secondaryMetric?: string;
  /** when a metric has no primary value (e.g. mobility with no duration), fall back to this metric */
  fallbackMetric?: VolumeMetric;
}

const STRENGTH_LENSES: LensDef[] = [
  { id: "muscle", label: "Muscle", source: "MUSCLE_GROUPS", volumeMetric: "sets_landmark", drilldown: "subdivision" },
  { id: "movement", label: "Movement", source: "get_movement_group_config", volumeMetric: "sets_count", drilldown: "subGroup" },
];

export const ACTIVITY_GROUPING_CONFIG: Record<string, LensDef[]> = {
  strength: STRENGTH_LENSES,
  powerlifting: STRENGTH_LENSES,
  cardio: [
    { id: "modality", label: "Cardio", source: "cardio_movement", volumeMetric: "minutes", secondaryMetric: "hr_zone", drilldown: "hr_zone" },
  ],
  mobility: [
    { id: "region", label: "Region", source: "target_region", volumeMetric: "minutes", fallbackMetric: "sets_count" },
  ],
  warmup: [
    { id: "region", label: "Region", source: "technique", volumeMetric: "minutes", fallbackMetric: "sets_count" },
  ],
  // Deferred stubs — uniform shape, no lenses yet.
  cooldown: [],
  physio: [],
  systemic: [],
  sport_specific: [],
};
