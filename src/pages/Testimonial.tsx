import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { captureException } from "@/lib/errorLogging";
import { withTimeout } from "@/lib/withTimeout";
import { SEOHead } from "@/components/SEOHead";

const Testimonial = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<{ id: string } | null>(null);
  // The submitter's OWN coaches (resolved from their subscriptions — any status). The
  // reviewed coach is picked from THIS list, never from the ?coach= URL param, which kills
  // the self-endorsement + arbitrary-coach vectors before RLS even runs.
  const [myCoaches, setMyCoaches] = useState<{ coachId: string; name: string | null }[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // AuthGuard already gates this route; resolve the id for the subscription lookup.
      const { data: { user: currentUser } } = await withTimeout(
        supabase.auth.getUser(),
        8000,
        "getUser (testimonial page)"
      );
      if (!currentUser) {
        setLoading(false);
        return;
      }
      setUser({ id: currentUser.id });

      // Resolve the submitter's own coaches from their subscriptions (any status = active or
      // past). coach_id is taken from HERE, never from ?coach=.
      const { data: subs, error: subsErr } = await supabase
        .from("subscriptions")
        .select("coach_id")
        .eq("user_id", currentUser.id)
        .not("coach_id", "is", null);
      if (subsErr) throw subsErr;

      const coachIds = [...new Set((subs ?? []).map((s) => s.coach_id).filter(Boolean))] as string[];
      if (coachIds.length === 0) {
        setMyCoaches([]);
        return;
      }

      // Best-effort display names from the public-safe directory (status='active'). A past/
      // inactive coach may not resolve → shown generically but still reviewable.
      const { data: dir } = await supabase
        .from("coaches_directory")
        .select("user_id, first_name, last_name")
        .in("user_id", coachIds);
      const nameById = new Map<string, string>();
      for (const c of dir ?? []) {
        if (c.user_id) nameById.set(c.user_id, [c.first_name, c.last_name].filter(Boolean).join(" "));
      }
      const coaches = coachIds.map((id) => ({ coachId: id, name: nameById.get(id) || null }));
      setMyCoaches(coaches);

      // Preselect: ?coach= ONLY if it's one of the user's real coaches; otherwise the first.
      const param = searchParams.get("coach");
      setSelectedCoachId(param && coachIds.includes(param) ? param : coachIds[0]);
    } catch (error) {
      captureException(error, { source: "testimonial_load_data" });
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to submit a testimonial.",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }

    if (!selectedCoachId) {
      toast({
        title: "No coach to review",
        description: "Only IGU clients can leave a testimonial for their coach.",
        variant: "destructive",
      });
      return;
    }

    if (rating === 0) {
      toast({
        title: "Rating Required",
        description: "Please select a rating before submitting.",
        variant: "destructive",
      });
      return;
    }

    if (!feedback.trim()) {
      toast({
        title: "Feedback Required",
        description: "Please write your feedback before submitting.",
        variant: "destructive",
      });
      return;
    }

    // B9-N8: mirror the server CHECK (1..4000) client-side.
    if (feedback.trim().length > 4000) {
      toast({
        title: "Feedback Too Long",
        description: "Please keep your feedback under 4000 characters.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      // B9-N1: snapshot the author's display name onto the testimonial row so
      // anon homepage browsers can render it without traversing RLS-gated
      // profiles_private/profiles_public. RLS allows the client to self-read
      // its own profiles_public row.
      const { data: ownProfile, error: profileError } = await withTimeout(
        supabase
          .from("profiles_public")
          .select("display_name, first_name")
          .eq("id", user.id)
          .maybeSingle(),
        5000,
        "Load own profile for testimonial author name"
      );
      if (profileError) throw profileError;

      // Require a real display name — no "Anonymous" fallback.
      const authorDisplayName = ownProfile?.display_name || ownProfile?.first_name || null;
      if (!authorDisplayName) {
        toast({
          title: "Couldn't submit",
          description: "We couldn't resolve your display name. Please set it in your account, then try again.",
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }

      const { error } = await supabase.from("testimonials").insert({
        user_id: user.id,
        coach_id: selectedCoachId,
        rating,
        feedback: feedback.trim(),
        author_display_name: authorDisplayName,
      });

      if (error) throw error;

      toast({
        title: "Thank You!",
        description: "Your testimonial has been submitted successfully.",
      });

      // Redirect to dashboard
      navigate("/dashboard");
    } catch (error: any) {
      captureException(error, { source: "testimonial_submit" });
      // B9-N9: UNIQUE(user_id, coach_id) -> one testimonial per coach.
      const alreadySubmitted = error?.code === "23505";
      toast({
        title: alreadySubmitted ? "Already Submitted" : "Submission Failed",
        description: alreadySubmitted
          ? "You've already submitted feedback for this coach."
          : sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  // Clients-only: no coach relationship → no form (RLS enforces this too).
  if (myCoaches.length === 0) {
    return (
      <div className="min-h-screen bg-background pt-24 pb-12 px-4">
        <SEOHead
          title="Client Success Stories | Intensive Gainz Unit"
          description="Share your experience and read client success stories from IGU coaching."
        />
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Testimonials are for IGU clients</CardTitle>
              <CardDescription>
                Only clients can leave a testimonial for their coach. Once you're working with an
                IGU coach, you'll be able to share your experience here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const selectedCoach = myCoaches.find((c) => c.coachId === selectedCoachId) ?? null;
  const selectedCoachName = selectedCoach?.name;

  return (
    <div className="min-h-screen bg-background pt-24 pb-12 px-4">
      <SEOHead
        title="Client Success Stories | Intensive Gainz Unit"
        description="Share your experience and read client success stories from IGU coaching."
      />
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Share Your Experience</CardTitle>
            <CardDescription>
              {selectedCoachName
                ? `How was your experience with ${selectedCoachName}?`
                : "How was your experience with your coach?"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Coach picker — only when the client has more than one coach; choices are
                  restricted to THEIR OWN coaches (never an arbitrary ?coach= id). */}
              {myCoaches.length > 1 && (
                <div className="space-y-2">
                  <label htmlFor="coach" className="text-sm font-medium">Which coach?</label>
                  <select
                    id="coach"
                    value={selectedCoachId ?? ""}
                    onChange={(e) => setSelectedCoachId(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {myCoaches.map((c) => (
                      <option key={c.coachId} value={c.coachId}>{c.name || "Your coach"}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Rating Stars */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Your Rating</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoveredRating(star)}
                      onMouseLeave={() => setHoveredRating(0)}
                      className="transition-transform hover:scale-110"
                    >
                      <Star
                        className={`w-10 h-10 ${
                          star <= (hoveredRating || rating)
                            ? "fill-primary text-primary"
                            : "text-muted-foreground"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                {rating > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {rating === 5 ? "Excellent!" : rating === 4 ? "Good" : rating === 3 ? "Average" : rating === 2 ? "Below Average" : "Poor"}
                  </p>
                )}
              </div>

              {/* Feedback */}
              <div className="space-y-2">
                <label htmlFor="feedback" className="text-sm font-medium">
                  Your Feedback
                </label>
                <Textarea
                  id="feedback"
                  placeholder="Share your experience, what you liked, and how it helped you..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={6}
                  maxLength={4000}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  {feedback.length}/4000 characters
                </p>
              </div>

              {/* Submit Button */}
              <div className="flex gap-4">
                <Button
                  type="submit"
                  disabled={submitting || rating === 0 || !feedback.trim()}
                  className="flex-1"
                >
                  {submitting ? "Submitting..." : "Submit Testimonial"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/dashboard")}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Testimonial;
