import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Card, CardContent } from "@/components/ui/card";
import { ClickableCard } from "@/components/ui/clickable-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, ChevronRight, UserMinus } from "lucide-react";
import type { TeamDetailTabProps } from "../team-types";

interface RosterMember {
  userId: string;
  subscriptionId: string;
  firstName: string;
  displayName: string | null;
  status: string;
}

/**
 * Team Roster — member rows that open the existing /coach/clients/:id overview
 * (the full, already-built view-only member detail). This reuses one member-detail
 * UI; it works because the team-coach SELECT policies (T3 §0) let the head coach
 * read each member's data even when they aren't the member's primary coach.
 * Editing a team member's plan is never offered from here. The owner (head coach)
 * gets a per-member Remove control (remove_team_member RPC).
 */
export function TeamRosterTab({ context }: TeamDetailTabProps) {
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const { toast } = useToast();
  const [members, setMembers] = useState<RosterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const fetched = useRef(false);

  const isOwner = user?.id === context.coachUserId;

  const load = async () => {
    setLoading(true);
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("id, user_id, status, created_at")
      .eq("team_id", context.teamId)
      .in("status", ["pending", "active"])
      .order("created_at");
    const enriched = await Promise.all(
      (subs || []).map(async (s) => {
        const { data: p } = await supabase
          .from("profiles_public")
          .select("first_name, display_name")
          .eq("id", s.user_id)
          .maybeSingle();
        return {
          userId: s.user_id,
          subscriptionId: s.id,
          firstName: p?.first_name || "Member",
          displayName: p?.display_name ?? null,
          status: s.status,
        };
      }),
    );
    setMembers(enriched);
    setLoading(false);
  };

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.teamId]);

  const handleRemove = async (m: RosterMember) => {
    setRemovingId(m.subscriptionId);
    try {
      // `as never`: RPC exists in the DB (migration 20260704180000) but isn't in
      // the generated types yet -- same pattern as useClientDemographics.ts.
      const { error } = await supabase.rpc("remove_team_member" as never, {
        p_subscription_id: m.subscriptionId,
        p_team_id: context.teamId,
      } as never);
      if (error) throw error;
      toast({ title: "Member removed" });
      await load();
    } catch (error) {
      toast({
        title: "Error removing member",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No members in this team yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Opening a member shows their full overview — view-only from the team context.
      </p>
      <div className="space-y-2">
        {members.map((m) => {
          const name = m.displayName || m.firstName;
          return (
            // Remove control lives OUTSIDE the ClickableCard's click target (sibling
            // button) so we never nest an interactive element inside role="button".
            <div key={m.userId} className="flex items-center gap-2">
              <ClickableCard
                className="flex-1 min-w-0"
                ariaLabel={`Open ${name}'s overview`}
                onClick={() => navigate(`/coach/clients/${m.userId}`)}
              >
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium shrink-0">
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium truncate">{name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={m.status === "active" ? "default" : "secondary"}>{m.status}</Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </div>
                </CardContent>
              </ClickableCard>
              {isOwner && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${name} from ${context.teamName}`}
                      disabled={removingId === m.subscriptionId}
                    >
                      {removingId === m.subscriptionId ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <UserMinus className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove member?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Remove {name} from {context.teamName}? They'll keep their subscription but
                        lose the team + coach assignment.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleRemove(m)}>Remove</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
