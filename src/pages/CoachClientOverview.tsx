import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, UserX } from "lucide-react";
import { Navigation } from "@/components/Navigation";
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
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "not-found" }
  | { kind: "ready"; context: ClientContext };

/**
 * Shell for /coach/clients/:clientUserId.
 *
 * Responsibilities owned here (single source of truth for tabs):
 *   1. Resolve the viewed client's profile (profiles_public).
 *   2. Resolve their most recent subscription + service.
 *   3. Resolve the viewer's role relative to this client.
 *
 * Tabs receive the resolved ClientContext via props and never refetch
 * identity data. Tab-scoped data (phase, programs, etc.) is still the
 * tab's responsibility.
 */
export default function CoachClientOverview() {
  const { clientUserId } = useParams<{ clientUserId: string }>();
  const { user: sessionUser, isLoading: sessionLoading } = useAuthSession();
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async (targetClientId: string, viewer: SupabaseUser) => {
    setState({ kind: "loading" });
    setUser({ id: viewer.id });

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
      console.error("[CoachClientOverview] profile:", profileRes.error.message);
      setState({ kind: "error", message: profileRes.error.message });
      return;
    }
    if (!profileRes.data) {
      setState({ kind: "not-found" });
      return;
    }

    if (subRes.error) {
      console.warn("[CoachClientOverview] subscription:", subRes.error.message);
    }
    if (rolesRes.error) {
      console.warn("[CoachClientOverview] user_roles:", rolesRes.error.message);
    }
    if (subroleRes.error) {
      console.warn("[CoachClientOverview] user_subroles:", subroleRes.error.message);
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
    // FK joins on subscriptions. Mirrors the old `services!inner(...)`
    // behaviour: if the service can't be resolved, treat the subscription as
    // absent (contract requires non-null serviceType).
    let service: { name: string | null; type: string } | null = null;
    if (subRes.data?.service_id) {
      const { data: serviceRow, error: serviceErr } = await supabase
        .from("services")
        .select("name, type")
        .eq("id", subRes.data.service_id)
        .maybeSingle();
      if (serviceErr) {
        console.warn("[CoachClientOverview] service:", serviceErr.message);
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
    // role is "coach" (full tab access); only on clients where they're NOT
    // the primary coach does the dietitian subrole take over.
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
      context: {
        clientUserId: targetClientId,
        profile,
        subscription,
        viewerRole,
      },
    });
  }, []);

  useEffect(() => {
    if (!clientUserId) {
      setState({ kind: "error", message: "Missing client id." });
      return;
    }
    // Key the ref on clientUserId + viewer state so the effect retries when
    // a late-arriving session propagates through useAuthSession.
    const key = `${clientUserId}:${sessionUser?.id ?? (sessionLoading ? "__waiting__" : "__unauth__")}`;
    if (hasFetched.current === key) return;
    hasFetched.current = key;
    if (sessionLoading) return;
    if (!sessionUser) {
      setState({ kind: "error", message: "Not signed in." });
      return;
    }
    load(clientUserId, sessionUser).catch((err) => {
      console.error("[CoachClientOverview] unexpected:", err);
      setState({ kind: "error", message: "Failed to load client." });
    });
  }, [clientUserId, sessionUser, sessionLoading, load]);

  return (
    <>
      <Navigation user={user} userRole="coach" />
      <div className="space-y-6 px-4 pt-6 pb-24 md:pb-8 max-w-7xl mx-auto">
        {state.kind === "loading" && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          </div>
        )}

        {state.kind === "not-found" && <NotFoundState />}

        {state.kind === "error" && (
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
        )}

        {state.kind === "ready" && (
          <>
            <ClientOverviewHeader context={state.context} />
            <ClientOverviewTabs context={state.context} />
          </>
        )}
      </div>
    </>
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
 * Resolve the viewer's role relative to THIS client. Admin takes precedence,
 * dietitian subrole second, otherwise coach. Note: the route guard currently
 * blocks admins -- the branch exists so the contract stays honest when the
 * admin-access follow-up PR lands.
 *
 * Per-client awareness matters: dual-credentialed coach+dietitian users wear
 * different hats on different clients. Their viewerRole on a given client
 * should reflect their role *on that client* -- a coach viewing one of their
 * own coached clients is a "coach" (full tab access), even though they also
 * hold the dietitian subrole globally. The dietitian branch is therefore
 * gated on "not the primary coach of this client".
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
