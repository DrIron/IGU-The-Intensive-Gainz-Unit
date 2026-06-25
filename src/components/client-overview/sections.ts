/**
 * Section registry for the Client Overview shell's secondary nav. The slugs
 * here are the allowed values for the `?tab=<slug>` URL parameter on
 * `/coach/clients/:clientUserId`. Kept in its own file so the nav component
 * can stay a pure component export (react-refresh happy).
 */
import type { ViewerRole } from "./types";

export const SECTION_SLUGS = [
  "overview",
  "nutrition",
  "workouts",
  "sessions",
  "messages",
  "care-team",
  "profile",
] as const;

export type SectionSlug = (typeof SECTION_SLUGS)[number];

/**
 * Slugs a dietitian never sees: they can't build programs or action workout
 * adherence, so the workouts/sessions tabs would be dead weight. Everything
 * else stays. Coaches and admins see the full registry.
 */
const DIETITIAN_HIDDEN_SLUGS: ReadonlySet<SectionSlug> = new Set([
  "workouts",
  "sessions",
]);

/**
 * The ordered subset of sections a given viewer role may see. Order is
 * inherited from SECTION_SLUGS -- this only filters, never reorders.
 */
export function visibleSectionsForRole(role: ViewerRole): readonly SectionSlug[] {
  if (role === "dietitian") {
    return SECTION_SLUGS.filter((slug) => !DIETITIAN_HIDDEN_SLUGS.has(slug));
  }
  return SECTION_SLUGS;
}

/**
 * The slug that renders when `?tab` is missing or invalid for the role.
 * Also the slug whose URL state is "no `?tab` param" -- a dietitian on the
 * bare `/coach/clients/X` URL lands on Nutrition with no param appended.
 */
export function defaultSectionForRole(role: ViewerRole): SectionSlug {
  return role === "dietitian" ? "nutrition" : "overview";
}
