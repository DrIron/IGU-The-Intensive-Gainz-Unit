import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Video, Clock, CheckCircle2, Circle, Lock, PartyPopper } from "lucide-react";

interface TrainingContent {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  duration_minutes: number;
  is_required: boolean;
  sort_order: number;
}

interface Completion {
  content_id: string;
  completed_at: string;
}

interface CoachTrainingDashboardProps {
  coachUserId: string;
  onTrainingComplete?: () => void;
}

function extractVideoId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

export function CoachTrainingDashboard({ coachUserId, onTrainingComplete }: CoachTrainingDashboardProps) {
  const { toast } = useToast();
  const [content, setContent] = useState<TrainingContent[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContent, setSelectedContent] = useState<TrainingContent | null>(null);
  const [marking, setMarking] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [viewStartTime, setViewStartTime] = useState<number | null>(null);
  const [allComplete, setAllComplete] = useState(false);
  const hasFetched = useRef(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const [{ data: contentData, error: contentErr }, { data: compData, error: compErr }] = await Promise.all([
        supabase
          .from("coach_educational_content")
          .select("id, title, description, video_url, duration_minutes, is_required, sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("coach_content_completions")
          .select("content_id, completed_at")
          .eq("coach_user_id", coachUserId),
      ]);

      if (contentErr) throw contentErr;
      if (compErr) throw compErr;

      setContent(contentData || []);
      setCompletions(compData || []);
    } catch (error: unknown) {
      console.error("Error loading training data:", error);
      toast({ title: "Error", description: "Failed to load training content", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [coachUserId, toast]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadData();
  }, [loadData]);

  const completedIds = new Set(completions.map((c) => c.content_id));
  const requiredContent = content.filter((c) => c.is_required);
  const optionalContent = content.filter((c) => !c.is_required);
  const completedRequired = requiredContent.filter((c) => completedIds.has(c.id)).length;
  const progressPercent = requiredContent.length > 0 ? Math.round((completedRequired / requiredContent.length) * 100) : 0;

  const handleSelectContent = (item: TrainingContent) => {
    setSelectedContent(item);
    setAcknowledged(false);
    setViewStartTime(Date.now());
  };

  const handleMarkComplete = async () => {
    if (!selectedContent) return;

    try {
      setMarking(true);
      const timeSpent = viewStartTime ? Math.round((Date.now() - viewStartTime) / 1000) : null;

      const { error } = await supabase
        .from("coach_content_completions")
        .insert({
          coach_user_id: coachUserId,
          content_id: selectedContent.id,
          time_spent_seconds: timeSpent,
        });

      if (error) throw error;

      // Check if all training is now complete
      const { data: result } = await supabase.rpc("check_training_completion", {
        p_coach_user_id: coachUserId,
      });

      setCompletions((prev) => [...prev, { content_id: selectedContent.id, completed_at: new Date().toISOString() }]);
      setSelectedContent(null);

      if (result?.all_complete) {
        setAllComplete(true);
        toast({ title: "Training Complete!", description: "Your account has been activated. Welcome to the team!" });
        onTrainingComplete?.();
      } else {
        toast({ title: "Completed", description: `"${selectedContent.title}" marked as complete.` });
      }
    } catch (error: unknown) {
      console.error("Error marking complete:", error);
      toast({ title: "Error", description: "Failed to mark as complete", variant: "destructive" });
    } finally {
      setMarking(false);
    }
  };

  // Check if enough time elapsed (80% of duration)
  const minViewSeconds = selectedContent ? selectedContent.duration_minutes * 60 * 0.8 : 0;
  const elapsedSeconds = viewStartTime ? (Date.now() - viewStartTime) / 1000 : 0;
  const canMarkComplete = acknowledged && (elapsedSeconds >= minViewSeconds || minViewSeconds < 30);

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">Loading training content...</p>
        </CardContent>
      </Card>
    );
  }

  if (allComplete) {
    return (
      <Card>
        <CardContent className="pt-12 pb-12 text-center space-y-4">
          <PartyPopper className="h-16 w-16 mx-auto text-green-500" />
          <h2 className="text-2xl font-bold">Training Complete!</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            You have completed all required training. Your coach account is now active.
            Welcome to the IGU Coaching team!
          </p>
          <Button onClick={() => window.location.reload()}>
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Video viewer
  if (selectedContent) {
    const videoId = extractVideoId(selectedContent.video_url);
    const isCompleted = completedIds.has(selectedContent.id);

    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => setSelectedContent(null)}>
          Back to Training
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              {selectedContent.title}
            </CardTitle>
            {selectedContent.description && (
              <CardDescription>{selectedContent.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Video embed */}
            {videoId ? (
              <div className="aspect-video rounded-lg overflow-hidden bg-black">
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}?rel=0`}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={selectedContent.title}
                />
              </div>
            ) : (
              <div className="aspect-video rounded-lg bg-muted flex items-center justify-center">
                <a href={selectedContent.video_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Open video in new tab
                </a>
              </div>
            )}

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              {selectedContent.duration_minutes} minutes
              {selectedContent.is_required && (
                <Badge variant="default" className="ml-2 text-xs">Required</Badge>
              )}
            </div>

            {isCompleted ? (
              <div className="flex items-center gap-2 text-green-500">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Already completed</span>
              </div>
            ) : (
              <div className="space-y-3 pt-2 border-t">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-muted-foreground"
                  />
                  <span className="text-sm">
                    I have watched this video and understand the content presented.
                  </span>
                </label>

                <Button
                  onClick={handleMarkComplete}
                  disabled={!canMarkComplete || marking}
                  className="w-full"
                >
                  {marking ? "Saving..." : "Mark as Complete"}
                </Button>

                {acknowledged && !canMarkComplete && (
                  <p className="text-xs text-muted-foreground text-center">
                    Please spend more time reviewing this content before marking it complete.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Training overview
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Coach Training</CardTitle>
          <CardDescription>
            Complete all required training to activate your coach account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{completedRequired} / {requiredContent.length} required</span>
            </div>
            <Progress value={progressPercent} className="h-3" />
          </div>
        </CardContent>
      </Card>

      {/* Required Videos */}
      {requiredContent.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Required Training</h3>
          <div className="grid gap-3">
            {requiredContent.map((item) => {
              const isCompleted = completedIds.has(item.id);
              return (
                <Card
                  key={item.id}
                  className={`cursor-pointer transition-shadow hover:shadow-md ${isCompleted ? "border-green-500/30" : ""}`}
                  onClick={() => handleSelectContent(item)}
                >
                  <CardContent className="flex items-center gap-4 py-4">
                    {isCompleted ? (
                      <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />
                    ) : (
                      <Circle className="h-6 w-6 text-muted-foreground flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium ${isCompleted ? "line-through text-muted-foreground" : ""}`}>
                        {item.title}
                      </p>
                      {item.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">{item.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground flex-shrink-0">
                      <Clock className="h-3.5 w-3.5" />
                      {item.duration_minutes}m
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Optional Videos */}
      {optionalContent.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Optional Resources</h3>
          <div className="grid gap-3">
            {optionalContent.map((item) => {
              const isCompleted = completedIds.has(item.id);
              return (
                <Card
                  key={item.id}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => handleSelectContent(item)}
                >
                  <CardContent className="flex items-center gap-4 py-4">
                    {isCompleted ? (
                      <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />
                    ) : (
                      <Video className="h-6 w-6 text-muted-foreground flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{item.title}</p>
                      {item.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">{item.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant="secondary" className="text-xs">Optional</Badge>
                      <span className="text-sm text-muted-foreground">{item.duration_minutes}m</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
