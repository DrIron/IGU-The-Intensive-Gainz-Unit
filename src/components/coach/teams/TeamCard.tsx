import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, BookOpen } from "lucide-react";

interface TeamCardProps {
  team: {
    id: string;
    name: string;
    description: string | null;
    tags: string[];
    memberCount: number;
    max_members: number;
    programName: string | null;
  };
  onClick: (teamId: string) => void;
}

export const TeamCard = memo(function TeamCard({ team, onClick }: TeamCardProps) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onClick(team.id)}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-lg truncate">{team.name}</CardTitle>
        {team.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {team.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
        {team.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {team.description}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span>
            {team.memberCount} / {team.max_members} members
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <span className="truncate">
            {team.programName || "No program assigned"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
});
