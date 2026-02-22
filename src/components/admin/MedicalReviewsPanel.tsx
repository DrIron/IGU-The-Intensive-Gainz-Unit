import { useState, useEffect, useCallback, useRef, memo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Shield,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MedicalReview {
  id: string;
  user_id: string;
  flagged_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  status: string;
  // Enriched
  userName: string;
  userEmail: string;
  ageHours: number;
}

/**
 * Admin panel for managing medical reviews (PAR-Q SLA).
 * Shows pending reviews sorted by age with one-click clear/reject actions.
 */
export const MedicalReviewsPanel = memo(function MedicalReviewsPanel() {
  const [reviews, setReviews] = useState<MedicalReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const hasFetched = useRef(false);

  const fetchReviews = useCallback(async () => {
    try {
      const { data: rawReviews, error } = await supabase
        .from("medical_reviews")
        .select("id, user_id, flagged_at, reviewed_at, reviewed_by, review_notes, status")
        .order("flagged_at", { ascending: true });

      if (error) throw error;

      // Enrich with user names
      const enriched: MedicalReview[] = await Promise.all(
        (rawReviews || []).map(async (review) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("email, first_name, last_name")
            .eq("id", review.user_id)
            .maybeSingle();

          const ageMs = Date.now() - new Date(review.flagged_at).getTime();
          const ageHours = Math.round(ageMs / (1000 * 60 * 60) * 10) / 10;

          return {
            ...review,
            userName: profile
              ? `${profile.first_name || ""}${profile.last_name ? ` ${profile.last_name}` : ""}`.trim() || "Unknown"
              : "Unknown",
            userEmail: profile?.email || "Unknown",
            ageHours,
          };
        })
      );

      setReviews(enriched);
    } catch (err) {
      console.error("Error fetching medical reviews:", err);
      toast.error("Failed to load medical reviews");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchReviews();
  }, [fetchReviews]);

  const handleAction = useCallback(async (
    reviewId: string,
    userId: string,
    action: "cleared" | "rejected"
  ) => {
    setActionLoading(reviewId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Update medical_reviews
      const { error: reviewError } = await supabase
        .from("medical_reviews")
        .update({
          status: action,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          review_notes: reviewNotes[reviewId] || null,
        })
        .eq("id", reviewId);

      if (reviewError) throw reviewError;

      // If cleared, update profile status to next step
      if (action === "cleared") {
        const { error: profileError } = await supabase
          .from("profiles_public")
          .update({ status: "pending_coach_approval" })
          .eq("id", userId)
          .eq("status", "needs_medical_review");

        if (profileError) throw profileError;
      }

      toast.success(
        action === "cleared"
          ? "Client cleared -- moved to coach assignment"
          : "Client flagged -- review rejected"
      );

      // Refresh
      hasFetched.current = false;
      await fetchReviews();
    } catch (err) {
      console.error("Medical review action error:", err);
      toast.error("Failed to update review");
    } finally {
      setActionLoading(null);
    }
  }, [reviewNotes, fetchReviews]);

  const pendingReviews = reviews.filter((r) => r.status === "pending");
  const completedReviews = reviews.filter((r) => r.status !== "pending");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pending Reviews */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-yellow-600" />
              Pending Medical Reviews
              {pendingReviews.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {pendingReviews.length}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              PAR-Q flagged submissions requiring admin review. SLA: 4 hours.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              hasFetched.current = false;
              setLoading(true);
              fetchReviews();
            }}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {pendingReviews.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <p>All medical reviews are up to date</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingReviews.map((review) => {
                const isOverdue = review.ageHours >= 4;
                const isProcessing = actionLoading === review.id;

                return (
                  <div
                    key={review.id}
                    className={`rounded-lg border p-4 space-y-3 ${
                      isOverdue ? "border-red-500/50 bg-red-500/5" : "border-yellow-500/30 bg-yellow-500/5"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium">{review.userName}</p>
                        <p className="text-sm text-muted-foreground">{review.userEmail}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Clock className={`h-4 w-4 ${isOverdue ? "text-red-500" : "text-yellow-600"}`} />
                        <span className={`text-sm font-mono ${isOverdue ? "text-red-500 font-semibold" : "text-yellow-600"}`}>
                          {review.ageHours}h
                        </span>
                        {isOverdue && (
                          <Badge variant="destructive" className="text-xs">
                            Overdue
                          </Badge>
                        )}
                      </div>
                    </div>

                    <Textarea
                      placeholder="Optional review notes..."
                      value={reviewNotes[review.id] || ""}
                      onChange={(e) =>
                        setReviewNotes((prev) => ({ ...prev, [review.id]: e.target.value }))
                      }
                      className="h-16"
                    />

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleAction(review.id, review.user_id, "cleared")}
                        disabled={isProcessing}
                      >
                        {isProcessing ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                        )}
                        Clear -- Move to Coach Assignment
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction(review.id, review.user_id, "rejected")}
                        disabled={isProcessing}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Completed Reviews */}
      {completedReviews.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Completed Reviews ({completedReviews.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {completedReviews.slice(0, 10).map((review) => (
                <div
                  key={review.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-2">
                    {review.status === "cleared" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="text-sm">{review.userName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {review.status === "cleared" ? "Cleared" : "Rejected"}
                    </span>
                    {review.reviewed_at && (
                      <span>
                        {new Date(review.reviewed_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
});
