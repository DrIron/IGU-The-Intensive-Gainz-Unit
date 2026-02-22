import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Users, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SEOHead } from "@/components/SEOHead";
import { TeamBrowserCard } from "@/components/TeamBrowserCard";
import { useTeams } from "@/hooks/useTeams";
import { useSiteContent } from "@/hooks/useSiteContent";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Public /teams page - browse available team plans.
 * Accessible without authentication.
 */
export default function TeamsPage() {
  const navigate = useNavigate();
  const { teams, loading } = useTeams({ publicOnly: true });
  const { content } = useSiteContent("teams");
  const [openOnly, setOpenOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistTeamId, setWaitlistTeamId] = useState<string | null>(null);
  const [submittingWaitlist, setSubmittingWaitlist] = useState(false);

  const heroTitle = content?.hero?.title || "TEAM PLANS";
  const heroSubtitle = content?.hero?.subtitle || "Join a structured group training program led by our expert coaches. 12 KWD/month.";
  const heroDescription = content?.hero?.description || "";

  // Filter teams
  const filteredTeams = teams.filter((team) => {
    if (openOnly && team.statusBadge === "closed") return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        team.name.toLowerCase().includes(term) ||
        team.tags.some((t) => t.toLowerCase().includes(term)) ||
        (team.training_goal?.toLowerCase().includes(term) ?? false) ||
        team.coachName.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const handleSignUp = useCallback((teamId: string) => {
    navigate(`/auth?tab=signup&team=${teamId}`);
  }, [navigate]);

  const handleJoinWaitlist = useCallback((teamId: string) => {
    setWaitlistTeamId(teamId);
    setWaitlistEmail("");
  }, []);

  const submitWaitlist = useCallback(async () => {
    if (!waitlistEmail || !waitlistTeamId) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(waitlistEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setSubmittingWaitlist(true);
    try {
      const { error } = await supabase
        .from("team_waitlist")
        .insert({ team_id: waitlistTeamId, email: waitlistEmail });

      if (error) {
        if (error.code === "23505") {
          toast.info("You're already on this waitlist");
        } else {
          throw error;
        }
      } else {
        toast.success("You've been added to the waitlist. We'll notify you when a spot opens.");
      }

      setWaitlistTeamId(null);
      setWaitlistEmail("");
    } catch (err) {
      console.error("Waitlist error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmittingWaitlist(false);
    }
  }, [waitlistEmail, waitlistTeamId]);

  return (
    <>
      <SEOHead
        title="Team Plans -- IGU"
        description="Browse available team training plans at IGU. Join a structured group program led by expert coaches."
      />

      <div className="container max-w-5xl py-12 px-4">
        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight">
            {heroTitle}
          </h1>
          <p className="mt-3 text-lg text-muted-foreground max-w-2xl mx-auto">
            {heroSubtitle}
          </p>
          {heroDescription && (
            <p className="mt-2 text-sm text-muted-foreground max-w-2xl mx-auto">
              {heroDescription}
            </p>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
          <div className="relative flex-1 w-full sm:max-w-xs">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search teams..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="open-only"
              checked={openOnly}
              onCheckedChange={setOpenOnly}
            />
            <Label htmlFor="open-only" className="text-sm cursor-pointer">
              Open teams only
            </Label>
          </div>
        </div>

        {/* Team Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTeams.length === 0 ? (
          <div className="text-center py-20">
            <Users className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">
              {searchTerm
                ? `No teams found matching "${searchTerm}"`
                : "No teams available at the moment"}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTeams.map((team) => (
              <TeamBrowserCard
                key={team.id}
                team={team}
                onSignUp={handleSignUp}
                onJoinWaitlist={handleJoinWaitlist}
              />
            ))}
          </div>
        )}

        {/* Waitlist email capture dialog (inline) */}
        {waitlistTeamId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="bg-card border rounded-lg p-6 max-w-sm w-full mx-4 space-y-4">
              <h3 className="font-semibold">Join the Waitlist</h3>
              <p className="text-sm text-muted-foreground">
                Enter your email and we'll notify you when a spot opens up.
              </p>
              <Input
                type="email"
                placeholder="your@email.com"
                value={waitlistEmail}
                onChange={(e) => setWaitlistEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitWaitlist()}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setWaitlistTeamId(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={submitWaitlist}
                  disabled={submittingWaitlist || !waitlistEmail}
                >
                  {submittingWaitlist ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Join Waitlist"
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
