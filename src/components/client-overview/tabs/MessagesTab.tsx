import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CoachClientThread } from "@/components/messaging/CoachClientThread";
import type { ClientOverviewTabProps } from "../types";

/**
 * Coach-side Messages tab. Mounts the shared `CoachClientThread` scoped
 * to this client. Every read/write goes through RLS -- the viewer must
 * be the client themselves (impossible here since this is a coach route),
 * an active care-team member, or admin. Unauthorised viewers see an
 * empty thread and a disabled composer (insert returns an RLS error,
 * which the thread surfaces inline).
 *
 * Identity is still single-sourced in the shell. This tab only needs
 * the VIEWER's user id (for styling "You" rows and insert's sender_id),
 * which doesn't live on `ClientContext` -- one auth.getUser() call
 * fetches it once per mount.
 */
export function MessagesTab({ context }: ClientOverviewTabProps) {
  const [viewerId, setViewerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.warn("[MessagesTab] getUser:", error.message);
        return;
      }
      setViewerId(data.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!viewerId) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2
            className="h-5 w-5 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <CoachClientThread
      clientUserId={context.clientUserId}
      viewerUserId={viewerId}
    />
  );
}
