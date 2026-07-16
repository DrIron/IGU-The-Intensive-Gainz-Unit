import { describe, it, expect } from "vitest";
import { buildCoachJsonLd, type CoachJsonLdInput } from "./coachJsonLd";

/**
 * PUB11 — the load-bearing rule is the ABSENCE of fabricated rating markup: a coach with zero
 * reviews must carry NO aggregateRating and NO review[]. The rest pins that real data mirrors
 * faithfully and that no author field leaks PII beyond the public display name.
 */

const base: CoachJsonLdInput = {
  name: "Sam Rivera",
  url: "https://theigu.com/coaches/sam-rivera",
  description: "Evidence-based hypertrophy coaching.",
  image: "https://cdn.theigu.com/sam.jpg",
  aggregate: { count: 0, avg: null },
  reviews: [],
};

describe("buildCoachJsonLd", () => {
  it("emits a valid Service entity that serializes to parseable JSON", () => {
    const schema = buildCoachJsonLd(base);
    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("Service");
    expect(schema.serviceType).toBe("Fitness coaching");
    expect((schema.provider as Record<string, unknown>)["@type"]).toBe("Person");
    expect((schema.provider as Record<string, unknown>).name).toBe("Sam Rivera");
    // It's a script body → must round-trip through JSON.
    expect(() => JSON.parse(JSON.stringify(schema))).not.toThrow();
  });

  it("WITH reviews: emits aggregateRating (matching value/count) and a review[] mirroring the data", () => {
    const schema = buildCoachJsonLd({
      ...base,
      aggregate: { count: 3, avg: 4.6666 },
      reviews: [
        { author: "Alex", rating: 5, body: "Life-changing programming.", datePublished: "2026-05-01" },
        { author: "Jordan", rating: 4, body: "Great communication.", datePublished: "2026-06-12" },
      ],
    });

    const agg = schema.aggregateRating as Record<string, unknown>;
    expect(agg["@type"]).toBe("AggregateRating");
    expect(agg.ratingValue).toBe(4.7); // rounded to 1dp
    expect(agg.reviewCount).toBe(3);
    expect(agg.bestRating).toBe(5);
    expect(agg.worstRating).toBe(1);

    const reviews = schema.review as Array<Record<string, unknown>>;
    expect(reviews).toHaveLength(2);
    expect(reviews[0]["@type"]).toBe("Review");
    expect((reviews[0].author as Record<string, unknown>).name).toBe("Alex");
    expect((reviews[0].reviewRating as Record<string, unknown>).ratingValue).toBe(5);
    expect(reviews[0].reviewBody).toBe("Life-changing programming.");
    expect(reviews[0].datePublished).toBe("2026-05-01");

    expect(() => JSON.parse(JSON.stringify(schema))).not.toThrow();
  });

  it("ZERO reviews: NO aggregateRating and NO review[] (never fabricate a rating)", () => {
    const schema = buildCoachJsonLd(base); // count 0, avg null, reviews []
    expect(schema).not.toHaveProperty("aggregateRating");
    expect(schema).not.toHaveProperty("review");
    // Emphatically: not even an empty object/array.
    expect(schema.aggregateRating).toBeUndefined();
    expect(schema.review).toBeUndefined();
  });

  it("a count>0 with an avg but NO public testimonials still emits no empty review[] array", () => {
    const schema = buildCoachJsonLd({ ...base, aggregate: { count: 2, avg: 5 }, reviews: [] });
    // aggregateRating can stand alone (real ratings exist)...
    expect(schema.aggregateRating).toBeDefined();
    // ...but review[] is never an empty array.
    expect(schema).not.toHaveProperty("review");
  });

  it("the review author carries ONLY the public display name — no other PII", () => {
    const schema = buildCoachJsonLd({
      ...base,
      aggregate: { count: 1, avg: 5 },
      reviews: [{ author: "H D", rating: 5, body: "Superb.", datePublished: "2026-07-01" }],
    });
    const author = (schema.review as Array<Record<string, unknown>>)[0].author as Record<string, unknown>;
    // Exactly @type + name; no email/phone/lastName/etc.
    expect(Object.keys(author).sort()).toEqual(["@type", "name"]);
    expect(author.name).toBe("H D");
  });

  it("omits optional description/image when not provided", () => {
    const schema = buildCoachJsonLd({ name: "N", url: "u", aggregate: { count: 0, avg: null }, reviews: [] });
    expect(schema).not.toHaveProperty("description");
    expect(schema).not.toHaveProperty("image");
  });
});
