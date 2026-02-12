import { useState, useEffect, useCallback, useRef, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Users, UsersRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

interface AvailableTeam {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  max_members: number;
  coachName: string;
  memberCount: number;
}

interface ChooseTeamPromptProps {
  subscription: {
    id: string;
    service_id: string;
  };
  userId: string;
}

export const ChooseTeamPrompt = memo(function ChooseTeamPrompt({
  subscription,
  userId,
}: ChooseTeamPromptProps) {
  const [teams, setTeams] = useState<AvailableTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [joining, setJoining] = useState(false);
  const hasFetched = useRef(false);
  const { toast } = useToast();

  const loadTeams = useCallback(async () => {
    try {
      const { data: teamsData, error } = await supabase
        .from("coach_teams")
        .select("id, name, description, tags, max_members, coach_id")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;

      const enriched: AvailableTeam[] = await Promise.all(
        (teamsData || []).map(async (team) => {
          const { data: coach } = await supabase
            .from("coaches_client_safe")
            .select("first_name, last_name")
            .eq("user_id", team.coach_id)
            .maybeSingle();

          const { count } = await supabase
            .from("subscriptions")
            .select("id", { count: "exact", head: true })
            .eq("team_id", team.id)
            .in("status", ["pending", "active"]);

          const coachName = coach
            ? `${coach.first_name}${coach.last_name ? ` ${coach.last_name}` : ""}`
            : "Coach";

          return {
            id: team.id,
            name: team.name,
            description: team.description,
            tags: team.tags || [],
            max_members: team.max_members,
            coachName,
            memberCount: count || 0,
          };
        })
      );

      setTeams(enriched);
    } catch (error) {
      console.error("Error loading teams:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadTeams();
  }, [loadTeams]);

  const handleJoinTeam = useCallback(async () => {
    if (!selectedTeamId) return;
    setJoining(true);
    try {
      const { error } = await supabase
        .from("subscriptions")
        .update({ team_id: selectedTeamId })
        .eq("id", subscription.id)
        .eq("user_id", userId);

      if (error) throw error;

      toast({
        title: "Team Joined",
        description: "You've been added to the team. Reloading...",
      });

      // Reload so the dashboard re-fetches subscription with team_id set
      setTimeout(() => window.location.reload(), 800);
    } catch (error: any) {
      console.error("Error joining team:", error);
      toast({
        title: "Failed to join team",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setJoining(false);
    }
  }, [selectedTeamId, subscription.id, userId, toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Alert className="border-indigo-500/50 bg-indigo-500/10">
        <UsersRound className="h-4 w-4 text-indigo-500" />
        <AlertTitle>Choose Your Team</AlertTitle>
        <AlertDescription>
          Select which team you'd like to join to get started with your workouts.
        </AlertDescription>
      </Alert>

      {teams.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">
            No teams are available at the moment. Please check back soon.
          </p>
        </Card>
      ) : (
        <RadioGroup
          value={selectedTeamId}
          onValueChange={setSelectedTeamId}
          className="space-y-3"
        >
          {teams.map((team) => {
            const isFull = team.memberCount >= team.max_members;

            return (
              <Card
                key={team.id}
                className={`p-4 ${isFull ? "opacity-50" : ""}`}
              >
                <label className="flex items-start space-x-3 cursor-pointer">
                  <RadioGroupItem value={team.id} disabled={isFull} />
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{team.name}</span>
                      {isFull && (
                        <Badge variant="destructive" className="text-xs">
                          Full
                        </Badge>
                      )}
                    </div>

                    {team.description && (
                      <p className="text-sm text-muted-foreground">
                        {team.description}
                      </p>
                    )}

                    {team.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {team.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                      <span>Coach: {team.coachName}</span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {team.memberCount} / {team.max_members} members
                      </span>
                    </div>
                  </div>
                </label>
              </Card>
            );
          })}
        </RadioGroup>
      )}

      <Button
        onClick={handleJoinTeam}
        disabled={!selectedTeamId || joining}
        className="w-full"
      >
        {joining ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Joining Team...
          </>
        ) : (
          "Join Team"
        )}
      </Button>
    </div>
  );
});
