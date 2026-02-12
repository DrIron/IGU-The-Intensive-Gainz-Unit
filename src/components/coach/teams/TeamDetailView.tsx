import { useState, useEffect, useCallback, useRef, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, BookOpen, Calendar, Loader2, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { AssignTeamProgramDialog } from "./AssignTeamProgramDialog";
import { CreateTeamDialog } from "./CreateTeamDialog";
import { ProgramCalendarBuilder } from "../programs/ProgramCalendarBuilder";

interface TeamDetailViewProps {
  team: {
    id: string;
    name: string;
    description: string | null;
    tags: string[];
    current_program_template_id: string | null;
    max_members: number;
    is_active: boolean;
    memberCount: number;
    programName: string | null;
  };
  coachUserId: string;
  onBack: () => void;
  onRefresh: () => void;
}

interface TeamMember {
  subscriptionId: string;
  userId: string;
  firstName: string;
  displayName: string | null;
  status: string;
  startDate: string;
}

export const TeamDetailView = memo(function TeamDetailView({
  team,
  coachUserId,
  onBack,
  onRefresh,
}: TeamDetailViewProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const hasFetched = useRef(false);
  const { toast } = useToast();

  const loadMembers = useCallback(async () => {
    try {
      // Get subscriptions for this team by team_id
      const { data: subs, error } = await supabase
        .from("subscriptions")
        .select("id, user_id, status, created_at")
        .eq("team_id", team.id)
        .in("status", ["pending", "active"])
        .order("created_at");

      if (error) throw error;

      // Fetch profile names separately (FK join unreliable for profiles view)
      const enriched: TeamMember[] = await Promise.all(
        (subs || []).map(async (sub) => {
          const { data: profile } = await supabase
            .from("profiles_public")
            .select("first_name, display_name")
            .eq("id", sub.user_id)
            .maybeSingle();

          return {
            subscriptionId: sub.id,
            userId: sub.user_id,
            firstName: profile?.first_name || "Unknown",
            displayName: profile?.display_name || null,
            status: sub.status,
            startDate: sub.created_at,
          };
        })
      );

      setMembers(enriched);
    } catch (error: any) {
      toast({
        title: "Error loading members",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoadingMembers(false);
    }
  }, [team.id, toast]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadMembers();
  }, [loadMembers]);

  const handleDelete = useCallback(async () => {
    if (!confirm("Are you sure you want to delete this team? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("coach_teams")
        .update({ is_active: false })
        .eq("id", team.id);

      if (error) throw error;

      toast({ title: "Team deleted" });
      onBack();
    } catch (error: any) {
      toast({
        title: "Error deleting team",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }, [team.id, toast, onBack]);

  const handleAssigned = useCallback(() => {
    setShowAssignDialog(false);
    onRefresh();
  }, [onRefresh]);

  const handleEdited = useCallback(() => {
    setShowEditDialog(false);
    onRefresh();
  }, [onRefresh]);

  const handleCalendarBack = useCallback(() => {
    setShowCalendar(false);
  }, []);

  // Show calendar view for current program
  if (showCalendar && team.current_program_template_id) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={handleCalendarBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Team
        </Button>
        <ProgramCalendarBuilder
          programId={team.current_program_template_id}
          coachUserId={coachUserId}
          readOnly
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">{team.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              {team.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {team.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
              <span className="text-sm text-muted-foreground">
                {members.length} / {team.max_members} members
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowEditDialog(true)}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>

      {team.description && (
        <p className="text-muted-foreground">{team.description}</p>
      )}

      {/* Current Program */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Current Program
          </CardTitle>
        </CardHeader>
        <CardContent>
          {team.programName ? (
            <div className="flex items-center justify-between">
              <span className="font-medium">{team.programName}</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCalendar(true)}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  View Calendar
                </Button>
                <Button size="sm" onClick={() => setShowAssignDialog(true)}>
                  Change Program
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">No program assigned</span>
              <Button size="sm" onClick={() => setShowAssignDialog(true)}>
                Assign Program
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Team Members
          </CardTitle>
          <CardDescription>
            Members who selected this team during onboarding
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingMembers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : members.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No members in this team yet.
            </p>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.subscriptionId}
                  className="flex items-center justify-between p-3 rounded-md bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                      {(member.displayName || member.firstName).charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium">
                      {member.displayName || member.firstName}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={member.status === "active" ? "default" : "secondary"}>
                      {member.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Joined {format(new Date(member.startDate), "MMM d, yyyy")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign Team Program Dialog */}
      <AssignTeamProgramDialog
        open={showAssignDialog}
        onOpenChange={setShowAssignDialog}
        coachUserId={coachUserId}
        team={team}
        members={members}
        onAssigned={handleAssigned}
      />

      {/* Edit Team Dialog */}
      <CreateTeamDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        coachUserId={coachUserId}
        existingTeamCount={0}
        onCreated={handleEdited}
        editTeam={{
          id: team.id,
          name: team.name,
          description: team.description || "",
          tags: team.tags,
          max_members: team.max_members,
        }}
      />
    </div>
  );
});
