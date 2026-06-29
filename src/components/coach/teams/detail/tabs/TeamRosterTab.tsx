import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { ClickableCard } from "@/components/ui/clickable-card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronRight } from "lucide-react";
import type { TeamDetailTabProps } from "../team-types";

interface RosterMember {
  userId: string;
  firstName: string;
  displayName: string | null;
  status: string;
}

/**
 * Team Roster — member rows that open the existing /coach/clients/:id overview
 * (the full, already-built view-only member detail). This reuses one member-detail
 * UI; it works because the team-coach SELECT policies (T3 §0) let the head coach
 * read each member's data even when they aren't the member's primary coach.
 * Editing a team member's plan is never offered from here.
 */
export function TeamRosterTab({ context }: TeamDetailTabProps) {
  const navigate = useNavigate();
  const [members, setMembers] = useState<RosterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    (async () => {
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
            firstName: p?.first_name || "Member",
            displayName: p?.display_name ?? null,
            status: s.status,
          };
        }),
      );
      setMembers(enriched);
      setLoading(false);
    })();
  }, [context.teamId]);

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
        {members.map((m) => (
          <ClickableCard
            key={m.userId}
            ariaLabel={`Open ${m.displayName || m.firstName}'s overview`}
            onClick={() => navigate(`/coach/clients/${m.userId}`)}
          >
            <CardContent className="flex items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium shrink-0">
                  {(m.displayName || m.firstName).charAt(0).toUpperCase()}
                </div>
                <span className="font-medium truncate">{m.displayName || m.firstName}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={m.status === "active" ? "default" : "secondary"}>{m.status}</Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </div>
            </CardContent>
          </ClickableCard>
        ))}
      </div>
    </div>
  );
}
