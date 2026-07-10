import { describe, it, expect } from "vitest";
import {
  computeProfileStrength,
  PROFILE_STRENGTH_TOTAL,
  type CoachProfileStrengthInput,
} from "./coachProfileStrength";

const FULL: CoachProfileStrengthInput = {
  profile_picture_url: "https://cdn.theigu.com/coach.jpg",
  short_bio: "Strength coach helping lifters get strong.",
  bio: "A much longer story about my coaching philosophy and background.",
  specializations: ["strength", "physique", "powerlifting"],
  qualifications: ["ACE-CPT"],
  location: "Kuwait City",
  years_experience: 10,
  intro_video_url: "https://youtube.com/watch?v=abc",
  gym_count: 2,
  social_links: ["https://instagram.com/coach"],
};

describe("computeProfileStrength", () => {
  it("checklist weights sum to 100", () => {
    expect(PROFILE_STRENGTH_TOTAL).toBe(100);
  });

  it("fully-populated profile = 100% with nothing missing", () => {
    const { pct, missing } = computeProfileStrength(FULL);
    expect(pct).toBe(100);
    expect(missing).toEqual([]);
  });

  it("empty profile = 0% and every item missing", () => {
    const { pct, missing } = computeProfileStrength({});
    expect(pct).toBe(0);
    // missing weights must account for the full 100
    expect(missing.reduce((s, m) => s + m.weight, 0)).toBe(100);
  });

  it("treats whitespace-only text fields as empty", () => {
    const { missing } = computeProfileStrength({ ...FULL, short_bio: "   ", location: "\n" });
    const keys = missing.map((m) => m.key);
    expect(keys).toContain("short_bio");
    expect(keys).toContain("location");
  });

  it("requires ≥3 specializations for the specializations credit", () => {
    const two = computeProfileStrength({ ...FULL, specializations: ["strength", "physique"] });
    expect(two.missing.map((m) => m.key)).toContain("specializations");
    const three = computeProfileStrength({ ...FULL, specializations: ["a", "b", "c"] });
    expect(three.missing.map((m) => m.key)).not.toContain("specializations");
  });

  it("credits 'trains at' when online_only even with no gyms", () => {
    const { missing } = computeProfileStrength({ ...FULL, gym_count: 0, online_only: true });
    expect(missing.map((m) => m.key)).not.toContain("trains_at");
  });

  it("each field contributes exactly its weight when removed", () => {
    const full = computeProfileStrength(FULL).pct;
    expect(full).toBe(100);
    // Drop the photo (weight 20) -> 80
    expect(computeProfileStrength({ ...FULL, profile_picture_url: null }).pct).toBe(80);
    // Drop years_experience (weight 5) -> 95
    expect(computeProfileStrength({ ...FULL, years_experience: null }).pct).toBe(95);
  });

  it("years_experience = 0 still counts as provided", () => {
    const { missing } = computeProfileStrength({ ...FULL, years_experience: 0 });
    expect(missing.map((m) => m.key)).not.toContain("years_experience");
  });
});
