// Specialist parity (S2) — the single parameterization point for the specialist apply flow.
// Dietitian-first; the other subroles reuse the same form + admin queue by adding an entry here.
// `roleLabel` / `roleTeam` are passed to send-coach-application-emails so the confirmation /
// decision emails read for the right profession (defaults there keep the coach copy verbatim).

export interface SpecialistApplyConfig {
  /** subrole_definitions.slug — also written to coach_applications.subrole_slug */
  slug: string;
  /** Human role noun, e.g. "Dietitian". Used in UI + email subject ("<roleLabel> Application …"). */
  roleLabel: string;
  /** Team noun in email body ("join the IGU <roleTeam> team"), e.g. "Nutrition". */
  roleTeam: string;
  /** Apply dialog title. */
  title: string;
  /** Label for the free-text philosophy field. */
  philosophyLabel: string;
  philosophyPlaceholder: string;
  /** Label for the evidence-based-practice field. */
  approachLabel: string;
  approachPlaceholder: string;
}

export const SPECIALIST_APPLY_CONFIG: Record<string, SpecialistApplyConfig> = {
  dietitian: {
    slug: "dietitian",
    roleLabel: "Dietitian",
    roleTeam: "Nutrition",
    title: "Apply to Join IGU as a Dietitian",
    philosophyLabel: "Nutrition Philosophy",
    philosophyPlaceholder: "Describe your approach to nutrition coaching and helping clients reach their goals...",
    approachLabel: "Evidence-Based Approach",
    approachPlaceholder: "How do you incorporate scientific evidence into your nutrition practice?",
  },
  physiotherapist: {
    slug: "physiotherapist",
    roleLabel: "Physiotherapist",
    roleTeam: "Physiotherapy",
    title: "Apply to Join IGU as a Physiotherapist",
    philosophyLabel: "Rehabilitation Philosophy",
    philosophyPlaceholder: "Describe your approach to rehabilitation and injury management...",
    approachLabel: "Evidence-Based Approach",
    approachPlaceholder: "How do you incorporate scientific evidence into your physiotherapy practice?",
  },
  sports_psychologist: {
    slug: "sports_psychologist",
    roleLabel: "Sports Psychologist",
    roleTeam: "Sports Psychology",
    title: "Apply to Join IGU as a Sports Psychologist",
    philosophyLabel: "Practice Philosophy",
    philosophyPlaceholder: "Describe your approach to sports psychology and mental performance...",
    approachLabel: "Evidence-Based Approach",
    approachPlaceholder: "How do you incorporate scientific evidence into your practice?",
  },
  mobility_coach: {
    slug: "mobility_coach",
    roleLabel: "Mobility Coach",
    roleTeam: "Mobility",
    title: "Apply to Join IGU as a Mobility Coach",
    philosophyLabel: "Mobility Philosophy",
    philosophyPlaceholder: "Describe your approach to mobility and movement quality...",
    approachLabel: "Evidence-Based Approach",
    approachPlaceholder: "How do you incorporate scientific evidence into your mobility coaching?",
  },
};

/** Slugs that go through the specialist (non-coach) apply flow. */
export const SPECIALIST_SLUGS = Object.keys(SPECIALIST_APPLY_CONFIG);

export function getSpecialistApplyConfig(slug: string): SpecialistApplyConfig {
  return SPECIALIST_APPLY_CONFIG[slug] ?? SPECIALIST_APPLY_CONFIG.dietitian;
}
