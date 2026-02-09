import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CheckCircle2, Dumbbell, MessageSquare, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface WelcomeModalProps {
  userId: string;
  firstName: string;
  subscription: any;
}

interface CoachInfo {
  first_name: string;
  last_name: string | null;
  profile_picture_url: string | null;
}

const WELCOME_SHOWN_KEY = "igu_welcome_shown";

export function WelcomeModal({ userId, firstName, subscription }: WelcomeModalProps) {
  const [open, setOpen] = useState(false);
  const [coach, setCoach] = useState<CoachInfo | null>(null);

  useEffect(() => {
    // Only show once per user
    const shownKey = `${WELCOME_SHOWN_KEY}_${userId}`;
    if (localStorage.getItem(shownKey)) return;

    // Fetch coach info
    const fetchCoach = async () => {
      if (!subscription?.coach_id) return;

      const { data } = await supabase
        .from("coaches_client_safe")
        .select("first_name, last_name, profile_picture_url")
        .eq("user_id", subscription.coach_id)
        .maybeSingle();

      if (data) setCoach(data);
    };

    fetchCoach();
    setOpen(true);
    localStorage.setItem(shownKey, "true");
  }, [userId, subscription?.coach_id]);

  if (!open) return null;

  const serviceName = subscription?.services?.name || "your plan";
  const isTeamPlan = subscription?.services?.type === "team";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl">
            Welcome to IGU, {firstName}!
          </DialogTitle>
          <DialogDescription className="text-center">
            Your {serviceName} subscription is now active. Here's what to expect.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Coach card */}
          {coach && (
            <div className="flex items-center gap-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
              <Avatar className="h-14 w-14 shrink-0">
                <AvatarImage src={coach.profile_picture_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-lg">
                  {coach.first_name.charAt(0)}{coach.last_name?.charAt(0) || ""}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm text-muted-foreground">Your coach</p>
                <p className="text-lg font-semibold">
                  {coach.first_name} {coach.last_name}
                </p>
              </div>
            </div>
          )}

          {/* Getting started steps */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Getting Started</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <div className="p-1.5 rounded-full bg-primary/10 text-primary mt-0.5">
                  <Dumbbell className="h-4 w-4" />
                </div>
                <div>
                  {isTeamPlan ? (
                    <>
                      <p className="font-medium text-sm">Your workouts are ready</p>
                      <p className="text-xs text-muted-foreground">Head to your Workout Calendar to see your team training program.</p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-sm">Your program is being prepared</p>
                      <p className="text-xs text-muted-foreground">Your coach will build your personalized training program within 24-48 hours.</p>
                    </>
                  )}
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="p-1.5 rounded-full bg-primary/10 text-primary mt-0.5">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-medium text-sm">Join the community</p>
                  <p className="text-xs text-muted-foreground">Connect with your coach and other members on Discord for support and accountability.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="p-1.5 rounded-full bg-primary/10 text-primary mt-0.5">
                  <Calendar className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-medium text-sm">Check your dashboard daily</p>
                  <p className="text-xs text-muted-foreground">Your workouts, nutrition targets, and progress tracking are all here.</p>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <Button onClick={() => setOpen(false)} className="w-full" variant="gradient">
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Let's Get Started
        </Button>
      </DialogContent>
    </Dialog>
  );
}
