import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, Users, MoreVertical, Pencil, Power } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TeamDetailNav } from "./TeamDetailNav";
import { CreateTeamDialog } from "../CreateTeamDialog";
import { defaultTeamSection, TEAM_SECTION_SLUGS, type TeamSectionSlug } from "./team-sections";
import type { TeamContext } from "./team-types";
import { TeamPulseTab } from "./tabs/TeamPulseTab";
import { TeamNutritionTab } from "./tabs/TeamNutritionTab";
import { TeamProgramTab } from "./tabs/TeamProgramTab";
import { TeamRosterTab } from "./tabs/TeamRosterTab";
import { TeamWaitlistTab } from "./tabs/TeamWaitlistTab";

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
  const { user: sessionUser, isLoading: sessionLoading } = useAuthSession();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [refreshNonce, setRefreshNonce] = useState(0);
  const fetchedKey = useRef<string | null>(null);
  const refetch = useCallback(() => setRefreshNonce((n) => n + 1), []);
  const isOwner = !!sessionUser && state.kind === "ready" && sessionUser.id === state.context.coachUserId;

  useEffect(() => {
    if (!teamId) {
      setState({ kind: "not-found" });
      return;
    }
    const key = `${teamId}:${sessionUser?.id ?? (sessionLoading ? "__wait__" : "__none__")}:${refreshNonce}`;
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
        .select(
          "id, name, coach_id, current_program_template_id, current_program_plan_id, description, tags, max_members, is_active, cover_image_url",
        )
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
          description: team.description ?? null,
          tags: team.tags ?? [],
          maxMembers: team.max_members,
          isActive: team.is_active,
          coverImageUrl: team.cover_image_url ?? null,
        },
      });
    })().catch((err) => {
      console.error("[TeamDetailShell] load:", err);
      setState({ kind: "error", message: "Failed to load team." });
    });
  }, [teamId, sessionUser, sessionLoading, refreshNonce]);

  // Rendered inside the coach shell (CoachDashboard → CoachDashboardLayout →
  // CoachTeamsPage when :teamId is present), which supplies the coach Navigation +
  // sidebar + page padding — so no standalone <Navigation/> or outer <main> here.
  return (
    <div className="max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link to="/coach/teams">
          <ChevronLeft className="h-4 w-4 mr-1" />
          Teams
        </Link>
      </Button>
      <TeamDetailBody state={state} isOwner={isOwner} refetch={refetch} />
    </div>
  );
}

function TeamDetailBody({
  state,
  isOwner,
  refetch,
}: {
  state: LoadState;
  isOwner: boolean;
  refetch: () => void;
}) {
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
  return <TeamDetailTabs context={state.context} isOwner={isOwner} refetch={refetch} />;
}

function TeamDetailTabs({
  context,
  isOwner,
  refetch,
}: {
  context: TeamContext;
  isOwner: boolean;
  refetch: () => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultSlug = defaultTeamSection();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [toggling, setToggling] = useState(false);

  // Waitlist is owner-only; non-owners never see the tab (nor reach it via ?tab=).
  const visibleSlugs = useMemo<readonly TeamSectionSlug[]>(
    () => (isOwner ? TEAM_SECTION_SLUGS : TEAM_SECTION_SLUGS.filter((s) => s !== "waitlist")),
    [isOwner],
  );
  const validSet = useMemo(() => new Set<string>(visibleSlugs), [visibleSlugs]);
  const activeSlug = useMemo<TeamSectionSlug>(() => {
    const raw = searchParams.get("tab");
    return raw && validSet.has(raw) ? (raw as TeamSectionSlug) : defaultSlug;
  }, [searchParams, validSet, defaultSlug]);

  // Strip an unknown/forbidden ?tab (replace so back-button can't return to it).
  useEffect(() => {
    const raw = searchParams.get("tab");
    if (raw && !validSet.has(raw)) {
      const next = new URLSearchParams(searchParams);
      next.delete("tab");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, validSet, setSearchParams]);

  const handleToggleActive = useCallback(async () => {
    setToggling(true);
    try {
      const { data, error } = await supabase
        .from("coach_teams")
        .update({ is_active: !context.isActive })
        .eq("id", context.teamId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Update not persisted");
      toast({ title: context.isActive ? "Team deactivated" : "Team reactivated" });
      setDeactivateOpen(false);
      refetch();
    } catch (error) {
      toast({
        title: "Error updating team",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setToggling(false);
    }
  }, [context.isActive, context.teamId, refetch, toast]);

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
        {!context.isActive && (
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
            Inactive
          </span>
        )}
        <span className="text-sm text-muted-foreground shrink-0">
          {context.memberCount} member{context.memberCount === 1 ? "" : "s"}
        </span>
        {isOwner && (
          <div className="ml-auto shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Manage team">
                  <MoreVertical className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4 mr-2" aria-hidden="true" />
                  Edit team
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDeactivateOpen(true)}>
                  <Power className="h-4 w-4 mr-2" aria-hidden="true" />
                  {context.isActive ? "Deactivate team" : "Reactivate team"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      <TeamDetailNav activeSlug={activeSlug} onSelect={handleSelect} slugs={visibleSlugs} />
      <section className="min-w-0">
        {activeSlug === "pulse" && <TeamPulseTab context={context} />}
        {activeSlug === "nutrition" && <TeamNutritionTab context={context} />}
        {activeSlug === "program" && <TeamProgramTab context={context} />}
        {activeSlug === "roster" && <TeamRosterTab context={context} />}
        {activeSlug === "waitlist" && isOwner && <TeamWaitlistTab context={context} />}
      </section>

      {isOwner && (
        <>
          <CreateTeamDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            coachUserId={context.coachUserId}
            existingTeamCount={0}
            editTeam={{
              id: context.teamId,
              name: context.teamName,
              description: context.description ?? "",
              tags: context.tags,
              max_members: context.maxMembers,
              cover_image_url: context.coverImageUrl,
            }}
            onCreated={() => {
              setEditOpen(false);
              refetch();
            }}
          />
          <AlertDialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {context.isActive ? "Deactivate team?" : "Reactivate team?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {context.isActive
                    ? "This team will be hidden from the public team browser and won't accept new members. You can reactivate it anytime."
                    : "This team will be visible again and can accept new members."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={toggling}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    void handleToggleActive();
                  }}
                  disabled={toggling}
                >
                  {context.isActive ? "Deactivate" : "Reactivate"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
