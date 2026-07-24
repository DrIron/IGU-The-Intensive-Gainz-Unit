/**
 * Slice 3 — client-facing muscle GROUP label for the canonical workout player.
 *
 * `exercise_library.primary_muscle` (free text) is inconsistent — mixed muscle vs subdivision level
 * ("Rear Delts / Upper Back / Iliac Lat"), and NULL for canonical rows. Resolve the canonical
 * `muscle_id` → a friendly, consistent GROUP level instead:
 *   - LIMB regions (Legs, Arms): the muscle name (Quads / Hamstrings / Glutes / Triceps / Calves …).
 *   - TORSO regions (Chest, Back, Shoulders, Core, Neck, …): the coarser body-region name.
 *   - one alias: the anatomical "Elbow Flexors" reads "Biceps".
 * Never shows the subdivision qualifier. Falls back to `fallback` (primary_muscle text) when the
 * muscle_id doesn't resolve — e.g. cardio/mobility/warmup rows have no muscle group.
 */

interface MuscleNode { id: string; display_name: string; primary_region_id: string }
interface RegionNode { id: string; display_name: string }

const LIMB_REGIONS = new Set(["Legs", "Arms"]);
const MUSCLE_ALIAS: Record<string, string> = { "Elbow Flexors": "Biceps" };

export function muscleGroupLabel(
  muscleId: string | null | undefined,
  fallback: string,
  taxonomy: { muscles: MuscleNode[]; regions: RegionNode[] } | undefined,
): string {
  if (!muscleId || !taxonomy) return fallback;
  const muscle = taxonomy.muscles.find((m) => m.id === muscleId);
  if (!muscle) return fallback;
  const region = taxonomy.regions.find((r) => r.id === muscle.primary_region_id);
  if (region && LIMB_REGIONS.has(region.display_name)) {
    return MUSCLE_ALIAS[muscle.display_name] ?? muscle.display_name;
  }
  return region?.display_name ?? muscle.display_name;
}
