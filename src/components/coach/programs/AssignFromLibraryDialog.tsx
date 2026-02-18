import { useState, useEffect, useCallback, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { assignProgramToClient } from "@/lib/assignProgram";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface ClientOption {
  subscriptionId: string;
  userId: string;
  firstName: string;
  lastName: string | null;
}

interface TeamMember {
  subscriptionId: string;
  userId: string;
  firstName: string;
  displayName: string | null;
  status: string;
}

interface TeamOption {
  id: string;
  name: string;
  members: TeamMember[];
}

interface AssignFromLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programId: string;
  programTitle: string;
  coachUserId: string;
  mode: "client" | "team";
  onAssigned?: () => void;
}

export const AssignFromLibraryDialog = memo(function AssignFromLibraryDialog({
  open,
  onOpenChange,
  programId,
  programTitle,
  coachUserId,
  mode,
  onAssigned,
}: AssignFromLibraryDialogProps) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [selectedClientSub, setSelectedClientSub] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const { toast } = useToast();

  const loadClients = useCallback(async () => {
    try {
      const { data: subs, error } = await supabase
        .from("subscriptions")
        .select("id, user_id")
        .eq("coach_id", coachUserId)
        .eq("status", "active");

      if (error) throw error;

      const clientList: ClientOption[] = [];
      for (const sub of subs || []) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", sub.user_id)
          .maybeSingle();

        if (profile) {
          clientList.push({
            subscriptionId: sub.id,
            userId: sub.user_id,
            firstName: profile.first_name || "Unknown",
            lastName: profile.last_name,
          });
        }
      }

      clientList.sort((a, b) => a.firstName.localeCompare(b.firstName));
      setClients(clientList);
    } catch (error: unknown) {
      toast({
        title: "Error loading clients",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [coachUserId, toast]);

  const loadTeams = useCallback(async () => {
    try {
      const { data: teamData, error } = await supabase
        .from("coach_teams")
        .select("id, name")
        .eq("coach_id", coachUserId)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;

      const teamList: TeamOption[] = [];
      for (const team of teamData || []) {
        const { data: memberSubs } = await supabase
          .from("subscriptions")
          .select("id, user_id, status")
          .eq("team_id", team.id)
          .in("status", ["pending", "active"]);

        const members: TeamMember[] = [];
        for (const sub of memberSubs || []) {
          const { data: profile } = await supabase
            .from("profiles_public")
            .select("first_name, display_name")
            .eq("id", sub.user_id)
            .maybeSingle();
          if (profile) {
            members.push({
              subscriptionId: sub.id,
              userId: sub.user_id,
              firstName: profile.first_name || "Unknown",
              displayName: profile.display_name,
              status: sub.status,
            });
          }
        }

        teamList.push({ id: team.id, name: team.name, members });
      }

      setTeams(teamList);
    } catch (error: unknown) {
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
    if (!open) return;
    setLoading(true);
    setSelectedClientSub("");
    setSelectedTeamId("");
    setStartDate(new Date());
    setErrors([]);
    setProgress({ current: 0, total: 0 });
    if (mode === "client") {
      loadClients();
    } else {
      loadTeams();
    }
  }, [open, mode, loadClients, loadTeams]);

  const handleAssignToClient = async () => {
    const client = clients.find((c) => c.subscriptionId === selectedClientSub);
    if (!client) return;

    setAssigning(true);
    try {
      const result = await assignProgramToClient({
        coachUserId,
        clientUserId: client.userId,
        subscriptionId: client.subscriptionId,
        programTemplateId: programId,
        startDate,
      });

      if (!result.success) {
        throw new Error(result.error || "Assignment failed");
      }

      toast({
        title: "Program assigned",
        description: `"${programTitle}" assigned to ${client.firstName}.`,
      });
      onOpenChange(false);
      onAssigned?.();
    } catch (error: unknown) {
      toast({
        title: "Error assigning program",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setAssigning(false);
    }
  };

  const handleAssignToTeam = async () => {
    const team = teams.find((t) => t.id === selectedTeamId);
    if (!team) return;
    const activeMembers = team.members.filter((m) => m.status === "active");
    if (activeMembers.length === 0) {
      toast({
        title: "No active members",
        description: "This team has no active members.",
        variant: "destructive",
      });
      return;
    }

    setAssigning(true);
    setProgress({ current: 0, total: activeMembers.length });
    setErrors([]);

    const assignmentErrors: string[] = [];
    let successCount = 0;

    for (let i = 0; i < activeMembers.length; i++) {
      const member = activeMembers[i];
      setProgress({ current: i + 1, total: activeMembers.length });

      const result = await assignProgramToClient({
        coachUserId,
        clientUserId: member.userId,
        subscriptionId: member.subscriptionId,
        programTemplateId: programId,
        startDate,
        teamId: team.id,
      });

      if (result.success) {
        successCount++;
      } else {
        assignmentErrors.push(
          `${member.displayName || member.firstName}: ${result.error}`
        );
      }
    }

    if (successCount > 0) {
      await supabase
        .from("coach_teams")
        .update({ current_program_template_id: programId })
        .eq("id", team.id);
    }

    setErrors(assignmentErrors);

    if (assignmentErrors.length === 0) {
      toast({
        title: "Program assigned",
        description: `"${programTitle}" assigned to ${successCount} team members.`,
      });
      onOpenChange(false);
      onAssigned?.();
    } else if (successCount > 0) {
      toast({
        title: "Partial success",
        description: `Assigned to ${successCount} of ${activeMembers.length} members. ${assignmentErrors.length} failed.`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Assignment failed",
        description: "Failed to assign program to any team members.",
        variant: "destructive",
      });
    }
    setAssigning(false);
  };

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);
  const activeTeamMembers = selectedTeam?.members.filter((m) => m.status === "active") || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "client" ? "Assign to Client" : "Assign to Team"}
          </DialogTitle>
          <DialogDescription>
            Assign &ldquo;{programTitle}&rdquo; to {mode === "client" ? "a client" : "all active members of a team"}.
            Only published modules will be delivered.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {mode === "client" ? (
            <div className="space-y-2">
              <Label>Select Client</Label>
              {loading ? (
                <div className="text-sm text-muted-foreground">Loading clients...</div>
              ) : clients.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No active clients found.
                </div>
              ) : (
                <Select value={selectedClientSub} onValueChange={setSelectedClientSub}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.subscriptionId} value={client.subscriptionId}>
                        {client.firstName}{client.lastName ? ` ${client.lastName}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Select Team</Label>
                {loading ? (
                  <div className="text-sm text-muted-foreground">Loading teams...</div>
                ) : teams.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No active teams found.
                  </div>
                ) : (
                  <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a team" />
                    </SelectTrigger>
                    <SelectContent>
                      {teams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name} ({team.members.filter(m => m.status === "active").length} active)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {selectedTeam && (
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-sm font-medium mb-1">
                    {activeTeamMembers.length} active member{activeTeamMembers.length !== 1 ? "s" : ""} will receive the program
                  </p>
                  {selectedTeam.members.filter((m) => m.status === "pending").length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {selectedTeam.members.filter((m) => m.status === "pending").length} pending members will not be assigned
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Start Date */}
          <div className="space-y-2">
            <Label>Start Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => date && setStartDate(date)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Progress bar during team assignment */}
          {assigning && mode === "team" && (
            <div className="space-y-2">
              <Progress value={(progress.current / progress.total) * 100} />
              <p className="text-sm text-center text-muted-foreground">
                Assigning {progress.current} / {progress.total}...
              </p>
            </div>
          )}

          {/* Error list */}
          {errors.length > 0 && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md space-y-1">
              <p className="text-sm font-medium text-destructive">Failed assignments:</p>
              {errors.map((err, i) => (
                <p key={i} className="text-xs text-destructive/80">{err}</p>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={assigning}>
            Cancel
          </Button>
          {mode === "client" ? (
            <Button
              onClick={handleAssignToClient}
              disabled={!selectedClientSub || assigning}
            >
              {assigning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Assigning...
                </>
              ) : (
                "Assign"
              )}
            </Button>
          ) : (
            <Button
              onClick={handleAssignToTeam}
              disabled={!selectedTeamId || assigning || activeTeamMembers.length === 0}
            >
              {assigning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Assigning...
                </>
              ) : (
                `Assign to ${activeTeamMembers.length} Members`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
