// Friendly labels for the terse equipment codes the exercise library stores (there is no
// equipment lookup table in the DB). Shared by the demo card, browse, and admin so a code renders
// the same everywhere. Unknown / already-friendly values (e.g. "Assault Bike", "Treadmill") pass
// through unchanged.

const EQUIPMENT_LABELS: Record<string, string> = {
  BB: "Barbell",
  DB: "Dumbbell",
  BW: "Bodyweight",
  KB: "Kettlebell",
  SM: "Smith Machine",
  M: "Machine",
  TB: "Trap Bar",
  BND: "Band",
  Band: "Band",
  Belt: "Belt",
  Sled: "Sled",
  C: "Cable",
};

/** Friendly equipment label. Any `C-*` cable subtype (C-FT, C-AA, C-SG, …) collapses to "Cable". */
export function equipmentLabel(code: string | null | undefined): string {
  if (!code) return "";
  const known = EQUIPMENT_LABELS[code];
  if (known) return known;
  if (code.startsWith("C-")) return "Cable";
  // Already-friendly or unrecognised — show it as-is rather than inventing a label.
  return code;
}
