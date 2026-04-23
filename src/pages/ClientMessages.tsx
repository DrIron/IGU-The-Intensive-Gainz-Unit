import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Loader2, MessageSquare } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { supabase } from "@/integrations/supabase/client";
import { CoachClientThread } from "@/components/messaging/CoachClientThread";

/**
 * Client-facing /messages -- a single thread shared with the client's
 * active care team. Reuses `CoachClientThread` (same component the coach
 * side uses), scoped to the authenticated user as both the thread key and
 * the viewer.
 *
 * No identity refetch is done beyond `auth.getUser()` (the page doesn't
 * live inside the coach overview shell that owns that resolution).
 * Mobile dock visibility is handled by the `/messages` prefix added to
 * `clientPaths` in App.tsx.
 */
export default function ClientMessages() {
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data.user) {
        setLoadError(error?.message ?? "Not signed in");
        return;
      }
      setViewerId(data.user.id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Navigation user={viewerId ? { id: viewerId } : null} userRole="client" />
      <div className="space-y-6 px-4 pt-6 pb-24 md:pb-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-3 w-3" aria-hidden="true" />
              Dashboard
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              Messages
            </h1>
            <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
              One shared thread with your IGU care team.
            </p>
          </div>
        </div>

        {loadError ? (
          <Card>
            <CardContent className="py-10 text-center space-y-3">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button asChild variant="outline" size="sm">
                <Link to="/auth">Sign in</Link>
              </Button>
            </CardContent>
          </Card>
        ) : !viewerId ? (
          <Card>
            <CardContent className="py-10 flex items-center justify-center">
              <Loader2
                className="h-5 w-5 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            </CardContent>
          </Card>
        ) : (
          <CoachClientThread
            clientUserId={viewerId}
            viewerUserId={viewerId}
            viewerIsClient
          />
        )}
      </div>
    </>
  );
}
