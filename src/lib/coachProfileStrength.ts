/**
 * Coach profile completeness meter (CPR1, §3.3 of COACH_PROFILE_REDESIGN_BUILD.md).
 *
 * Pure, client-side, no schema. Weighted checklist that MUST sum to 100 so `pct`
 * is directly a 0–100 percentage. Drives the "Profile strength" meter in the
 * editor header and the optional "add X to reach 100%" nudges (via `missing`).
 */

export interface CoachProfileStrengthInput {
  profile_picture_url?: string | null;
  short_bio?: string | null;
  bio?: string | null;
  specializations?: string[] | null;
  qualifications?: string[] | null;
  location?: string | null;
  years_experience?: number | null;
  intro_video_url?: string | null;
  /** Number of gyms the coach trains at (from coach_gyms). */
  gym_count?: number | null;
  /** Coach has explicitly declared themselves online-only (satisfies the "trains at" line without a gym). */
  online_only?: boolean;
  /** Any social link — instagram / tiktok / youtube / snapchat. */
  social_links?: Array<string | null | undefined>;
}

export interface ProfileStrengthItem {
  key: string;
  label: string;
  weight: number;
}

export interface ProfileStrength {
  pct: number;
  missing: ProfileStrengthItem[];
}

const hasText = (v?: string | null): boolean => typeof v === "string" && v.trim().length > 0;

/**
 * Checklist — weights sum to 100 (enforced by unit test). Each `met` is a pure
 * predicate over the input. Order here is the order `missing` is returned in.
 */
const CHECKLIST: Array<ProfileStrengthItem & { met: (c: CoachProfileStrengthInput) => boolean }> = [
  { key: "profile_picture_url", label: "Add a profile photo", weight: 20, met: (c) => hasText(c.profile_picture_url) },
  { key: "short_bio", label: "Write a short bio", weight: 15, met: (c) => hasText(c.short_bio) },
  { key: "specializations", label: "Pick at least 3 specializations", weight: 15, met: (c) => (c.specializations?.length ?? 0) >= 3 },
  { key: "bio", label: "Write a full bio", weight: 10, met: (c) => hasText(c.bio) },
  { key: "qualifications", label: "Add a qualification", weight: 10, met: (c) => (c.qualifications?.length ?? 0) >= 1 },
  { key: "trains_at", label: "Add a gym (or mark yourself online-only)", weight: 10, met: (c) => (c.gym_count ?? 0) >= 1 || c.online_only === true },
  { key: "location", label: "Add your location", weight: 5, met: (c) => hasText(c.location) },
  { key: "years_experience", label: "Add your years of experience", weight: 5, met: (c) => c.years_experience != null },
  { key: "intro_video_url", label: "Add a 30-sec intro video", weight: 5, met: (c) => hasText(c.intro_video_url) },
  { key: "social_links", label: "Add a social link", weight: 5, met: (c) => (c.social_links ?? []).some((s) => hasText(s)) },
];

/** Total possible weight — exported so the meter and tests share one source of truth. */
export const PROFILE_STRENGTH_TOTAL = CHECKLIST.reduce((sum, item) => sum + item.weight, 0);

export function computeProfileStrength(coach: CoachProfileStrengthInput): ProfileStrength {
  let earned = 0;
  const missing: ProfileStrengthItem[] = [];

  for (const { met, key, label, weight } of CHECKLIST) {
    if (met(coach)) {
      earned += weight;
    } else {
      missing.push({ key, label, weight });
    }
  }

  return { pct: Math.round((earned / PROFILE_STRENGTH_TOTAL) * 100), missing };
}
