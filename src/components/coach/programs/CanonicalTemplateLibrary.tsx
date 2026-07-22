import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ClickableCard } from "@/components/ui/clickable-card";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Search, Edit, MoreVertical, BookOpen, Tag, Users, User, Trash2, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AssignFromLibraryDialog } from "./AssignFromLibraryDialog";

/**
 * Canonical template library (Phase 1b, flag `canonical_template_authoring`). Lists the coach's
 * standalone canonical `plan` templates (kind='template') via list_coach_template_plans(). "Edit" →
 * the Planning Board; "Assign to Team" via assign_team_plan; "Assign to Client" via
 * assign_plan_to_client_canonical (reusing the shared client picker); "Delete" soft-archives via
 * delete_template_plan (client copies survive) and the archived template drops off the list.
 */

interface CanonicalTemplateRow {
  id: string;
  name: string;
  description: string | null;
  level: string | null;
  tags: string[] | null;
  week_count: number;
  session_count: number;
  exercise_count: number;
}

interface CanonicalTemplateLibraryProps {
  coachUserId: string;
  onCreate: () => void;
  onEditPlan: (planId: string) => void;
}

export function CanonicalTemplateLibrary({ coachUserId, onCreate, onEditPlan }: CanonicalTemplateLibraryProps) {
  const [rows, setRows] = useState<CanonicalTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [assignTeamTarget, setAssignTeamTarget] = useState<{ planId: string; name: string } | null>(null);
  const [assignClientTarget, setAssignClientTarget] = useState<{ planId: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ planId: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_coach_template_plans");
    if (error) {
      toast({ title: "Error loading templates", description: sanitizeErrorForUser(error), variant: "destructive" });
      setRows([]);
    } else {
      setRows((data as unknown as CanonicalTemplateRow[]) ?? []);
    }
    setLoading(false);
  }, [toast]);

  const hasFetched = useRef(false);
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    load();
  }, [load]);

  // Delete = soft-archive (delete_template_plan). It never blocks; active client copies survive as
  // independent clones. On success we drop the card locally (the archived plan also falls off the list).
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.rpc("delete_template_plan", { p_plan_id: deleteTarget.planId });
      if (error) throw error;
      const res = (data as { archived?: boolean; active_client_copies?: number } | null) ?? {};
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.planId));
      const copies = res.active_client_copies ?? 0;
      toast({
        title: "Template archived",
        description: copies > 0 ? `${copies} active client cop${copies === 1 ? "y" : "ies"} keep running.` : undefined,
      });
      setDeleteTarget(null);
    } catch (e: unknown) {
      toast({ title: "Couldn't delete", description: sanitizeErrorForUser(e), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, toast]);

  const filtered = rows.filter(
    (r) =>
      search === "" ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.description ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Program templates authored on the Planning Board. Edit reopens the board; assign to a team to roll
        it out to members.
      </p>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No templates yet"
          description="Create your first template on the Planning Board."
          action={{ label: "Create Mesocycle", onClick: onCreate }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <ClickableCard
              key={t.id}
              ariaLabel={`Edit ${t.name}`}
              onClick={() => onEditPlan(t.id)}
              className="h-full p-0 flex flex-col"
            >
              <div className="flex items-start justify-between gap-2 px-4 pt-3" onClick={(e) => e.stopPropagation()}>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{t.name}</p>
                  {t.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEditPlan(t.id)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setAssignTeamTarget({ planId: t.id, name: t.name })}>
                      <Users className="mr-2 h-4 w-4" />
                      Assign to Team
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setAssignClientTarget({ planId: t.id, name: t.name })}>
                      <User className="mr-2 h-4 w-4" />
                      Assign to Client
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteTarget({ planId: t.id, name: t.name })}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <CardContent className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                  <span>{t.week_count} week{t.week_count === 1 ? "" : "s"}</span>
                  <span>·</span>
                  <span>{t.session_count} session{t.session_count === 1 ? "" : "s"}</span>
                  <span>·</span>
                  <span>{t.exercise_count} exercise{t.exercise_count === 1 ? "" : "s"}</span>
                </div>
                {t.tags && t.tags.length > 0 && (
                  <div className="mt-auto flex flex-wrap gap-1">
                    {t.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[10px]">
                        <Tag className="mr-1 h-3 w-3" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </ClickableCard>
          ))}
        </div>
      )}

      {assignTeamTarget && (
        <AssignToTeamDialog
          coachUserId={coachUserId}
          planId={assignTeamTarget.planId}
          planName={assignTeamTarget.name}
          onClose={() => setAssignTeamTarget(null)}
        />
      )}

      {/* Client-assign: the shared picker (resolves client + active subscription), canonical plan path. */}
      {assignClientTarget && (
        <AssignFromLibraryDialog
          open
          onOpenChange={(o) => !o && setAssignClientTarget(null)}
          mode="client"
          programId={assignClientTarget.planId}
          programTitle={assignClientTarget.name}
          coachUserId={coachUserId}
          canonicalPlanId={assignClientTarget.planId}
          onAssigned={() => setAssignClientTarget(null)}
        />
      )}

      {/* Delete = archive (client copies survive). */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete template?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleteTarget?.name}&rdquo; will be archived and removed from your templates. Clients
              already assigned a copy keep it — their programs are unaffected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Minimal team-assign: pick one of the coach's teams → assign_team_plan (own-your-copy clone). */
function AssignToTeamDialog({
  coachUserId,
  planId,
  planName,
  onClose,
}: {
  coachUserId: string;
  planId: string;
  planName: string;
  onClose: () => void;
}) {
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("coach_teams").select("id, name").eq("coach_id", coachUserId).order("name");
      if (!cancelled) {
        setTeams((data as { id: string; name: string }[]) ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coachUserId]);

  const assign = async (teamId: string) => {
    setAssigningId(teamId);
    try {
      const { error } = await supabase.rpc("assign_team_plan", { p_team_id: teamId, p_plan_id: planId, p_clone: true });
      if (error) throw error;
      toast({ title: "Assigned to team", description: "Members now have the shared copy." });
      onClose();
    } catch (e: unknown) {
      toast({ title: "Couldn't assign", description: sanitizeErrorForUser(e), variant: "destructive" });
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign to team</DialogTitle>
          <DialogDescription>&ldquo;{planName}&rdquo; — pick a team to roll out to its members.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : teams.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">You don't have any teams yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {teams.map((team) => (
              <Button
                key={team.id}
                variant="outline"
                className="justify-between"
                disabled={assigningId !== null}
                onClick={() => assign(team.id)}
              >
                {team.name}
                {assigningId === team.id && <Loader2 className="h-4 w-4 animate-spin" />}
              </Button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
