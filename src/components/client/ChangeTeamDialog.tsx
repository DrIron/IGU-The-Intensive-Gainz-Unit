import { useState, useEffect, useCallback, useRef, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Users, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { captureException } from "@/lib/errorLogging";
import { describeJoinTeamError } from "@/lib/joinTeamError";

// Mirrors the server-side gap in the join_team RPC (migration 20260531140000).
const TEAM_CHANGE_GAP_DAYS = 28;

interface AvailableTeam {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  max_members: number;
  coachName: string;
  memberCount: number;
}

interface ChangeTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: {
    id: string;
    team_id: string | null;
    last_team_change_at: string | null;
    next_billing_date: string | null;
  };
}

export const ChangeTeamDialog = memo(function ChangeTeamDialog({
  open,
  onOpenChange,
  subscription,
}: ChangeTeamDialogProps) {
  const [teams, setTeams] = useState<AvailableTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [changing, setChanging] = useState(false);
  const hasFetched = useRef(false);
  const { toast } = useToast();

  const loadTeams = useCallback(async () => {
    try {
      // Use SECURITY DEFINER RPC -- coaches_client_safe view is RLS-broken
      // for clients, and the prior per-team coach+count loop was N+1.
      const { data: rpcData, error } = await supabase
        .rpc("list_active_teams_for_client");

      if (error) throw error;

      const rows = (rpcData ?? []) as Array<{
        id: string;
        name: string;
        description: string | null;
        tags: string[];
        max_members: number;
        coach_id: string;
        coach_first_name: string | null;
        coach_last_name: string | null;
        member_count: number;
      }>;

      const enriched: AvailableTeam[] = rows.map((team) => {
        const coachName = team.coach_first_name
          ? `${team.coach_first_name}${team.coach_last_name ? ` ${team.coach_last_name}` : ""}`
          : "Coach";
        return {
          id: team.id,
          name: team.name,
          description: team.description,
          tags: team.tags || [],
          max_members: team.max_members,
          coachName,
          memberCount: team.member_count,
        };
      });

      setTeams(enriched);
    } catch (error) {
      console.error("Error loading teams:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadTeams();
  }, [open, loadTeams]);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedTeamId("");
      hasFetched.current = false;
      setLoading(true);
    }
  }, [open]);

  const handleChangeTeam = useCallback(async () => {
    if (!selectedTeamId || selectedTeamId === subscription.team_id) return;
    setChanging(true);
    try {
      // Route through the join_team SECURITY DEFINER RPC (B7-N2/N4/N5/N6):
      // syncs coach_id, re-checks capacity under a row lock, and enforces the
      // once-per-cycle gap server-side. The inline gap notice below is UX only;
      // the RPC is the real boundary.
      const { error } = await supabase.rpc("join_team", {
        p_subscription_id: subscription.id,
        p_team_id: selectedTeamId,
      });

      if (error) throw error;

      toast({
        title: "Team Changed",
        description: "You've been moved to your new team. Reloading...",
      });

      onOpenChange(false);
      setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      captureException(error, {
        source: "ChangeTeamDialog.handleChangeTeam",
        metadata: { subscriptionId: subscription.id, teamId: selectedTeamId },
      });
      toast({
        title: "Failed to change team",
        description: describeJoinTeamError(error),
        variant: "destructive",
      });
    } finally {
      setChanging(false);
    }
  }, [selectedTeamId, subscription.id, subscription.team_id, toast, onOpenChange]);

  // Compute the next date the client is allowed to change teams (mirrors the
  // join_team RPC's 28-day gap). UX-only -- the server is authoritative.
  const nextAllowedAt = subscription.last_team_change_at
    ? new Date(
        new Date(subscription.last_team_change_at).getTime() +
          TEAM_CHANGE_GAP_DAYS * 24 * 60 * 60 * 1000,
      )
    : null;
  const isWithinGap = nextAllowedAt !== null && nextAllowedAt.getTime() > Date.now();
  const nextAllowedLabel = nextAllowedAt?.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Change Team</DialogTitle>
          <DialogDescription>
            Select a different team to join. You can change your team once per billing cycle.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : teams.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No teams are available at the moment.
          </p>
        ) : (
          <RadioGroup
            value={selectedTeamId}
            onValueChange={setSelectedTeamId}
            className="space-y-3"
          >
            {teams.map((team) => {
              const isCurrent = team.id === subscription.team_id;
              const isFull =
                team.memberCount >= team.max_members && !isCurrent;

              return (
                <Card
                  key={team.id}
                  className={`p-4 ${isFull ? "opacity-50" : ""} ${isCurrent ? "border-primary/50 bg-primary/5" : ""}`}
                >
                  <label className="flex items-start space-x-3 cursor-pointer">
                    <RadioGroupItem
                      value={team.id}
                      disabled={isCurrent || isFull}
                    />
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{team.name}</span>
                        {isCurrent && (
                          <Badge variant="default" className="text-xs">
                            Current
                          </Badge>
                        )}
                        {isFull && !isCurrent && (
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
                            <Badge
                              key={tag}
                              variant="outline"
                              className="text-xs"
                            >
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

        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            {isWithinGap
              ? `You can change your team once per billing cycle. You'll be able to change again on ${nextAllowedLabel}.`
              : "You can change your team once per billing cycle."}
          </span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleChangeTeam}
            disabled={
              !selectedTeamId ||
              selectedTeamId === subscription.team_id ||
              changing ||
              isWithinGap
            }
          >
            {changing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Changing...
              </>
            ) : (
              "Change Team"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
