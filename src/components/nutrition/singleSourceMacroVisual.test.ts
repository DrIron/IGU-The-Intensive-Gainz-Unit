import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * STRUCTURAL INVARIANT — one calorie+macro display, and a ribbon list that can't rot.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Part IV's rule is that any surface presenting calories + macros AS ITS SUBJECT renders
 * `NutritionSummary`. That rule is only as real as the next person's memory of it, and the
 * failure mode is silent: someone reaches for `MacroDonut` directly, or drops a fresh
 * `MacroDistributionRibbon` onto a new card, and the "one unified display" quietly becomes
 * three again. Nothing breaks, nothing errors — it just drifts back.
 *
 * So the source is scanned for the IMPORT, not the name (a doc-comment naming MacroDonut is
 * not a consumer; `import { MacroDonut }` is).
 *
 * ── The ribbon is NOT dead ──────────────────────────────────────────────────
 * It survives in exactly two roles, ruled 2026-07-14 (see FOOD_LOGGING_PLAN.md Part IV and
 * docs/NUTRITION_DONUT_CONVERSION_MOCKUPS.html). Both are listed below WITH their reasons.
 * A third appearance fails this test and has to argue for itself.
 */

const SRC = join(process.cwd(), "src");

/**
 * The ONLY file allowed to import `MacroDonut`. It is the summary's internal ring now, not a
 * component anyone composes with directly.
 */
const DONUT_OWNER = join("src", "components", "nutrition", "NutritionSummary.tsx");

/**
 * Files permitted to render `MacroDistributionRibbon`, and why. Adding to this list should be
 * a deliberate, argued act — not a reflex.
 */
const RIBBON_ALLOWED: Record<string, string> = {
  [join("src", "components", "nutrition", "PhaseSummaryCard.tsx")]:
    "NU6 SHARE CARD. (1) The hero is the RESULT (weight delta), deliberately neutral under " +
    "the NU6 honesty contract — a second, brightly-coloured focal point halves the only " +
    "number the card exists to deliver. (2) It is the one artifact that LEAVES the app: the " +
    "ribbon paints its tokens as backgroundColor on divs, a donut would paint them as an SVG " +
    "stroke — a different path through html-to-image, so a silent colour-drop would ship a " +
    "grey donut to a client's feed. Ribbon stays.",

  [join("src", "components", "nutrition", "NutritionProgress.tsx")]:
    "BLOCK A ONLY — the adjustment notice ('Your plan just updated'). A transient nudge, not " +
    "a hero: a donut turns it into a panel and pushes the plain-language sentence (the actual " +
    "payload) down the card. " +
    "\n" +
    "LIMITATION, stated rather than hidden: this allowlist keys on the FILE, so it cannot tell " +
    "Block A's ribbon from any other in the same file. Block B (the goal-summary card) was a " +
    "4-col macro grid + a ribbon — the identical redundancy NutritionTargetsCard was convicted " +
    "of — and HAS been converted. The file therefore keeps exactly ONE ribbon and gains exactly " +
    "ONE donut, and that split is pinned by NutritionProgress.blocks.test.tsx, which asserts " +
    "the counts directly. If someone converts Block A, or deletes its ribbon along with " +
    "something else, THAT test fails even though this one still passes.",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const rel = (f: string) => f.replace(process.cwd() + "/", "");

/** An actual import, not a mention in prose. */
const importsSymbol = (code: string, symbol: string) =>
  new RegExp(`import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from`, "m").test(code);

describe("one calorie+macro display (Part IV)", () => {
  const files = walk(SRC);

  it("NutritionSummary is the ONLY importer of MacroDonut", () => {
    const importers = files
      .filter((f) => importsSymbol(readFileSync(f, "utf8"), "MacroDonut"))
      .map(rel)
      .sort();

    expect(
      importers,
      "MacroDonut is NutritionSummary's internal ring, not a component to compose with. " +
        "If a surface needs calories + macros, render <NutritionSummary> — that is the whole " +
        "point of Part IV. Offending file(s): " + importers.join(", "),
    ).toEqual([rel(join(process.cwd(), DONUT_OWNER))]);
  });

  it("every MacroDistributionRibbon consumer is on the allowlist, with a reason", () => {
    const consumers = files
      .filter((f) => importsSymbol(readFileSync(f, "utf8"), "MacroDistributionRibbon"))
      .map(rel)
      .sort();

    const unexpected = consumers.filter((f) => !(f in RIBBON_ALLOWED));

    expect(
      unexpected,
      "A NEW ribbon appeared. The ribbon is not the default any more — a surface that shows " +
        "calories + macros as its subject renders <NutritionSummary>. The ribbon survives ONLY " +
        "for (a) a compact notification where a donut would outweigh the message, and (b) the " +
        "NU6 share card. If you believe this is a third case, argue it in the PR and add it to " +
        "RIBBON_ALLOWED with the reason. Offending file(s): " + unexpected.join(", "),
    ).toEqual([]);
  });

  it("the ribbon allowlist has no stale entries (a converted file must be removed from it)", () => {
    const consumers = new Set(
      files.filter((f) => importsSymbol(readFileSync(f, "utf8"), "MacroDistributionRibbon")).map(rel),
    );
    const stale = Object.keys(RIBBON_ALLOWED).filter((f) => !consumers.has(f));

    expect(
      stale,
      `These files are allowlisted but no longer render the ribbon. Remove them so the list ` +
        `stays honest: ${stale.join(", ")}`,
    ).toEqual([]);
  });

  it("the three converted surfaces render NutritionSummary and no macro visual of their own", () => {
    const converted = [
      join("src", "components", "nutrition", "NutritionGoal.tsx"),
      join("src", "components", "client", "NutritionTargetsCard.tsx"),
      join("src", "components", "nutrition", "NutritionPhaseCard.tsx"),
    ];

    for (const f of converted) {
      const code = readFileSync(join(process.cwd(), f), "utf8");
      expect(importsSymbol(code, "NutritionSummary"), `${f} must render NutritionSummary`).toBe(true);
      expect(importsSymbol(code, "MacroDonut"), `${f} must NOT import MacroDonut`).toBe(false);
      expect(importsSymbol(code, "MacroDistributionRibbon"), `${f} must NOT import the ribbon`).toBe(false);
    }
  });
});
