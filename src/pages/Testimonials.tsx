import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEOHead } from "@/components/SEOHead";
import { TestimonialsList, type TestimonialsSort } from "@/components/marketing/TestimonialsList";
import { useCanLeaveTestimonial } from "@/hooks/useCanLeaveTestimonial";

const GOAL_LABELS: Record<string, string> = {
  fat_loss: "Fat Loss",
  muscle_gain: "Muscle Gain",
  strength: "Strength",
  performance: "Performance",
  recomp: "Body Recomposition",
  general_health: "General Health",
};
const goalLabel = (g: string) =>
  GOAL_LABELS[g] || g.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Public, view-only testimonials page (plural /testimonials). Featured rows are
 * anon-readable, so no AuthGuard. The client SUBMIT form lives at the singular
 * /testimonial (client-gated) — the "Leave a testimonial" CTA below shows ONLY
 * to eligible clients. Filter/sort options are derived from the featured rows.
 */
const Testimonials = () => {
  const { t } = useTranslation("common");
  const { canLeave } = useCanLeaveTestimonial();
  const [coachId, setCoachId] = useState("all");
  const [goalType, setGoalType] = useState("all");
  const [sortBy, setSortBy] = useState<TestimonialsSort>("featured");
  const [coachOptions, setCoachOptions] = useState<{ id: string; name: string }[]>([]);
  const [goalOptions, setGoalOptions] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Light meta-read over featured rows (RLS-scoped) → filter dimensions.
      const { data } = await supabase.from("testimonials").select("coach_id, goal_type").eq("featured_public", true);
      if (cancelled) return;
      const rows = data ?? [];
      setGoalOptions([...new Set(rows.map((r) => r.goal_type).filter((v): v is string => Boolean(v)))]);
      const coachIds = [...new Set(rows.map((r) => r.coach_id).filter((v): v is string => Boolean(v)))];
      if (coachIds.length > 0) {
        const { data: dir } = await supabase
          .from("coaches_directory")
          .select("user_id, first_name, last_name")
          .in("user_id", coachIds);
        if (cancelled) return;
        setCoachOptions(
          (dir ?? [])
            .filter((c) => c.user_id)
            .map((c) => ({ id: c.user_id as string, name: [c.first_name, c.last_name].filter(Boolean).join(" ") })),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background pt-24 pb-16 px-4">
      <SEOHead
        title="Client Testimonials | Intensive Gainz Unit"
        description="Real results from real IGU clients — read what people say about coaching with the Intensive Gainz Unit."
      />
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl tracking-tight mb-4">
            What Our Clients Say
          </h1>
          <p className="text-xl text-muted-foreground">Real results from real people</p>
          {canLeave && (
            <div className="mt-6">
              <Button asChild>
                <Link to="/testimonial">Leave a testimonial</Link>
              </Button>
            </div>
          )}
        </div>

        {/* Filter + sort */}
        <div className="flex flex-wrap gap-3 justify-center mb-8">
          {coachOptions.length > 0 && (
            <Select value={coachId} onValueChange={setCoachId}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("testimonialsAllCoaches", { defaultValue: "All coaches" })}</SelectItem>
                {coachOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name || "Coach"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {goalOptions.length > 0 && (
            <Select value={goalType} onValueChange={setGoalType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("testimonialsAllGoals", { defaultValue: "All goals" })}</SelectItem>
                {goalOptions.map((g) => (
                  <SelectItem key={g} value={g}>{goalLabel(g)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as TestimonialsSort)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="featured">{t("testimonialsSortFeatured", { defaultValue: "Featured" })}</SelectItem>
              <SelectItem value="recent">{t("testimonialsSortRecent", { defaultValue: "Most recent" })}</SelectItem>
              <SelectItem value="rating">{t("testimonialsSortRating", { defaultValue: "Highest rated" })}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <TestimonialsList
          coachId={coachId === "all" ? undefined : coachId}
          goalType={goalType === "all" ? undefined : goalType}
          sortBy={sortBy}
        />
      </div>
    </div>
  );
};

export default Testimonials;
