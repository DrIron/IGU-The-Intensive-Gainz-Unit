import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Loader2, Bell } from "lucide-react";
import type { TeamDetailTabProps } from "../team-types";

interface WaitlistEntry {
  id: string;
  email: string;
  userId: string | null;
  status: string;
  createdAt: string;
  notifiedAt: string | null;
  name: string | null;
}

/**
 * Team Waitlist — owner-only tab. Lists everyone who signed up to be notified
 * when a spot opens on this team. The head-coach SELECT policy (T3) lets the
 * owner read their own waitlist; the "Notify" action goes through the
 * mark_team_waitlist_notified SECURITY DEFINER RPC (there is no head-coach
 * UPDATE policy on team_waitlist), then fires the email edge fn best-effort.
 */
export function TeamWaitlistTab({ context }: TeamDetailTabProps) {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const hasFetched = useRef(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from("team_waitlist")
        .select("id, email, user_id, status, created_at, notified_at")
        .eq("team_id", context.teamId)
        .order("created_at");
      if (error) throw error;

      // Best-effort name resolution for entries that have a linked user.
      const userIds = Array.from(
        new Set((rows || []).map((r) => r.user_id).filter((id): id is string => !!id)),
      );
      const nameById = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles_public")
          .select("id, first_name, display_name")
          .in("id", userIds);
        (profiles || []).forEach((p) => {
          const label = p.display_name || p.first_name;
          if (label) nameById.set(p.id, label);
        });
      }

      setEntries(
        (rows || []).map((r) => ({
          id: r.id,
          email: r.email,
          userId: r.user_id ?? null,
          status: r.status,
          createdAt: r.created_at,
          notifiedAt: r.notified_at ?? null,
          name: r.user_id ? nameById.get(r.user_id) ?? null : null,
        })),
      );
    } catch (error) {
      toast({
        title: "Error loading waitlist",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.teamId]);

  const handleNotify = async (id: string) => {
    setNotifyingId(id);
    try {
      // `as never`: RPC exists in the DB (migration 20260704183000) but isn't in
      // the generated types yet -- same pattern as useClientDemographics.ts.
      const { error } = await supabase.rpc("mark_team_waitlist_notified" as never, {
        p_waitlist_id: id,
      } as never);
      if (error) throw error;
      // Fire-and-forget: the email edge fn is not critical to the status update.
      void supabase.functions
        .invoke("send-team-waitlist-notify", { body: { waitlistId: id } })
        .catch(() => {});
      toast({ title: "Waitlist entry notified" });
      await load();
    } catch (error) {
      toast({
        title: "Error notifying",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setNotifyingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No one on the waitlist yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const notified = entry.status === "notified";
        return (
          <Card key={entry.id}>
            <CardContent className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {entry.name ? `${entry.name} · ` : ""}
                  {entry.email}
                </p>
                <p className="text-xs text-muted-foreground">
                  Joined {new Date(entry.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={notified ? "secondary" : "default"}>
                  {notified ? "Notified" : "Waiting"}
                </Badge>
                {!notified && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleNotify(entry.id)}
                    disabled={notifyingId === entry.id}
                  >
                    {notifyingId === entry.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <>
                        <Bell className="h-4 w-4 mr-1.5" aria-hidden="true" />
                        Notify
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
