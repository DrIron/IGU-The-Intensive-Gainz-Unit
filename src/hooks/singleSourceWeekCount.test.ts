import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * STRUCTURAL INVARIANT — nobody re-inlines the legacy week count.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The legacy week count — `ceil(max(program_template_days.day_index) / 7)` — was
 * COPY-PASTED. PR #202 repointed `computeProgramWeeks` at canonical `plan_weeks` and
 * declared it "the last legacy consumer". It wasn't: `MesocyclePicker` held an inline
 * copy with the identical silent-failure mode (after the legacy drop the table returns
 * nothing, every count floors to 1, and an 8-week mesocycle is offered as "1 week").
 * One copy was fixed; the other was missed — because grepping for a FUNCTION NAME
 * cannot find duplicated LOGIC.
 *
 * So this scans the source for the PATTERN and pins it to a known allowlist. A new
 * copy fails this test and is named. It guards a structural invariant, not behaviour,
 * hence the source scan.
 *
 * ── What the allowlist actually revealed ────────────────────────────────────
 * Writing this turned up TWO more legacy consumers nobody had catalogued. They are
 * grandfathered with reasons below — not because they're fine, but so they're VISIBLE
 * when `program_template_days` is dropped. Every one of them breaks at the drop.
 */

const SRC = join(process.cwd(), "src");

/**
 * Files permitted to derive a week count from the legacy tree, and why.
 * Adding to this list should be a deliberate, argued act — not a reflex.
 */
const ALLOWED: Record<string, string> = {
  [join("src", "hooks", "useMacrocycles.ts")]:
    "computeProgramWeeks' FALLBACK — the sole owner. Canonical plan_weeks first; the " +
    "legacy read runs only for a program_template with no canonical plan to measure, " +
    "and floors safely at 1 post-drop.",

  [join("src", "components", "coach", "programs", "useProgramSummaries.ts")]:
    "PR2's LEGACY SHIM — week count for a library row with no canonical mirror " +
    "(prod has one: an orphaned double-conversion). Dies with the legacy tables.",

  [join("src", "components", "coach", "programs", "ProgramCalendarBuilder.tsx")]:
    "The LEGACY program-calendar EDITOR. It reads and writes program_template_days by " +
    "definition, so its grid math is inherently legacy. It does not survive the drop — " +
    "it must be migrated or retired with it. FLAGGED for the legacy burn-down.",

  [join("src", "hooks", "useProgramCalendar.ts")]:
    "The LEGACY program-calendar hook — same surface as ProgramCalendarBuilder, same " +
    "fate. FLAGGED for the legacy burn-down.",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Strip comments so a doc-comment naming the table isn't a false positive. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** A LIVE read of the legacy tree, combined with a ÷7 week computation. */
function derivesWeeksFromLegacy(code: string): boolean {
  const readsLegacy = /\.from\(\s*["']program_template_days["']\s*\)/.test(code);
  const computesWeeks = /Math\.ceil\([^;]*\/\s*7\s*\)/.test(code);
  return readsLegacy && computesWeeks;
}

describe("legacy week count — no new copies", () => {
  const files = walk(SRC);

  it("every file deriving weeks from program_template_days is on the allowlist", () => {
    const found = files
      .filter((f) => derivesWeeksFromLegacy(stripComments(readFileSync(f, "utf8"))))
      .map((f) => f.replace(process.cwd() + "/", ""))
      .sort();

    const unexpected = found.filter((f) => !(f in ALLOWED));

    expect(
      unexpected,
      `A NEW copy of the legacy week count appeared. Do not re-inline it — call ` +
        `computeProgramWeeks (src/hooks/useMacrocycles.ts), which uses canonical ` +
        `plan_weeks and falls back to legacy only when there is no canonical plan. ` +
        `Offending file(s): ${unexpected.join(", ")}`,
    ).toEqual([]);
  });

  it("the allowlist has no stale entries (a fixed file must be removed from it)", () => {
    const found = new Set(
      files
        .filter((f) => derivesWeeksFromLegacy(stripComments(readFileSync(f, "utf8"))))
        .map((f) => f.replace(process.cwd() + "/", "")),
    );

    const stale = Object.keys(ALLOWED).filter((f) => !found.has(f));

    expect(
      stale,
      `These files are allowlisted but no longer derive weeks from the legacy tree. ` +
        `Remove them from ALLOWED so the list stays honest: ${stale.join(", ")}`,
    ).toEqual([]);
  });

  it("MesocyclePicker no longer reads the legacy tree — it calls computeProgramWeeks", () => {
    const picker = join(SRC, "components", "coach", "programs", "macrocycles", "MesocyclePicker.tsx");
    const code = stripComments(readFileSync(picker, "utf8"));

    expect(code).not.toMatch(/\.from\(\s*["']program_template_days["']\s*\)/);
    expect(code).toContain("computeProgramWeeks");
  });

  it("no macrocycle-layer file touches day_index at all", () => {
    const layer = files.filter((f) => f.includes(join("programs", "macrocycles")));
    const offenders = layer
      .filter((f) => /day_index/.test(stripComments(readFileSync(f, "utf8"))))
      .map((f) => f.replace(process.cwd() + "/", ""));

    expect(
      offenders,
      "The macrocycle layer must get week counts from computeProgramWeeks, never from day_index.",
    ).toEqual([]);
  });
});
