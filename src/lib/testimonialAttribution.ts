/**
 * Attribution → public display name. Single source of truth mirroring the
 * server-side derivation in get_coach_public_testimonials, reused by the coach
 * curation UI (CoachTestimonials), the public rotation (TestimonialsList), and
 * anywhere else a client's name is rendered from a testimonial row.
 *
 *   full_name     → the snapshotted author_display_name
 *   first_initial → "First L." (fallback: first token only)
 *   anonymous     → "IGU client"
 */
export type Attribution = "full_name" | "first_initial" | "anonymous";

export function deriveDisplayName(attribution: Attribution | string, authorDisplayName: string | null): string {
  const raw = (authorDisplayName ?? "").trim();
  if (attribution === "anonymous") return "IGU client";
  if (attribution === "full_name") return raw || "IGU client";
  // first_initial (default)
  const [first, second] = raw.split(/\s+/);
  if (first && second) return `${first} ${second.charAt(0)}.`;
  return first || "IGU client";
}

/**
 * Avatar initial for a resolved display name. Anonymous ("IGU client") gets a
 * neutral "IGU" glyph rather than a personal initial.
 */
export function deriveAvatarInitial(attribution: Attribution | string, displayName: string): string {
  if (attribution === "anonymous") return "IGU";
  return displayName.charAt(0).toUpperCase() || "?";
}
