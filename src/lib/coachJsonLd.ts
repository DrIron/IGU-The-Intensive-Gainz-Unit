/**
 * PUB11 — Schema.org structured data for a coach's public page.
 *
 * Emits a `Service` entity (provider = the coach as a Person, serviceType "Fitness coaching").
 * Service is valid schema.org and carries `aggregateRating` + `review` cleanly, without claiming
 * a physical LocalBusiness the coach may not have. (ProfessionalService/LocalBusiness would be
 * more likely to trigger Google's star rich-result but implies an address/hours; we favour
 * honest, valid data — stars aren't guaranteed, valid structured data stands.)
 *
 * ── The load-bearing honesty rule ────────────────────────────────────────────
 * NO `aggregateRating` and NO `review[]` are emitted when there are no real reviews. Google
 * penalizes fabricated or empty rating markup, and a coach with zero reviews must not carry a
 * rating. Only already-public testimonial data is included, and the review author is only the
 * public display name — never any PII beyond what the page itself shows.
 */

export interface CoachJsonLdReview {
  /** The public display name shown on the page — the ONLY author data emitted. */
  author: string;
  /** 1–5 stars for this review. */
  rating: number;
  /** The public testimonial text. */
  body: string;
  /** ISO date the testimonial was published (date portion). */
  datePublished: string;
}

export interface CoachJsonLdInput {
  /** Coach's public name (already shown on the page). */
  name: string;
  /** Canonical URL of the public page. */
  url: string;
  /** Public bio/description, optional. */
  description?: string | null;
  /** Public avatar URL, optional. */
  image?: string | null;
  /** The rating aggregate from get_coach_rating_aggregate. */
  aggregate: { count: number; avg: number | null };
  /** Real, already-public testimonials (get_coach_public_testimonials). */
  reviews: CoachJsonLdReview[];
}

/** Build the JSON-LD object. Never fabricates a rating; omits rating markup when there are none. */
export function buildCoachJsonLd(input: CoachJsonLdInput): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: "Fitness coaching",
    name: `Fitness coaching with ${input.name}`,
    url: input.url,
    provider: {
      "@type": "Person",
      name: input.name,
      ...(input.image ? { image: input.image } : {}),
    },
  };
  if (input.description) schema.description = input.description;
  if (input.image) schema.image = input.image;

  // HONESTY GUARD: rating markup ONLY when real ratings exist. Zero reviews → neither key is
  // present (never a fabricated value, never an empty AggregateRating object).
  const hasRating = input.aggregate.count > 0 && input.aggregate.avg != null;
  if (hasRating) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Math.round((input.aggregate.avg as number) * 10) / 10,
      reviewCount: input.aggregate.count,
      bestRating: 5,
      worstRating: 1,
    };
  }

  // review[] mirrors the real, public testimonials. Present only when there are some — an empty
  // review array is never emitted.
  if (input.reviews.length > 0) {
    schema.review = input.reviews.map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.author },
      reviewRating: {
        "@type": "Rating",
        ratingValue: r.rating,
        bestRating: 5,
        worstRating: 1,
      },
      reviewBody: r.body,
      datePublished: r.datePublished,
    }));
  }

  return schema;
}
