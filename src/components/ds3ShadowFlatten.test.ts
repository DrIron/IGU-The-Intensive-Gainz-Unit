import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * DS3-tail guard — DS3-core flattened the ClickableCard primitive; this removed the decorative
 * depth callers hand-added to in-flow cards/tiles/panels, which clashed with the flat surface
 * language. A source scan keeps a decorative shadow from creeping back.
 *
 * Shadows that survive are FUNCTIONAL, not decorative, and each is allow-listed with its reason:
 *   - floating/overlay elements that need depth to read as ABOVE the page
 *   - drag-lift elevation that appears ONLY while an item is being dragged
 *   - an inset shadow used as a 1px inner border (a ring, not elevation)
 * (Primitives under src/components/ui/ own their own elevation and are out of scope.)
 */

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const UI_DIR = join("src", "components", "ui"); // primitives — excluded

// Any shadow utility that renders depth (size-based or arbitrary), NOT shadow-none.
const SHADOW = /(?:\bhover:)?\bshadow-(?:sm|md|lg|xl|2xl|inner|\[)/;

// Files permitted to keep a shadow, each with the functional reason it stays.
const ALLOW = new Set([
  "components/Navigation.tsx", // slide-in mobile menu overlay — floats over the page
  "components/PlaylistManager.tsx", // drag-lift (only while dragging)
  "components/coach/DebugBanner.tsx", // fixed-position floating debug overlay
  "components/admin/RoutesDebugPanel.tsx", // fixed-position floating debug overlay
  "components/marketing/WhatsAppButton.tsx", // fixed floating action button
  "components/coach/programs/CoachProgramsPage.tsx", // fixed floating action button
  "components/educational/LinkedContentList.tsx", // drag-lift (only while dragging)
  "components/coach/programs/muscle-builder/ActivitySlotCard.tsx", // drag-lift
  "components/coach/programs/muscle-builder/MuscleSlotCard.tsx", // drag-lift
  "components/coach/programs/ExerciseCardV2.tsx", // drag-lift (resting state flattened)
  "components/coach/programs/muscle-builder/studio/StudioSlotCard.tsx", // drag-lift
  "components/coach/programs/muscle-builder/studio/StudioDayColumn.tsx", // inset shadow = inner border, not depth
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".tsx") && !full.endsWith(".test.tsx")) out.push(full);
  }
  return out;
}

describe("DS3-tail — no decorative in-flow shadows outside the primitives", () => {
  it("only the documented functional-elevation sites keep a shadow", () => {
    const offenders = walk(SRC)
      .filter((f) => !f.startsWith(join(ROOT, UI_DIR)))
      .filter((f) => SHADOW.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f).split("\\").join("/"))
      .filter((rel) => !ALLOW.has(rel));

    expect(offenders).toEqual([]);
  });

  it("every allow-listed functional shadow is still present (we didn't over-flatten)", () => {
    for (const rel of ALLOW) {
      const src = readFileSync(join(SRC, rel), "utf8");
      expect(SHADOW.test(src), `${rel} should still carry its functional shadow`).toBe(true);
    }
  });
});
