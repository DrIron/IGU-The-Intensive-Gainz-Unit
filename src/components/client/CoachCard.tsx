import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, MessageSquare } from "lucide-react";

interface CoachCardProps {
  coach: {
    id: string; // coach.user_id (used as identifier)
    first_name: string;
    last_name?: string;
    nickname?: string;
    profile_picture_url?: string;
    short_bio?: string;
    specializations?: string[];
    qualifications?: string[];
  };
  clientFirstName?: string;
  /**
   * If true, this was the client's preferred coach and they got them.
   * If false, the client was auto-assigned (or their preferred coach was full).
   * If undefined, we don't know (legacy/untracked).
   */
  wasPreferred?: boolean;
  /**
   * If set, this is the name of the coach the client originally requested
   * but couldn't be assigned to (because they were at capacity).
   */
  originalPreferredCoachName?: string;
}

export function CoachCard({ coach, clientFirstName, wasPreferred, originalPreferredCoachName }: CoachCardProps) {
  const displayName = coach.nickname || `${coach.first_name} ${coach.last_name || ''}`.trim();
  const initials = coach.first_name?.[0] || 'C';

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-lg">Your Coach</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={coach.profile_picture_url} alt={displayName} />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h3 className="font-semibold">{displayName}</h3>
            {wasPreferred === true && (
              <p className="text-xs text-muted-foreground">Preferred coach</p>
            )}
          </div>
        </div>

        {/* Short bio */}
        {coach.short_bio && (
          <p className="text-sm text-muted-foreground">{coach.short_bio}</p>
        )}

        {/* Specializations */}
        {coach.specializations && coach.specializations.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {coach.specializations.slice(0, 4).map((spec, idx) => (
              <Badge key={idx} variant="secondary" className="text-xs">
                {spec}
              </Badge>
            ))}
            {coach.specializations.length > 4 && (
              <Badge variant="outline" className="text-xs">
                +{coach.specializations.length - 4} more
              </Badge>
            )}
          </div>
        )}

        {/* Qualifications summary */}
        {coach.qualifications && coach.qualifications.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {coach.qualifications.slice(0, 2).join(" • ")}
            {coach.qualifications.length > 2 && ` • +${coach.qualifications.length - 2} more`}
          </p>
        )}

        {/* Show message if client was auto-assigned due to capacity */}
        {wasPreferred === false && originalPreferredCoachName && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 border border-muted">
            <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Assigned to {displayName} (your requested coach, {originalPreferredCoachName}, is currently at capacity)
            </p>
          </div>
        )}

        {/* Contact guidance - no direct contact exposed */}
        <div className="flex items-start gap-2 p-3 rounded-md bg-primary/5 border border-primary/10">
          <MessageSquare className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Contact your coach via TrueCoach or Discord for training support
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
