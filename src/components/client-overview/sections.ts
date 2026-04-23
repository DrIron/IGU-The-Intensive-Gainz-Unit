/**
 * Section registry for the Client Overview shell's secondary nav. The slugs
 * here are the allowed values for the `?tab=<slug>` URL parameter on
 * `/coach/clients/:clientUserId`. Kept in its own file so the nav component
 * can stay a pure component export (react-refresh happy).
 */
export const SECTION_SLUGS = [
  "overview",
  "progress",
  "nutrition",
  "workouts",
  "sessions",
  "messages",
  "care-team",
  "profile",
] as const;

export type SectionSlug = (typeof SECTION_SLUGS)[number];
