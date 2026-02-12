import { useState, useEffect, useCallback, useRef, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Plus, Loader2 } from "lucide-react";
import { TeamCard } from "./TeamCard";
import { TeamDetailView } from "./TeamDetailView";
import { CreateTeamDialog } from "./CreateTeamDialog";

interface CoachTeamsPageProps {
  coachUserId: string;
}

interface Team {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  current_program_template_id: string | null;
  max_members: number;
  is_active: boolean;
  created_at: string;
  memberCount: number;
  programName: string | null;
}

const MAX_TEAMS = 3;

export const CoachTeamsPage = memo(function CoachTeamsPage({ coachUserId }: CoachTeamsPageProps) {
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [isHeadCoach, setIsHeadCoach] = useState<boolean | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const hasFetched = useRef(false);
  const { toast } = useToast();

  const loadTeams = useCallback(async () => {
    try {
      // Check head coach status
      const { data: coachProfile } = await supabase
        .from("coaches_public")
        .select("is_head_coach")
        .eq("user_id", coachUserId)
        .maybeSingle();

      setIsHeadCoach(coachProfile?.is_head_coach || false);

      if (!coachProfile?.is_head_coach) {
        setLoading(false);
        return;
      }

      // Load teams
      const { data: teamsData, error } = await supabase
        .from("coach_teams")
        .select("*")
        .eq("coach_id", coachUserId)
        .eq("is_active", true)
        .order("created_at");

      if (error) throw error;

      // Enrich each team with member count and program name
      const enrichedTeams: Team[] = await Promise.all(
        (teamsData || []).map(async (team) => {
          // Member count from subscriptions by team_id
          const { count } = await supabase
            .from("subscriptions")
            .select("id", { count: "exact", head: true })
            .eq("team_id", team.id)
            .in("status", ["pending", "active"]);

          // Program template name
          let programName: string | null = null;
          if (team.current_program_template_id) {
            const { data: program } = await supabase
              .from("program_templates")
              .select("title")
              .eq("id", team.current_program_template_id)
              .maybeSingle();
            programName = program?.title || null;
          }

          return {
            id: team.id,
            name: team.name,
            description: team.description,
            tags: team.tags || [],
            current_program_template_id: team.current_program_template_id,
            max_members: team.max_members,
            is_active: team.is_active,
            created_at: team.created_at,
            memberCount: count || 0,
            programName,
          };
        })
      );

      setTeams(enrichedTeams);
    } catch (error: any) {
      toast({
        title: "Error loading teams",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [coachUserId, toast]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadTeams();
  }, [loadTeams]);

  const handleRefresh = useCallback(() => {
    hasFetched.current = false;
    setLoading(true);
    loadTeams();
    hasFetched.current = true;
  }, [loadTeams]);

  const handleTeamClick = useCallback((teamId: string) => {
    setSelectedTeamId(teamId);
    setView("detail");
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedTeamId(null);
    setView("list");
    handleRefresh();
  }, [handleRefresh]);

  const handleTeamCreated = useCallback(() => {
    setShowCreateDialog(false);
    handleRefresh();
  }, [handleRefresh]);

  // Not a head coach
  if (isHeadCoach === false) {
    return (
      <Alert className="border-orange-500/30 bg-orange-500/5">
        <ShieldAlert className="h-4 w-4 text-orange-400" />
        <AlertDescription>
          Head Coach role required to manage teams. Contact an administrator to be assigned as a Head Coach.
        </AlertDescription>
      </Alert>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Detail view
  if (view === "detail" && selectedTeamId) {
    const team = teams.find((t) => t.id === selectedTeamId);
    if (!team) {
      setView("list");
      return null;
    }
    return (
      <TeamDetailView
        team={team}
        coachUserId={coachUserId}
        onBack={handleBackToList}
        onRefresh={handleRefresh}
      />
    );
  }

  // List view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {teams.length} of {MAX_TEAMS} teams
          </p>
        </div>
        <Button
          onClick={() => setShowCreateDialog(true)}
          disabled={teams.length >= MAX_TEAMS}
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Team
        </Button>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            No teams created yet. Create your first team to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} onClick={handleTeamClick} />
          ))}
        </div>
      )}

      <CreateTeamDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        coachUserId={coachUserId}
        existingTeamCount={teams.length}
        onCreated={handleTeamCreated}
      />
    </div>
  );
});
