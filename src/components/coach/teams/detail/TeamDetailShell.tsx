import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, Users } from "lucide-react";
import { TeamDetailNav } from "./TeamDetailNav";
import { defaultTeamSection, TEAM_SECTION_SLUGS, type TeamSectionSlug } from "./team-sections";
import type { TeamContext } from "./team-types";
import { TeamPulseTab } from "./tabs/TeamPulseTab";
import { TeamNutritionTab } from "./tabs/TeamNutritionTab";
import { TeamProgramTab } from "./tabs/TeamProgramTab";
import { TeamRosterTab } from "./tabs/TeamRosterTab";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "not-found" }
  | { kind: "ready"; context: TeamContext };

/**
 * TeamDetailShell — the `/coach/teams/:teamId` page. Mirrors ClientOverviewPanel:
 * the SINGLE place that resolves team identity (meta + active member count), then
 * passes a `TeamContext` to each tab. Provides the global coach Navigation + the
 * `?tab=` secondary nav (pulse|nutrition|program|roster). Tabs never re-resolve
 * team identity. coach_teams RLS scopes the read to the head coach's own teams,
 * so a foreign teamId falls through to not-found.
 */
export function TeamDetailShell() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const { user: sessionUser, isLoading: sessionLoading } = useAuthSession();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const fetchedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!teamId) {
      setState({ kind: "not-found" });
      return;
    }
    const key = `${teamId}:${sessionUser?.id ?? (sessionLoading ? "__wait__" : "__none__")}`;
    if (fetchedKey.current === key) return;
    fetchedKey.current = key;
    if (sessionLoading) {
      setState({ kind: "loading" });
      return;
    }
    if (!sessionUser) {
      setState({ kind: "error", message: "Not signed in." });
      return;
    }
    (async () => {
      setState({ kind: "loading" });
      const { data: team, error } = await supabase
        .from("coach_teams")
        .select("id, name, coach_id, current_program_template_id, current_program_plan_id")
        .eq("id", teamId)
        .maybeSingle();
      if (error) {
        setState({ kind: "error", message: error.message });
        return;
      }
      if (!team) {
        setState({ kind: "not-found" });
        return;
      }
      const { count } = await supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("team_id", teamId)
        .in("status", ["pending", "active"]);
      setState({
        kind: "ready",
        context: {
          teamId: team.id,
          teamName: team.name,
          coachUserId: team.coach_id,
          memberCount: count ?? 0,
          currentProgramTemplateId: team.current_program_template_id ?? null,
          currentProgramPlanId: team.current_program_plan_id ?? null,
        },
      });
    })().catch((err) => {
      console.error("[TeamDetailShell] load:", err);
      setState({ kind: "error", message: "Failed to load team." });
    });
  }, [teamId, sessionUser, sessionLoading]);

  const handleSectionChange = useCallback(
    (section: string) => navigate(`/coach/${section}`),
    [navigate],
  );

  return (
    <>
      <Navigation
        user={sessionUser}
        userRole="coach"
        onSectionChange={handleSectionChange}
        activeSection="teams"
      />
      <main className="container mx-auto px-4 py-6 pb-24 md:pb-8 max-w-5xl">
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <Link to="/coach/teams">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Teams
          </Link>
        </Button>
        <TeamDetailBody state={state} />
      </main>
    </>
  );
}

function TeamDetailBody({ state }: { state: LoadState }) {
  if (state.kind === "loading") {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }
  if (state.kind === "not-found") {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-3">
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-muted">
              <Users className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </div>
          </div>
          <p className="font-medium">Team not found</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Either this team doesn't exist or it isn't one of yours.
          </p>
        </CardContent>
      </Card>
    );
  }
  if (state.kind === "error") {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-destructive">{state.message}</CardContent>
      </Card>
    );
  }
  return <TeamDetailTabs context={state.context} />;
}

function TeamDetailTabs({ context }: { context: TeamContext }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultSlug = defaultTeamSection();

  const validSet = useMemo(() => new Set<string>(TEAM_SECTION_SLUGS), []);
  const activeSlug = useMemo<TeamSectionSlug>(() => {
    const raw = searchParams.get("tab");
    return raw && validSet.has(raw) ? (raw as TeamSectionSlug) : defaultSlug;
  }, [searchParams, validSet, defaultSlug]);

  // Strip an unknown ?tab (replace so back-button can't return to it).
  useEffect(() => {
    const raw = searchParams.get("tab");
    if (raw && !validSet.has(raw)) {
      const next = new URLSearchParams(searchParams);
      next.delete("tab");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, validSet, setSearchParams]);

  const handleSelect = useCallback(
    (next: TeamSectionSlug) => {
      if (next === activeSlug) return;
      const params = new URLSearchParams(searchParams);
      if (next === defaultSlug) params.delete("tab");
      else params.set("tab", next);
      setSearchParams(params, { replace: true });
    },
    [activeSlug, defaultSlug, searchParams, setSearchParams],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold truncate">{context.teamName}</h1>
        <span className="text-sm text-muted-foreground shrink-0">
          {context.memberCount} member{context.memberCount === 1 ? "" : "s"}
        </span>
      </div>
      <TeamDetailNav activeSlug={activeSlug} onSelect={handleSelect} />
      <section className="min-w-0">
        {activeSlug === "pulse" && <TeamPulseTab context={context} />}
        {activeSlug === "nutrition" && <TeamNutritionTab context={context} />}
        {activeSlug === "program" && <TeamProgramTab context={context} />}
        {activeSlug === "roster" && <TeamRosterTab context={context} />}
      </section>
    </div>
  );
}
