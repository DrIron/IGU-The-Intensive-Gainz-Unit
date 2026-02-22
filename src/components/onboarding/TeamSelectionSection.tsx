import { memo } from "react";
import { UseFormReturn } from "react-hook-form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users } from "lucide-react";
import { useTeams } from "@/hooks/useTeams";

interface TeamSelectionSectionProps {
  form: UseFormReturn<any>;
}

export const TeamSelectionSection = memo(function TeamSelectionSection({
  form,
}: TeamSelectionSectionProps) {
  const { teams, loading } = useTeams({ publicOnly: false });
  const selectedTeamId = form.watch("selected_team_id");

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
          const isFull = team.statusBadge === "closed";

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
