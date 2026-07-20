/**
 * Muscle-synonym layer for the exercise search (extends the ExerciseBrowse haystack — #249).
 *
 * The library stores muscle_group / muscle display names as short LAY terms (verified against prod:
 * "quads", "elbow flexors", "pec major", …). This maps each EXACT stored term (lowercased) to the
 * alternate terms a user might type — anatomical ("quadriceps", "biceps brachii"), common-usage
 * ("hams", "delts"), and REGION words ("legs", "arms", "chest") — so the haystack can carry them and
 * token-AND substring matching hits.
 *
 * Notes:
 *  - Region words (back / legs / arms / shoulders / chest) intentionally recur across several muscles
 *    so a region search returns the whole region. That is desired, not duplication to dedupe.
 *  - `abs` and `core` are deliberately NOT cross-mapped: Abs = rectus/obliques, Core = TVA /
 *    anti-extension. Keep them distinct.
 */
export const MUSCLE_SYNONYMS: Record<string, string[]> = {
  abductors: ["abductor", "hip abductors", "glute medius", "glute med"],
  abs: ["abdominals", "abdominal", "rectus abdominis", "six pack", "stomach", "core work"],
  adductors: ["adductor", "inner thigh", "groin", "legs"],
  calves: ["calf", "gastrocnemius", "gastroc", "soleus", "legs"],
  core: ["trunk", "transverse abdominis", "transversus abdominis", "tva", "midsection"],
  deltoids: ["deltoid", "delts", "delt", "shoulders", "shoulder"],
  "elbow flexors": ["biceps", "bicep", "biceps brachii", "brachialis", "brachioradialis", "elbow flexor", "arms", "arm"],
  forearm: ["forearms", "wrist flexors", "wrist extensors", "grip", "arms"],
  glutes: ["glute", "gluteus", "gluteus maximus", "gluteus medius", "gluteus minimus", "glute max", "glute med", "glute min", "butt", "buttocks", "legs"],
  // "biceps femoris" is deliberately omitted: substring search would pull every hamstring row into a
  // "biceps" query. Hamstrings stay findable via hamstring / hams / ham / semitendinosus / semimembranosus.
  hamstrings: ["hamstring", "hams", "ham", "semitendinosus", "semimembranosus", "legs"],
  "hip flexors": ["hip flexor", "iliopsoas", "psoas"],
  lats: ["lat", "latissimus", "latissimus dorsi", "back"],
  "lower back": ["lower-back", "erector spinae", "spinal erectors", "erectors", "lumbar", "back"],
  "mid back": ["mid-back", "middle back", "rhomboids", "rhomboid", "mid traps", "mid trapezius", "back"],
  neck: ["cervical"],
  obliques: ["oblique", "side abs", "love handles"],
  "pec major": ["pec", "pecs", "pectoral", "pectoralis", "pectoralis major", "chest"],
  "pec minor": ["pectoralis minor", "chest"],
  quads: ["quad", "quadriceps", "quadriceps femoris", "thigh", "legs"],
  "rotator cuff": ["rotator-cuff", "cuff", "infraspinatus", "supraspinatus", "teres minor", "subscapularis", "shoulders"],
  "serratus anterior": ["serratus", "chest"],
  "tibialis anterior": ["tibialis", "tib", "shin", "legs"],
  triceps: ["tricep", "triceps brachii", "arms", "arm"],
  "upper back": ["upper-back", "traps", "trapezius", "upper traps", "teres major", "back"],
  "upper/mid back": ["upper mid back", "upper/mid", "back"],
  systemic: ["full body", "full-body", "conditioning", "complex", "metcon"],
  powerlifting: ["comp lift", "competition lift", "competition"],
};

/** Synonyms for a single stored muscle term (exact, case-insensitive lookup). Empty if unmapped. */
export function muscleSynonyms(term: string | null | undefined): string[] {
  if (!term) return [];
  return MUSCLE_SYNONYMS[term.trim().toLowerCase()] ?? [];
}
