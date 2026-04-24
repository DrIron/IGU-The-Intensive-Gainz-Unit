import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useAuthSession } from "@/hooks/useAuthSession";
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
 * Identity is still single-sourced in the shell for `clientUserId`.
 * The VIEWER's user id (for styling "You" rows and insert's sender_id)
 * comes from `useAuthSession` so a late-arriving session propagates
 * instead of being cached as null by a one-shot `auth.getUser()` call.
 */
export function MessagesTab({ context }: ClientOverviewTabProps) {
  const { user } = useAuthSession();
  const viewerId = user?.id ?? null;

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
