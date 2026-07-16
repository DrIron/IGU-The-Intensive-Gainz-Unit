import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * CC9 completeness guard — a bare `<Card onClick>` lacks role="button", tab focusability,
 * keyboard activation and a focus ring, so keyboard + screen-reader users can't operate it.
 * Every such site must be a <ClickableCard> instead. This scans the whole source tree so a new
 * bare `<Card onClick>` can't sneak back in.
 *
 * Two files are intentionally allowed to match:
 *   - clickable-card.tsx — the primitive itself renders the underlying `<Card onClick>`.
 *   - DayColumn.tsx — a drag-and-drop EDITING container (documented in-file). Wrapping its whole
 *     interactive surface in role="button" would nest interactive content in a button, an a11y
 *     anti-pattern worse than the bare onClick; a keyboard path there is a separate slice.
 */

const SRC = join(process.cwd(), "src");
const ALLOWED = new Set([
  "components/ui/clickable-card.tsx",
  "components/coach/programs/muscle-builder/DayColumn.tsx",
]);

// `<Card` … `onClick`, allowing newlines inside the opening tag (no `>` between them).
const CARD_ONCLICK = /<Card\b[^>]*?onClick/s;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    // Component source only — test files legitimately mention "<Card onClick>" in prose.
    else if (full.endsWith(".tsx") && !full.endsWith(".test.tsx")) out.push(full);
  }
  return out;
}

describe("CC9 — no bare <Card onClick> in src/", () => {
  it("every clickable Card is a ClickableCard (accessible), save the documented exceptions", () => {
    const offenders = walk(SRC)
      .filter((f) => CARD_ONCLICK.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f).split("\\").join("/"))
      .filter((rel) => !ALLOWED.has(rel));

    expect(offenders).toEqual([]);
  });

  it("also has no bare <Alert onClick> (those became keyboard-operable buttons)", () => {
    const offenders = walk(SRC)
      .filter((f) => /<Alert\b[^>]*?onClick/s.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f).split("\\").join("/"));

    expect(offenders).toEqual([]);
  });
});
