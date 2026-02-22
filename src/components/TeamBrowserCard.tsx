import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, Calendar, Clock, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EnrichedTeam } from "@/hooks/useTeams";

interface TeamBrowserCardProps {
  team: EnrichedTeam;
  onJoinWaitlist?: (teamId: string) => void;
  onSignUp?: (teamId: string) => void;
}

const STATUS_CONFIG = {
  open: { label: "Open", className: "bg-green-500/10 text-green-500 border-green-500/30" },
  almost_full: { label: "Almost Full", className: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
  closed: { label: "Closed", className: "bg-red-500/10 text-red-500 border-red-500/30" },
} as const;

/**
 * Rich team card for the public /teams browser page.
 * Shows team details, coach info, capacity, and CTA.
 */
export const TeamBrowserCard = memo(function TeamBrowserCard({
  team,
  onJoinWaitlist,
  onSignUp,
}: TeamBrowserCardProps) {
  const status = STATUS_CONFIG[team.statusBadge];
  const capacityPercent = Math.min(100, Math.round((team.memberCount / team.max_members) * 100));
  const isClosed = team.statusBadge === "closed";

  return (
    <Card className="overflow-hidden">
      {/* Cover image area */}
      {team.cover_image_url ? (
        <div className="h-36 bg-muted overflow-hidden">
          <img
            src={team.cover_image_url}
            alt={team.name}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="h-24 bg-gradient-to-br from-primary/20 to-primary/5" />
      )}

      <CardContent className="p-5 space-y-4">
        {/* Header: name + status badge */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-semibold leading-tight">{team.name}</h3>
          <Badge variant="outline" className={cn("shrink-0 text-xs", status.className)}>
            {status.label}
          </Badge>
        </div>

        {/* Description */}
        {team.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {team.description}
          </p>
        )}

        {/* Coach info */}
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7">
            <AvatarImage src={team.coachAvatarUrl || undefined} />
            <AvatarFallback className="text-xs bg-primary/10 text-primary">
              {team.coachName.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm text-muted-foreground">
            Coach {team.coachName}
          </span>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {team.sessions_per_week && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>{team.sessions_per_week}x / week</span>
            </div>
          )}
          {team.session_duration_min && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>{team.session_duration_min} min</span>
            </div>
          )}
          {team.training_goal && (
            <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
              <Target className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{team.training_goal}</span>
            </div>
          )}
        </div>

        {/* Tags */}
        {team.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {team.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Capacity bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {team.memberCount} / {team.max_members} members
            </span>
            <span>{team.spotsRemaining} spots left</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                team.statusBadge === "closed" && "bg-red-500",
                team.statusBadge === "almost_full" && "bg-amber-500",
                team.statusBadge === "open" && "bg-green-500"
              )}
              style={{ width: `${capacityPercent}%` }}
            />
          </div>
        </div>

        {/* Cycle info */}
        {team.cycle_weeks && (
          <p className="text-xs text-muted-foreground">
            {team.cycle_weeks}-week training cycle
            {team.cycle_start_date && ` -- starts ${new Date(team.cycle_start_date).toLocaleDateString()}`}
          </p>
        )}

        {/* CTA */}
        {isClosed && team.waitlist_enabled ? (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onJoinWaitlist?.(team.id)}
          >
            Join Waitlist
          </Button>
        ) : (
          <Button
            className="w-full"
            disabled={isClosed}
            onClick={() => onSignUp?.(team.id)}
          >
            {isClosed ? "Full" : "Sign Up"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
});
