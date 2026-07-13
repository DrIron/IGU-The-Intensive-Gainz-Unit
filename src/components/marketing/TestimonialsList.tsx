import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/errorLogging";
import { deriveDisplayName, deriveAvatarInitial } from "@/lib/testimonialAttribution";
import { formatWeightChange, type WeightChangeShape } from "@/lib/weightChangeFormat";
import { Star, TrendingDown, TrendingUp, MessageSquareQuote } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadError } from "@/components/ui/load-error";
import { EmptyState } from "@/components/ui/empty-state";

export type TestimonialsSort = "featured" | "recent" | "rating";

export interface TestimonialRow {
  id: string;
  rating: number;
  feedback: string;
  user_id: string;
  coach_id: string | null;
  created_at: string;
  // Snapshotted at submit time so anon browsers read the author name off the row.
  author_display_name: string | null;
  attribution: string;
  attachment_type: string;
  attachment: WeightChangeShape | null;
  attachment_note: string | null;
  coaches?: { first_name: string; last_name: string } | null;
}

interface TestimonialsListProps {
  /** Cap the number of featured testimonials shown (e.g. Index preview). Undefined = all. */
  limit?: number;
  /** Filter to one coach's featured testimonials. */
  coachId?: string;
  /** Filter to one goal_type. */
  goalType?: string;
  /** Sort order — defaults to the admin-curated featured rotation. */
  sortBy?: TestimonialsSort;
  className?: string;
}

/**
 * Shared read-only grid of FEATURED testimonials (`featured_public`; consent /
 * withdrawn / hidden are enforced server-side by the testimonials_public_visible
 * RLS policy). Used by both the Index preview (limit=3) and the standalone
 * /testimonials view — one source, no divergence. Flat PUB8 language (bg-card
 * border, fill-primary stars, no shadows/gradients).
 */
export function TestimonialsList({ limit, coachId, goalType, sortBy = "featured", className }: TestimonialsListProps) {
  const { t } = useTranslation("common");
  const [testimonials, setTestimonials] = useState<TestimonialRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      let query = supabase.from("testimonials").select("*").eq("featured_public", true);
      if (coachId) query = query.eq("coach_id", coachId);
      if (goalType) query = query.eq("goal_type", goalType);

      // Featured = admin rank asc (nulls last) then newest; other sorts self-explanatory.
      if (sortBy === "recent") {
        query = query.order("created_at", { ascending: false });
      } else if (sortBy === "rating") {
        query = query.order("rating", { ascending: false }).order("created_at", { ascending: false });
      } else {
        query = query
          .order("featured_rank", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: false });
      }
      if (limit) query = query.limit(limit);

      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as unknown as TestimonialRow[];

      // Coach names in ONE batched read (author name is already on the row). No per-row fan-out.
      const coachIds = [...new Set(rows.map((r) => r.coach_id).filter((v): v is string => Boolean(v)))];
      const coachById = new Map<string, { first_name: string; last_name: string }>();
      if (coachIds.length > 0) {
        const { data: dir } = await supabase
          .from("coaches_directory")
          .select("user_id, first_name, last_name")
          .in("user_id", coachIds);
        for (const c of dir ?? []) {
          if (c.user_id) coachById.set(c.user_id, { first_name: c.first_name, last_name: c.last_name });
        }
      }
      setTestimonials(rows.map((r) => ({ ...r, coaches: r.coach_id ? coachById.get(r.coach_id) ?? null : null })));
    } catch (err: unknown) {
      // CC10: a failed fetch used to fall through to the marketing PLACEHOLDER cards
      // below — i.e. it answered a network error with three fabricated 5-star reviews
      // on the public homepage. An error must never render as content.
      //
      // NOTE (PUB6): only the ERROR branch is fixed here. The placeholder cards in the
      // EMPTY branch are still there and are PUB6's job, together with the card reorder.
      captureException(err, { source: "TestimonialsList.load" });
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoaded(true);
    }
  }, [limit, coachId, goalType, sortBy]);

  useEffect(() => {
    const key = `${limit ?? "all"}:${coachId ?? "any"}:${goalType ?? "any"}:${sortBy}`;
    if (hasFetched.current === key) return;
    hasFetched.current = key;
    load();
  }, [limit, coachId, goalType, sortBy, load]);

  // CC10: error short-circuits ahead of the grid. Previously a failed fetch fell
  // through to the `loaded ? <fake cards>` branch below and published three
  // fabricated 5-star reviews. PUB6 still owns those fakes in the EMPTY case.
  if (error) {
    return (
      <LoadError
        className={className}
        message="We couldn't load testimonials right now. Please try again."
        onRetry={() => {
          hasFetched.current = null;
          void load();
        }}
      />
    );
  }

  // Nothing fabricated, ever. When there are no featured testimonials we say so —
  // the old behaviour rendered three fake 5-star "Client Name" cards on the public
  // homepage, which is manufactured social proof and the exact opposite of PUB6's ask.
  if (loaded && testimonials.length === 0) {
    return (
      <EmptyState
        className={className}
        icon={MessageSquareQuote}
        title={t("testimonialsEmptyTitle", { defaultValue: "No testimonials yet" })}
        description={t("testimonialsEmptyBody", {
          defaultValue: "Real client stories will appear here as clients share them.",
        })}
      />
    );
  }

  return (
    <div className={cn("grid md:grid-cols-3 gap-8", className)}>
      {testimonials.map((testimonial) => {
        const displayName = deriveDisplayName(testimonial.attribution, testimonial.author_display_name);
        const initial = deriveAvatarInitial(testimonial.attribution, displayName);
        // Only a REAL weight_change attachment earns the hero. Never invent an outcome
        // for a card that has none — those stay quote-led.
        const proof =
          testimonial.attachment_type === "weight_change" && testimonial.attachment
            ? testimonial.attachment
            : null;

        return (
          <div key={testimonial.id} className="bg-card border border-border rounded-lg p-6">
            {/* 1. OUTCOME FIRST (when there is a real one). */}
            {proof && <ResultHero attachment={proof} note={testimonial.attachment_note} />}

            {/* 2. Quote. */}
            <p className="text-muted-foreground mb-4 italic">&quot;{testimonial.feedback}&quot;</p>

            {/* 3. Author. */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <span className={cn("font-semibold text-primary", initial.length > 1 ? "text-xs" : "text-lg")}>
                  {initial}
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold">{displayName}</p>
                {testimonial.coaches && (
                  <p className="text-sm text-muted-foreground truncate">
                    {t("testimonialCoachLabel", {
                      name: `${testimonial.coaches.first_name} ${testimonial.coaches.last_name}`,
                      defaultValue: "Coach: {{name}}",
                    })}
                  </p>
                )}
              </div>
            </div>

            {/* 4. Stars — demoted to supporting metadata in the footer. */}
            <div
              className="mt-4 flex gap-0.5 border-t border-border/60 pt-3"
              aria-label={t("testimonialRatingAria", {
                n: testimonial.rating,
                defaultValue: "{{n}} out of 5",
              })}
            >
              {[...Array(5)].map((_, index) => (
                <Star
                  key={index}
                  className={cn(
                    "h-3.5 w-3.5",
                    index < testimonial.rating ? "fill-primary text-primary" : "text-muted-foreground/30",
                  )}
                  aria-hidden
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * ResultHero — the outcome, as the headline (PUB6).
 *
 * HONESTY CONTRACT (inherited from WeightChangeProof.tsx:9-11 — do not break it):
 *   - The number is `text-foreground`, NEVER crimson/emerald. Colouring a loss as
 *     "success" would imply down is universally good; a -2.1 kg under a lean-bulk
 *     phase is not a win. The direction glyph states the sign, nothing more.
 *   - The phase name rides along underneath so the number reads against the client's
 *     OWN goal, not an assumed one.
 *   - delta/weeks come straight off the stored attachment — nothing is recomputed,
 *     estimated or backfilled.
 */
function ResultHero({
  attachment,
  note,
}: {
  attachment: WeightChangeShape;
  note?: string | null;
}) {
  const { t } = useTranslation("common");
  const delta = Number(attachment.delta_kg);
  const weeks = Number(attachment.weeks);
  if (!Number.isFinite(delta) || !Number.isFinite(weeks)) return null;

  const Icon = delta < 0 ? TrendingDown : TrendingUp;
  const weeksLabel =
    weeks === 1
      ? t("proofWeekOne", { defaultValue: "1 week" })
      : t("proofWeeks", { n: weeks, defaultValue: "{{n}} weeks" });

  return (
    <div className="mb-4" title={formatWeightChange(attachment)}>
      <div className="flex items-baseline gap-1.5 text-foreground">
        <Icon className="h-5 w-5 shrink-0 self-center text-muted-foreground" aria-hidden />
        <span className="font-display text-4xl leading-none tracking-wide">
          {Math.abs(delta)}
        </span>
        <span className="text-sm font-medium text-muted-foreground">
          {t("proofKgUnit", { defaultValue: "kg" })}
        </span>
      </div>
      <p className="mt-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground">
        {weeksLabel}
        {attachment.phase_name && <> · {attachment.phase_name}</>}
      </p>
      {note && <p className="mt-1.5 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
