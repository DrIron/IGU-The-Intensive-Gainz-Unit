import { useCallback, useEffect, useRef, useState } from "react";
import { TabShellSkeleton } from "@/components/ui/loading-skeleton";
import { Link } from "react-router-dom";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, UserX, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { ClientOverviewHeader } from "@/components/client-overview/ClientOverviewHeader";
import { ClientOverviewTabs } from "@/components/client-overview/ClientOverviewTabs";
import type {
  ClientContext,
  ClientOverviewProfile,
  ClientOverviewSubscription,
  ViewerRole,
} from "@/components/client-overview/types";

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "not-found" }
  | { kind: "ready"; context: ClientContext };

/**
 * ClientOverviewPanel — the reusable detail body for a single client.
 *
 * Extracted from the old standalone CoachClientOverview route (CO6) so the
 * same identity-resolution + render can be embedded in the coach shell's
 * master-detail workspace. It is the SINGLE SOURCE OF IDENTITY for the tabs:
 *   1. Resolve the viewed client's profile (profiles_public).
 *   2. Resolve their most recent subscription + service.
 *   3. Resolve the viewer's role relative to this client.
 * Tabs receive the resolved ClientContext via props and never refetch identity.
 *
 * It does NOT render <Navigation> — the embedding shell provides the global nav.
 * With no clientUserId it shows a calm "select a client" empty state.
 */
export function ClientOverviewPanel({ clientUserId }: { clientUserId?: string }) {
  const { user: sessionUser, isLoading: sessionLoading } = useAuthSession();
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async (targetClientId: string, viewer: SupabaseUser) => {
    setState({ kind: "loading" });

    // Parallelise the three identity reads. RLS decides what comes back --
    // a coach looking at a client that isn't theirs gets empty rows and we
    // fall through to the not-found state (no crash).
    const [profileRes, subRes, rolesRes, subroleRes] = await Promise.all([
      // profiles_public deliberately excludes PII -- last_name lives on
      // profiles_private and is not accessible to coaches. lastName stays null
      // in the context; tabs that truly need PII must fetch it themselves
      // under their own permission gate.
      supabase
        .from("profiles_public")
        .select("id, first_name, display_name, avatar_url, status")
        .eq("id", targetClientId)
        .maybeSingle(),
      supabase
        // coach_id is selected only to resolve the viewer's per-client role
        // below (primary coach of THIS client?) -- it is not part of the
        // ClientOverviewSubscription contract exposed to tabs.
        .from("subscriptions")
        .select("id, status, coach_id, service_id")
        .eq("user_id", targetClientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", viewer.id),
      supabase
        .from("user_subroles")
        .select("subrole_definitions!inner(slug)")
        .eq("user_id", viewer.id)
        .eq("status", "approved"),
    ]);

    if (profileRes.error) {
      console.error("[ClientOverviewPanel] profile:", profileRes.error.message);
      setState({ kind: "error", message: profileRes.error.message });
      return;
    }
    if (!profileRes.data) {
      setState({ kind: "not-found" });
      return;
    }

    if (subRes.error) {
      console.warn("[ClientOverviewPanel] subscription:", subRes.error.message);
    }
    if (rolesRes.error) {
      console.warn("[ClientOverviewPanel] user_roles:", rolesRes.error.message);
    }
    if (subroleRes.error) {
      console.warn("[ClientOverviewPanel] user_subroles:", subroleRes.error.message);
    }

    const profile: ClientOverviewProfile = {
      id: profileRes.data.id,
      firstName: profileRes.data.first_name,
      lastName: null,
      displayName: profileRes.data.display_name,
      avatarUrl: profileRes.data.avatar_url,
      status: profileRes.data.status ?? "unknown",
    };

    // Resolve service via a separate query -- CLAUDE.md bans nested PostgREST
    // FK joins on subscriptions. If the service can't be resolved, treat the
    // subscription as absent (contract requires non-null serviceType).
    let service: { name: string | null; type: string } | null = null;
    if (subRes.data?.service_id) {
      const { data: serviceRow, error: serviceErr } = await supabase
        .from("services")
        .select("name, type")
        .eq("id", subRes.data.service_id)
        .maybeSingle();
      if (serviceErr) {
        console.warn("[ClientOverviewPanel] service:", serviceErr.message);
      }
      service = serviceRow ?? null;
    }

    const subscription: ClientOverviewSubscription | null = subRes.data && service
      ? {
          id: subRes.data.id,
          status: subRes.data.status,
          serviceType: service.type,
          serviceName: service.name ?? null,
        }
      : null;

    const roleRows = (rolesRes.data ?? []) as Array<{ role: string }>;
    const subroleRows = (subroleRes.data ?? []) as Array<{
      subrole_definitions: { slug: string } | { slug: string }[];
    }>;
    const subroleSlugs = subroleRows.flatMap((r) => {
      const d = r.subrole_definitions;
      return Array.isArray(d) ? d.map((x) => x.slug) : [d.slug];
    });

    // A dual-credentialed coach+dietitian wears different hats on different
    // clients: on a client they're the primary coach of, their effective
    // role is "coach"; only where they're NOT the primary coach does the
    // dietitian subrole take over.
    const isPrimaryCoachOfThisClient = Boolean(
      subRes.data?.coach_id && viewer.id && subRes.data.coach_id === viewer.id,
    );
    const viewerRole = resolveViewerRole(
      roleRows.map((r) => r.role),
      subroleSlugs,
      isPrimaryCoachOfThisClient,
    );

    setState({
      kind: "ready",
      context: { clientUserId: targetClientId, profile, subscription, viewerRole },
    });
  }, []);

  useEffect(() => {
    if (!clientUserId) {
      setState({ kind: "idle" });
      hasFetched.current = null;
      return;
    }
    // Key the ref on clientUserId + viewer state so the effect retries when a
    // late-arriving session propagates and when the selected client changes.
    const key = `${clientUserId}:${sessionUser?.id ?? (sessionLoading ? "__waiting__" : "__unauth__")}`;
    if (hasFetched.current === key) return;
    hasFetched.current = key;
    if (sessionLoading) {
      setState({ kind: "loading" });
      return;
    }
    if (!sessionUser) {
      setState({ kind: "error", message: "Not signed in." });
      return;
    }
    load(clientUserId, sessionUser).catch((err) => {
      console.error("[ClientOverviewPanel] unexpected:", err);
      setState({ kind: "error", message: "Failed to load client." });
    });
  }, [clientUserId, sessionUser, sessionLoading, load]);

  if (state.kind === "idle") {
    return (
      <Card className="border-dashed">
        <CardContent className="py-16 text-center space-y-3">
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-muted">
              <Users className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </div>
          </div>
          <p className="font-medium">Select a client</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Choose a client from the list to view their overview.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (state.kind === "loading") {
    return <TabShellSkeleton cards={3} />;
  }

  if (state.kind === "not-found") return <NotFoundState />;

  if (state.kind === "error") {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <p className="text-sm text-destructive">{state.message}</p>
          <Button asChild variant="outline" size="sm">
            <Link to="/coach/clients">
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              Back to My Clients
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <ClientOverviewHeader context={state.context} />
      <ClientOverviewTabs context={state.context} />
    </div>
  );
}

function NotFoundState() {
  return (
    <Card>
      <CardContent className="py-12 text-center space-y-4">
        <div className="flex justify-center">
          <div className="p-4 rounded-full bg-muted">
            <UserX className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          </div>
        </div>
        <div className="space-y-1">
          <p className="font-medium">Client not found</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Either this client doesn't exist or they aren't assigned to you.
            Check the link or head back to your client list.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/coach/clients">
            <ChevronLeft className="h-3.5 w-3.5 mr-1" />
            Back to My Clients
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Resolve the viewer's role relative to THIS client. Admin precedence, then
 * dietitian subrole (only when NOT the primary coach of this client), else
 * coach. Per-client awareness keeps dual-credentialed coach+dietitian users
 * honest (coach on their own coached clients, dietitian elsewhere).
 */
function resolveViewerRole(
  roles: string[],
  subroleSlugs: string[],
  isPrimaryCoachOfThisClient: boolean,
): ViewerRole {
  if (roles.includes("admin")) return "admin";
  if (
    (roles.includes("dietitian") || subroleSlugs.includes("dietitian")) &&
    !isPrimaryCoachOfThisClient
  ) {
    return "dietitian";
  }
  return "coach";
}
