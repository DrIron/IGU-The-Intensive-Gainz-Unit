import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CC6 completion guard — the five priority surfaces must render a layout-shaped SKELETON in their
 * primary loading branch, not a full-page centred Loader2 spinner. This scans the source so the
 * swap can't silently regress back to a spinner (perceived-perf + no layout shift is the point).
 *
 * (Inline button/action spinners — a saving/submitting Loader2 — and small embedded sub-widget
 * loaders are out of scope; the broad ~50-site sweep is deferred.)
 */

const ROOT = process.cwd();

const SURFACES: { file: string; shell: string }[] = [
  { file: "src/components/coach/CoachDashboardOverview.tsx", shell: "MetricCardGridSkeleton" },
  { file: "src/components/coach/DietitianDashboardOverview.tsx", shell: "MetricCardGridSkeleton" },
  { file: "src/components/coach/CoachMyClientsPage.tsx", shell: "RosterRowSkeleton" },
  { file: "src/components/coach/CoachSessions.tsx", shell: "TabShellSkeleton" },
  { file: "src/components/client-overview/ClientOverviewPanel.tsx", shell: "TabShellSkeleton" },
];

/**
 * The primary loading branch renders the shell when, near a loading guard, a `return`/ternary
 * hands back the skeleton component. We look for the shell used as a JSX tag right after a
 * loading condition — proving the spinner was replaced, not merely that the shell is imported.
 */
function loadingBranchRendersShell(src: string, shell: string): boolean {
  const patterns = [
    // if (loading) { return <Shell ... />   (also state.kind === "loading")
    new RegExp(`(?:loading|isLoading|state\\.kind\\s*===\\s*["']loading["'])[^]{0,80}?return\\s*<${shell}\\b`),
    // {loading ? <Shell ... /> : ...}   (allow an optional wrapping paren: `? (` )
    new RegExp(`\\{\\s*(?:loading|isLoading)\\b[^]{0,20}?\\?\\s*\\(?\\s*<${shell}\\b`),
  ];
  return patterns.some((re) => re.test(src));
}

describe("CC6 — the five priority surfaces render a skeleton in their primary loading branch", () => {
  it.each(SURFACES)("$file loads with $shell", ({ file, shell }) => {
    const src = readFileSync(join(ROOT, file), "utf8");

    // The shell is imported from the shared module...
    expect(src).toMatch(/from "@\/components\/ui\/loading-skeleton"/);
    // ...and the primary loading branch renders it — i.e. the full-page spinner was replaced by
    // a layout-shaped skeleton (rendering a skeleton there IS "no full-page spinner").
    // (Inline button/action spinners + small embedded sub-widget loaders are out of scope.)
    expect(loadingBranchRendersShell(src, shell)).toBe(true);
  });
});
