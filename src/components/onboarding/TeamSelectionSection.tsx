import { useState, useEffect, useCallback, useRef, memo } from "react";
import { UseFormReturn } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users } from "lucide-react";

interface AvailableTeam {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  max_members: number;
  coachName: string;
  memberCount: number;
}

interface TeamSelectionSectionProps {
  form: UseFormReturn<any>;
}

export const TeamSelectionSection = memo(function TeamSelectionSection({
  form,
}: TeamSelectionSectionProps) {
  const [teams, setTeams] = useState<AvailableTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  const selectedTeamId = form.watch("selected_team_id");

  const loadTeams = useCallback(async () => {
    try {
      // RLS allows authenticated users to read active teams
      const { data: teamsData, error } = await supabase
        .from("coach_teams")
        .select("id, name, description, tags, max_members, coach_id")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;

      // Enrich with coach name and member count
      const enriched: AvailableTeam[] = await Promise.all(
        (teamsData || []).map(async (team) => {
          // Coach name from coaches_client_safe (RLS-safe for clients)
          const { data: coach } = await supabase
            .from("coaches_client_safe")
            .select("first_name, last_name")
            .eq("user_id", team.coach_id)
            .maybeSingle();

          // Member count from subscriptions
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No teams available at the moment.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Choose Your Team *</p>
        <p className="text-sm text-muted-foreground mt-1">
          Select which team you'd like to join. Each team is led by a head coach with a specific training focus.
        </p>
      </div>

      <RadioGroup
        value={selectedTeamId || ""}
        onValueChange={(value) => form.setValue("selected_team_id", value)}
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
    </div>
  );
});
