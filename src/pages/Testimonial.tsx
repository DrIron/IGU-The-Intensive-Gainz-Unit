import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { withTimeout } from "@/lib/withTimeout";
import { SEOHead } from "@/components/SEOHead";

const Testimonial = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [coach, setCoach] = useState<any>(null);
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const coachId = searchParams.get("coach");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // B9-N6: 8s timeout guard against the GoTrueClient deadlock (AuthGuard
      // pattern). On timeout this throws -> caught below -> user stays null ->
      // handleSubmit routes to /auth.
      const { data: { user: currentUser } } = await withTimeout(
        supabase.auth.getUser(),
        8000,
        "getUser (testimonial page)"
      );
      setUser(currentUser);

      // Coach info from the public-safe directory view (no contact info; the
      // view is filtered to status='active'). B9-N7: .maybeSingle(), not
      // .single() -- an inactive/unknown coach would 406 and hang the page;
      // null falls back to a generic header.
      if (coachId) {
        const { data: coachData, error: coachError } = await supabase
          .from("coaches_directory")
          .select("first_name, last_name, profile_picture_url")
          .eq("user_id", coachId)
          .maybeSingle();
        if (coachError) throw coachError;
        setCoach(coachData);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  }, [coachId]);

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

      const authorDisplayName =
        ownProfile?.display_name || ownProfile?.first_name || "Anonymous";

      const { error } = await supabase.from("testimonials").insert({
        user_id: user.id,
        coach_id: coachId || null,
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
      console.error("Error submitting testimonial:", error);
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 pt-24 pb-12 px-4">
      <SEOHead
        title="Client Success Stories | Intensive Gainz Unit"
        description="Share your experience and read client success stories from IGU coaching."
      />
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Share Your Experience</CardTitle>
            <CardDescription>
              {coach ? `How was your experience with ${[coach.first_name, coach.last_name].filter(Boolean).join(" ")}?` : "Tell us about your experience"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
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
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-gray-300"
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
