import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Search, Star, TrendingDown, TrendingUp, Clock, Target } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { sanitizeErrorForUser } from '@/lib/errorSanitizer';
import { withTimeout } from '@/lib/withTimeout';

interface Testimonial {
  id: string;
  user_id: string;
  coach_id: string | null;
  rating: number;
  feedback: string;
  is_approved: boolean;
  is_archived: boolean;
  created_at: string;
  weight_change_kg: number | null;
  duration_weeks: number | null;
  goal_type: string | null;
  // Curation / consent (T1)
  featured_public: boolean;
  featured_rank: number | null;
  hidden_by_admin: boolean;
  display_consent: boolean;
  withdrawn_at: string | null;
  attribution: string;
  show_on_coach_page: boolean;
  profiles?: {
    full_name: string;
    email: string;
  };
  coaches?: {
    first_name: string;
    last_name: string;
  };
}

const GOAL_TYPES = [
  { value: "fat_loss", label: "Fat Loss" },
  { value: "muscle_gain", label: "Muscle Gain" },
  { value: "strength", label: "Strength" },
  { value: "performance", label: "Performance" },
  { value: "recomp", label: "Body Recomposition" },
  { value: "general_health", label: "General Health" },
];

/** Read-only visibility context (coach-owned + client-owned bits the admin can see but not set). */
function ContextBadges({ t }: { t: Testimonial }) {
  const badge = (label: string, tone: "ok" | "muted" | "warn" | "danger") => {
    const cls =
      tone === "ok"
        ? "bg-green-500/15 text-green-700 dark:text-green-400"
        : tone === "warn"
          ? "bg-orange-500/15 text-orange-700 dark:text-orange-400"
          : tone === "danger"
            ? "bg-destructive/15 text-destructive"
            : "bg-muted text-muted-foreground";
    return <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>{label}</span>;
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {t.display_consent ? badge("consented", "ok") : badge("no consent", "muted")}
      {t.show_on_coach_page && badge("on coach page", "ok")}
      {t.withdrawn_at && badge("withdrawn", "warn")}
      {t.hidden_by_admin && badge("hidden", "danger")}
    </div>
  );
}

export default function TestimonialsManager() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [filteredTestimonials, setFilteredTestimonials] = useState<Testimonial[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const hasFetched = useRef(false);

  const loadTestimonials = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("testimonials")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch related data separately with timeout protection
      // Admin: use profiles_public + admin RPC for private data
      const testimonialsWithDetails = await Promise.all(
        (data || []).map(async (testimonial) => {
          const [{ data: pub }, { data: priv }] = await Promise.all([
            withTimeout(
              supabase.from("profiles_public").select("display_name, first_name").eq("id", testimonial.user_id).maybeSingle(),
              5000
            ),
            withTimeout(
              supabase.rpc('admin_get_profile_private', { p_user_id: testimonial.user_id }),
              5000
            ).catch(() => ({ data: null })) // Gracefully handle timeout
          ]);

          const profile = {
            full_name: priv?.[0]?.full_name || pub?.display_name || pub?.first_name,
            email: priv?.[0]?.email,
          };

          let coach = null;
          if (testimonial.coach_id) {
            const { data: coachData } = await withTimeout(
              supabase
                .from("coaches")
                .select("first_name, last_name")
                .eq("user_id", testimonial.coach_id)
                .maybeSingle(),
              5000
            ).catch(() => ({ data: null }));
            coach = coachData;
          }

          return {
            ...testimonial,
            profiles: profile,
            coaches: coach,
          };
        })
      );

      setTestimonials(testimonialsWithDetails as Testimonial[]);
    } catch (error) {
      toast({
        title: "Error loading testimonials",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const filterTestimonials = useCallback(() => {
    if (!searchQuery.trim()) {
      setFilteredTestimonials(testimonials);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = testimonials.filter((testimonial) => {
      const name = testimonial.profiles?.full_name?.toLowerCase() || "";
      const email = testimonial.profiles?.email?.toLowerCase() || "";
      const feedback = testimonial.feedback.toLowerCase();
      const coachName = testimonial.coaches ? `${testimonial.coaches.first_name} ${testimonial.coaches.last_name}`.toLowerCase() : "";

      return (
        name.includes(query) ||
        email.includes(query) ||
        feedback.includes(query) ||
        coachName.includes(query)
      );
    });

    setFilteredTestimonials(filtered);
  }, [searchQuery, testimonials]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadTestimonials();
  }, [loadTestimonials]);

  useEffect(() => {
    filterTestimonials();
  }, [filterTestimonials]);

  // Optimistic local patch (de478a4): update the row in place, run the RPC, and
  // roll the patch back + toast on { error }. No post-write re-read (the pooler
  // can return a read-after-write-stale row).
  const patchRow = useCallback((id: string, fields: Partial<Testimonial>) => {
    setTestimonials((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields } : t)));
  }, []);

  const handleFeaturedToggle = async (t: Testimonial) => {
    const next = !t.featured_public;
    patchRow(t.id, { featured_public: next });
    const { error } = await supabase.rpc("set_testimonial_featured", {
      p_id: t.id,
      p_featured: next,
      p_rank: t.featured_rank,
    });
    if (error) {
      patchRow(t.id, { featured_public: t.featured_public }); // rollback
      toast({ title: "Error updating testimonial", description: sanitizeErrorForUser(error), variant: "destructive" });
    }
  };

  const handleRankChange = async (t: Testimonial, newRank: number | null) => {
    if (newRank === t.featured_rank) return;
    patchRow(t.id, { featured_rank: newRank });
    const { error } = await supabase.rpc("set_testimonial_featured", {
      p_id: t.id,
      p_featured: t.featured_public,
      p_rank: newRank,
    });
    if (error) {
      patchRow(t.id, { featured_rank: t.featured_rank }); // rollback
      toast({ title: "Error updating testimonial", description: sanitizeErrorForUser(error), variant: "destructive" });
    }
  };

  const handleHiddenToggle = async (t: Testimonial) => {
    const next = !t.hidden_by_admin;
    patchRow(t.id, { hidden_by_admin: next });
    const { error } = await supabase.rpc("set_testimonial_hidden", { p_id: t.id, p_hidden: next });
    if (error) {
      patchRow(t.id, { hidden_by_admin: t.hidden_by_admin }); // rollback
      toast({ title: "Error updating testimonial", description: sanitizeErrorForUser(error), variant: "destructive" });
    }
  };

  const handleStatsUpdate = async (
    testimonialId: string,
    field: "weight_change_kg" | "duration_weeks" | "goal_type",
    value: string | number | null
  ) => {
    try {
      const updateData: Record<string, string | number | null> = {};
      updateData[field] = value;

      // B9-N4: rows-affected check -- an RLS denial returns HTTP 200 with 0 rows.
      const { data, error } = await supabase
        .from("testimonials")
        .update(updateData)
        .eq("id", testimonialId)
        .select("id");

      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Update not persisted");

      patchRow(testimonialId, { [field]: value } as Partial<Testimonial>);

      toast({ title: "Success", description: "Stats updated successfully" });
    } catch (error) {
      toast({
        title: "Error updating testimonial",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">Loading testimonials...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Testimonials Management</CardTitle>
          <p className="text-sm text-muted-foreground">
            Feature testimonials on the public site and moderate visibility. Coaches choose what shows on their own page.
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, feedback, or coach..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-secondary/20 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{testimonials.length}</p>
            </div>
            <div className="bg-primary/10 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Featured</p>
              <p className="text-2xl font-bold text-primary">
                {testimonials.filter((t) => t.featured_public && !t.hidden_by_admin).length}
              </p>
            </div>
            <div className="bg-green-500/10 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Consented</p>
              <p className="text-2xl font-bold text-green-600">
                {testimonials.filter((t) => t.display_consent && !t.withdrawn_at).length}
              </p>
            </div>
            <div className="bg-destructive/10 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Hidden</p>
              <p className="text-2xl font-bold text-destructive">
                {testimonials.filter((t) => t.hidden_by_admin).length}
              </p>
            </div>
          </div>

          {/* Testimonials List */}
          <div className="space-y-4">
            {filteredTestimonials.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {searchQuery ? "No testimonials found matching your search" : "No testimonials yet"}
              </div>
            ) : (
              filteredTestimonials.map((testimonial) => (
                <div
                  key={testimonial.id}
                  className={`border rounded-lg p-6 transition-all ${
                    testimonial.hidden_by_admin
                      ? "bg-destructive/5 border-destructive/20"
                      : testimonial.featured_public
                        ? "bg-primary/5 border-primary/20"
                        : "bg-card border-border"
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      {/* Rating */}
                      <div className="flex gap-1">
                        {[...Array(5)].map((_, index) => (
                          <Star
                            key={index}
                            className={`h-5 w-5 ${
                              index < testimonial.rating
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-gray-300"
                            }`}
                          />
                        ))}
                      </div>

                      {/* Visibility context (read-only) */}
                      <ContextBadges t={testimonial} />

                      {/* Feedback */}
                      <p className="text-foreground italic">&quot;{testimonial.feedback}&quot;</p>

                      {/* Stats Badges */}
                      {(testimonial.weight_change_kg || testimonial.duration_weeks || testimonial.goal_type) && (
                        <div className="flex flex-wrap gap-2">
                          {testimonial.weight_change_kg !== null && (
                            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                              {testimonial.weight_change_kg > 0 ? (
                                <TrendingUp className="h-3 w-3" />
                              ) : (
                                <TrendingDown className="h-3 w-3" />
                              )}
                              {testimonial.weight_change_kg > 0 ? "+" : ""}
                              {testimonial.weight_change_kg} kg
                            </div>
                          )}
                          {testimonial.duration_weeks !== null && (
                            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/10 text-blue-600 text-xs font-medium">
                              <Clock className="h-3 w-3" />
                              {testimonial.duration_weeks} weeks
                            </div>
                          )}
                          {testimonial.goal_type && (
                            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-500/10 text-purple-600 text-xs font-medium">
                              <Target className="h-3 w-3" />
                              {GOAL_TYPES.find(g => g.value === testimonial.goal_type)?.label || testimonial.goal_type}
                            </div>
                          )}
                        </div>
                      )}

                      {/* User Info */}
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <div>
                          <span className="font-medium">Client:</span>{" "}
                          {testimonial.profiles?.full_name || "Unknown"}
                        </div>
                        <div>
                          <span className="font-medium">Email:</span>{" "}
                          {testimonial.profiles?.email || "N/A"}
                        </div>
                        {testimonial.coaches && (
                          <div>
                            <span className="font-medium">Coach:</span>{" "}
                            {testimonial.coaches.first_name} {testimonial.coaches.last_name}
                          </div>
                        )}
                        <div>
                          <span className="font-medium">Shown as:</span>{" "}
                          {testimonial.attribution}
                        </div>
                        <div>
                          <span className="font-medium">Submitted:</span>{" "}
                          {new Date(testimonial.created_at).toLocaleDateString()}
                        </div>
                      </div>

                      {/* Stats Editing */}
                      <div className="pt-3 border-t border-border/50 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Weight Change (kg)</Label>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="e.g., -5.5"
                            defaultValue={testimonial.weight_change_kg ?? ""}
                            onBlur={(e) => {
                              const value = e.target.value ? parseFloat(e.target.value) : null;
                              handleStatsUpdate(testimonial.id, "weight_change_kg", value);
                            }}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Duration (weeks)</Label>
                          <Input
                            type="number"
                            placeholder="e.g., 12"
                            defaultValue={testimonial.duration_weeks ?? ""}
                            onBlur={(e) => {
                              const value = e.target.value ? parseInt(e.target.value) : null;
                              handleStatsUpdate(testimonial.id, "duration_weeks", value);
                            }}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Goal Type</Label>
                          <Select
                            value={testimonial.goal_type || ""}
                            onValueChange={(value) => handleStatsUpdate(testimonial.id, "goal_type", value || null)}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select goal" />
                            </SelectTrigger>
                            <SelectContent>
                              {GOAL_TYPES.map((goal) => (
                                <SelectItem key={goal.value} value={goal.value}>
                                  {goal.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Admin curation controls (via SECURITY DEFINER RPCs) */}
                    <div className="flex flex-row md:flex-col md:items-end gap-4 md:w-56 shrink-0">
                      <div className="flex items-center justify-between gap-3 w-full">
                        <div>
                          <p className="text-sm font-medium">Feature publicly</p>
                          <p className="text-xs text-muted-foreground">Landing / /testimonials</p>
                        </div>
                        <Switch
                          checked={testimonial.featured_public}
                          onCheckedChange={() => handleFeaturedToggle(testimonial)}
                          aria-label="Feature publicly"
                        />
                      </div>

                      {testimonial.featured_public && (
                        <div className="flex items-center justify-between gap-3 w-full">
                          <Label className="text-xs text-muted-foreground">Rank</Label>
                          <Input
                            type="number"
                            defaultValue={testimonial.featured_rank ?? ""}
                            onBlur={(e) => {
                              const value = e.target.value ? parseInt(e.target.value) : null;
                              handleRankChange(testimonial, value);
                            }}
                            className="h-8 w-20 text-sm"
                            aria-label="Featured rank"
                          />
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-3 w-full">
                        <div>
                          <p className="text-sm font-medium">Hide everywhere</p>
                          <p className="text-xs text-muted-foreground">Moderation floor</p>
                        </div>
                        <Switch
                          checked={testimonial.hidden_by_admin}
                          onCheckedChange={() => handleHiddenToggle(testimonial)}
                          aria-label="Hide everywhere"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
