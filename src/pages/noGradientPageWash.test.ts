import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * DS2 guard — the authed/utility shells + utility pages must use the FLAT page surface
 * (`bg-background`), never a `bg-gradient-* from-background …` page wash. This extends the PUB8
 * public-page flatten. A source scan keeps a wash from creeping back.
 *
 * Scope is deliberately narrow: only PAGE washes (gradients that fade FROM the page background)
 * are forbidden. Decorative component gradients — icon-badge chips (`from-primary to-accent`),
 * card-accent washes (`from-primary/10 …`), gradient text — are broadly used app-wide and out of
 * DS2's scope; they're intentionally left (a separate component-wash sweep can revisit them).
 */

const ROOT = process.cwd();

// Every shell/page DS2 flattened. A page wash is `bg-gradient-<dir> from-background …`.
const FLATTENED_FILES = [
  "src/components/admin/AdminPageLayout.tsx",
  "src/components/admin/AdminDashboardLayout.tsx",
  "src/pages/WorkoutLibrary.tsx",
  "src/pages/EducationalVideos.tsx",
  "src/pages/BillingPayment.tsx",
  "src/pages/PaymentStatus.tsx",
  "src/pages/PaymentReturn.tsx",
  "src/pages/Auth.tsx",
  "src/pages/ResetPassword.tsx",
  "src/pages/EmailPending.tsx",
  "src/pages/EmailConfirmed.tsx",
  "src/pages/NotFound.tsx",
  "src/pages/Unauthorized.tsx",
  "src/pages/CoachSignup.tsx",
  "src/pages/CoachPasswordSetup.tsx",
];

// A gradient page-wash: `bg-gradient-to-<dir> from-background …` (fades from the page bg).
const PAGE_WASH = /bg-gradient-to-\w+\s+from-background\b/;

describe("DS2 — no gradient page washes in the flattened shells/pages", () => {
  it.each(FLATTENED_FILES)("%s uses the flat bg-background surface, no page wash", (rel) => {
    const src = readFileSync(join(ROOT, rel), "utf8");
    const offending = src.split("\n").filter((line) => PAGE_WASH.test(line));
    expect(offending).toEqual([]);
    // And it does adopt the flat surface somewhere.
    expect(src).toContain("bg-background");
  });

  it("the retired PaymentStatusDashboard button carries no gradient classes", () => {
    const src = readFileSync(join(ROOT, "src/components/PaymentStatusDashboard.tsx"), "utf8");
    expect(src).not.toMatch(/bg-gradient/);
  });
});
