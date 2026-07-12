import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/errorLogging";
import { deriveDisplayName, deriveAvatarInitial } from "@/lib/testimonialAttribution";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [testimonials, setTestimonials] = useState<TestimonialRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async () => {
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
      const rows = (data ?? []) as TestimonialRow[];

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
    } catch (error: unknown) {
      captureException(error, { source: "TestimonialsList.load" });
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

  return (
    <div className={cn("grid md:grid-cols-3 gap-8", className)}>
      {testimonials.length > 0 ? (
        testimonials.map((testimonial) => {
          const displayName = deriveDisplayName(testimonial.attribution, testimonial.author_display_name);
          const initial = deriveAvatarInitial(testimonial.attribution, displayName);
          return (
          <div key={testimonial.id} className="bg-card border border-border rounded-lg p-6">
            <div className="flex gap-1 mb-4">
              {[...Array(5)].map((_, index) => (
                <Star
                  key={index}
                  className={cn(
                    "h-5 w-5",
                    index < testimonial.rating ? "fill-primary text-primary" : "text-muted-foreground/30",
                  )}
                />
              ))}
            </div>
            <p className="text-muted-foreground mb-4 italic">&quot;{testimonial.feedback}&quot;</p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <span className={cn("font-semibold text-primary", initial.length > 1 ? "text-xs" : "text-lg")}>
                  {initial}
                </span>
              </div>
              <div>
                <p className="font-semibold">{displayName}</p>
                {testimonial.coaches && (
                  <p className="text-sm text-muted-foreground">
                    Coach: {testimonial.coaches.first_name} {testimonial.coaches.last_name}
                  </p>
                )}
              </div>
            </div>
          </div>
          );
        })
      ) : loaded ? (
        // Empty (or not-yet-loaded shows nothing): marketing placeholders, same as before.
        [...Array(limit ?? 3)].map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-6">
            <div className="flex gap-1 mb-4">
              {[...Array(5)].map((_, index) => (
                <Star key={index} className="h-5 w-5 fill-primary text-primary" />
              ))}
            </div>
            <p className="text-muted-foreground mb-4 italic">
              &quot;Coming soon - your testimonial could be here! Join our coaching program and transform
              your fitness journey.&quot;
            </p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/20" />
              <div>
                <p className="font-semibold">Client Name</p>
                <p className="text-sm text-muted-foreground">Program Type</p>
              </div>
            </div>
          </div>
        ))
      ) : null}
    </div>
  );
}
