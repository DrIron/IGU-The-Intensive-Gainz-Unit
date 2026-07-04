/**
 * Section registry for the Team Detail shell's secondary nav. Slugs are the
 * allowed values for `?tab=<slug>` on `/coach/teams/:teamId`. Kept separate from
 * the nav component so the component stays a pure export (react-refresh happy).
 * Mirrors client-overview/sections.ts, minus per-role filtering — team sections
 * are always coach/admin.
 */
export const TEAM_SECTION_SLUGS = ["pulse", "nutrition", "program", "roster", "waitlist"] as const;

export type TeamSectionSlug = (typeof TEAM_SECTION_SLUGS)[number];

/** Slug rendered when `?tab` is missing or invalid. */
export const defaultTeamSection = (): TeamSectionSlug => "pulse";
