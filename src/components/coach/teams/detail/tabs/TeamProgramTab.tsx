import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";
import { ProgramCalendarBuilder } from "@/components/coach/programs/ProgramCalendarBuilder";
import { AssignTeamProgramDialog } from "@/components/coach/teams/AssignTeamProgramDialog";
import type { TeamDetailTabProps } from "../team-types";

interface DialogMember {
  subscriptionId: string;
  userId: string;
  firstName: string;
  displayName: string | null;
  status: string;
}

/**
 * Team Program — the shared program preview (read-only) + a "Change program"
 * action that fans out to all members. Per the team model there is NO per-member
 * editing here: a banner makes the all-members blast radius explicit.
 */
export function TeamProgramTab({ context }: TeamDetailTabProps) {
  const [showAssign, setShowAssign] = useState(false);
  const [members, setMembers] = useState<DialogMember[]>([]);
  const fetched = useRef(false);

  // Members are needed by AssignTeamProgramDialog (per-member status). Team-coach
  // RLS on subscriptions/profiles_public already covers these reads.
  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    (async () => {
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("id, user_id, status")
        .eq("team_id", context.teamId)
        .in("status", ["pending", "active"]);
      const enriched = await Promise.all(
        (subs || []).map(async (s) => {
          const { data: p } = await supabase
            .from("profiles_public")
            .select("first_name, display_name")
            .eq("id", s.user_id)
            .maybeSingle();
          return {
            subscriptionId: s.id,
            userId: s.user_id,
            firstName: p?.first_name || "Member",
            displayName: p?.display_name ?? null,
            status: s.status,
          };
        }),
      );
      setMembers(enriched);
    })();
  }, [context.teamId]);

  const hasProgram = !!context.currentProgramTemplateId;

  return (
    <div className="space-y-4">
      {/* All-members blast-radius banner (the whole team model). */}
      <div className="flex items-center gap-2 rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm text-blue-700 dark:text-blue-400">
        <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Editing the team program changes it for all {context.memberCount} member
          {context.memberCount === 1 ? "" : "s"}.
        </span>
      </div>

      <div className="flex items-center justify-end">
        <Button size="sm" onClick={() => setShowAssign(true)}>
          {hasProgram ? "Change program" : "Assign program"}
        </Button>
      </div>

      {hasProgram ? (
        <ProgramCalendarBuilder
          programId={context.currentProgramTemplateId as string}
          coachUserId={context.coachUserId}
          readOnly
        />
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No program assigned to this team yet.
          </CardContent>
        </Card>
      )}

      <AssignTeamProgramDialog
        open={showAssign}
        onOpenChange={setShowAssign}
        coachUserId={context.coachUserId}
        team={{ id: context.teamId, name: context.teamName }}
        members={members}
        onAssigned={() => setShowAssign(false)}
      />
    </div>
  );
}
