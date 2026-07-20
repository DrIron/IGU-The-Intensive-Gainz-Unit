import { describe, it, expect } from "vitest";
import { MUSCLE_SYNONYMS, muscleSynonyms } from "./muscleSynonyms";

describe("muscleSynonyms", () => {
  it("keys are the exact stored lay terms — lowercased and trimmed", () => {
    for (const key of Object.keys(MUSCLE_SYNONYMS)) {
      expect(key, key).toBe(key.toLowerCase().trim());
    }
  });

  it("exact (case-insensitive) lookup; null/unknown → []", () => {
    expect(muscleSynonyms("quads")).toContain("quadriceps");
    expect(muscleSynonyms("QUADS")).toContain("quadriceps"); // case-insensitive
    expect(muscleSynonyms(" quads ")).toContain("quadriceps"); // trimmed
    expect(muscleSynonyms("elbow flexors")).toContain("biceps");
    expect(muscleSynonyms(null)).toEqual([]);
    expect(muscleSynonyms("not-a-muscle")).toEqual([]);
  });

  it("hamstrings drops 'biceps femoris' (substring crossover into 'biceps') but stays findable", () => {
    const hams = muscleSynonyms("hamstrings");
    expect(hams).not.toContain("biceps femoris");
    expect(hams).toEqual(expect.arrayContaining(["hamstring", "hams", "ham", "semitendinosus", "semimembranosus"]));
  });

  it("GUARDRAIL: abs and core stay distinct (Hasan's split — rectus/obliques vs TVA/anti-extension)", () => {
    expect(muscleSynonyms("abs")).not.toContain("core");
    expect(muscleSynonyms("abs")).not.toContain("tva");
    expect(muscleSynonyms("core")).not.toContain("abs");
    expect(muscleSynonyms("core")).not.toContain("rectus abdominis");
  });

  it("region words are intentionally shared across muscles (whole-region search)", () => {
    for (const m of ["quads", "hamstrings", "glutes", "calves"]) expect(muscleSynonyms(m)).toContain("legs");
    for (const m of ["deltoids", "rotator cuff"]) expect(muscleSynonyms(m)).toContain("shoulders");
    for (const m of ["pec major", "pec minor", "serratus anterior"]) expect(muscleSynonyms(m)).toContain("chest");
  });
});
