import { memo } from "react";
import { UseFormReturn, useWatch } from "react-hook-form";
import { ClickableCard } from "@/components/ui/clickable-card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTeams } from "@/hooks/useTeams";

interface TeamSelectionSectionProps {
  form: UseFormReturn<any>;
}

export const TeamSelectionSection = memo(function TeamSelectionSection({
  form,
}: TeamSelectionSectionProps) {
  const { teams, loading } = useTeams({ publicOnly: false });
  // useWatch (not form.watch): this is a memoized child, so form.watch would
  // re-render the useForm owner (parent), not this component — the card would
  // never reflect the pick. useWatch subscribes at THIS component's level.
  const selectedTeamId = useWatch({ control: form.control, name: "selected_team_id" });

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

      <div className="space-y-3">
        {teams.map((team) => {
          const isFull = team.statusBadge === "closed";
          const isSelected = selectedTeamId === team.id;

          return (
            <ClickableCard
              key={team.id}
              ariaLabel={`Select team ${team.name}`}
              disabled={isFull}
              onClick={() => form.setValue("selected_team_id", team.id)}
              className={cn(
                "relative p-4",
                isFull && "opacity-50",
                isSelected && "border-primary ring-2 ring-primary/20 bg-primary/5",
              )}
            >
              {isSelected && (
                <CheckCircle2 className="absolute top-3 right-3 h-5 w-5 text-primary" aria-hidden />
              )}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{team.name}</span>
                  {isFull && (
                    <Badge variant="destructive" className="text-xs">
                      Full
                    </Badge>
                  )}
                </div>

                {team.description && (
                  <p className="text-sm text-muted-foreground">{team.description}</p>
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
            </ClickableCard>
          );
        })}
      </div>
    </div>
  );
});
