import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CC11-a guard — IGU flips dir=rtl for Arabic, but PHYSICAL directional Tailwind utilities
 * (mr-/ml-/pr-/pl-, left-/right-, text-left/right, rounded-l|r, border-l|r) don't flip, so these
 * shipped/public surfaces would render mirrored-wrong. They must use LOGICAL utilities
 * (me-/ms-/pe-/ps-, start-/end-, text-start/end) that auto-flip.
 *
 * A source scan keeps a physical util from creeping back into the swept files. The ONE
 * intentionally-physical case is allow-listed: CoachPublicProfile's decorative corner watermark
 * (bottom-2 right-3), which is not tied to reading direction and must stay in the same visual
 * corner regardless of dir (the DayColumn judgment-not-blind-swap lesson).
 */

const ROOT = process.cwd();

const SWEPT_FILES = [
  "src/pages/MeetOurTeam.tsx",
  "src/pages/Testimonials.tsx",
  "src/components/marketing/TestimonialsList.tsx",
  "src/components/nutrition/NutritionPhaseCard.tsx",
  "src/components/coach/CoachSessions.tsx",
  "src/components/client-overview/tabs/NutritionTab.tsx",
  "src/components/coach/CoachPublicProfile.tsx",
];

// Physical directional utilities. Word boundaries keep rounded-lg / justify-start / border-2 out.
const PHYSICAL = [
  /\b(?:mr|ml|pr|pl)-[\d.]/,            // margin/padding left|right
  /\b(?:left|right)-[\d.[]/,            // absolute positioning
  /\btext-(?:left|right)\b/,            // text alignment
  /\brounded-(?:l|r|tl|tr|bl|br)\b/,    // directional corner rounding
  /\bborder-(?:l|r)\b/,                 // directional border side
];

// Documented exceptions (intentionally physical). Matched by substring on the offending line.
const ALLOW = new Map<string, string[]>([
  ["src/components/coach/CoachPublicProfile.tsx", ["bottom-2 right-3"]], // decorative corner watermark
]);

function physicalHits(rel: string): string[] {
  const src = readFileSync(join(ROOT, rel), "utf8");
  const allowed = ALLOW.get(rel) ?? [];
  return src
    .split("\n")
    .filter((line) => PHYSICAL.some((re) => re.test(line)))
    .filter((line) => !allowed.some((a) => line.includes(a)));
}

describe("CC11-a — swept surfaces use logical (RTL-flipping) utilities", () => {
  it.each(SWEPT_FILES)("%s has no physical directional utility (save documented exceptions)", (rel) => {
    expect(physicalHits(rel)).toEqual([]);
  });

  it("the allow-listed watermark IS still present (we didn't accidentally flip it)", () => {
    const src = readFileSync(join(ROOT, "src/components/coach/CoachPublicProfile.tsx"), "utf8");
    expect(src).toContain("bottom-2 right-3");
  });
});
