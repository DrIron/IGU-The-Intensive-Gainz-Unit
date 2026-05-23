import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck, CheckCircle2, Clock, Trash2, AlertTriangle, Video as VideoIcon, ListOrdered } from "lucide-react";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

// PR J: lapsed = anything other than 'active' or 'past_due' (grace-period clients
// still see content per useClientAccess.isInGracePeriod). NULL = no subscription row.
const LAPSED_STATUSES = new Set(["inactive", "cancelled", "expired", "suspended"]);
const isLapsed = (status: string | null): boolean =>
  status === null || LAPSED_STATUSES.has(status);

const titleCase = (s: string) =>
  s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

interface AssignmentRow {
  assignment_id: string;
  client_id: string;
  client_first_name: string | null;
  client_display_name: string | null;
  client_subscription_status: string | null;
  video_id: string | null;
  video_title: string | null;
  playlist_id: string | null;
  playlist_title: string | null;
  note: string | null;
  assigned_at: string;
  due_by: string | null;
  is_completed: boolean;
}

export default function CoachContentAssignments() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<AssignmentRow | null>(null);
  const [hideInactive, setHideInactive] = useState(true);
  const hasFetched = useRef(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_coach_assignment_progress");
      if (error) throw error;
      setRows((data ?? []) as AssignmentRow[]);
    } catch (e: unknown) {
      toast({ title: "Failed to load assignments", description: sanitizeErrorForUser(e), variant: "destructive" });
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    load();
  }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    // Rows-affected check: RLS denials return HTTP 200 with no rows + no error
    // (Block 8 audit, same pattern as PR #117 completeWorkout fix). Use
    // .select() to surface the silent-deny path before mutating local state.
    const { data: deleted, error } = await supabase
      .from("coach_content_assignments")
      .delete()
      .eq("id", deleteTarget.assignment_id)
      .select("id");
    if (error) {
      toast({ title: "Failed to delete", description: sanitizeErrorForUser(error), variant: "destructive" });
      return;
    }
    if (!deleted || deleted.length === 0) {
      toast({
        title: "Not deleted",
        description: "You may not have permission to remove this assignment. Refresh and try again.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Removed", description: "Assignment deleted." });
    setDeleteTarget(null);
    setRows((prev) => prev.filter((r) => r.assignment_id !== deleteTarget.assignment_id));
  };

  const filteredRows = hideInactive
    ? rows.filter((r) => !isLapsed(r.client_subscription_status))
    : rows;
  const hiddenCount = rows.length - filteredRows.length;

  const total = filteredRows.length;
  const completed = filteredRows.filter((r) => r.is_completed).length;
  const pending = total - completed;

  const now = Date.now();
  const isOverdue = (r: AssignmentRow) =>
    !r.is_completed && r.due_by && new Date(r.due_by).getTime() < now;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Navigation />
      <div className="container mx-auto px-4 py-24 max-w-7xl pb-24 md:pb-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
              <ClipboardCheck className="h-8 w-8 text-primary" /> Assigned Content
            </h1>
            <p className="text-muted-foreground text-lg">
              Videos and learning paths you've assigned to your clients.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="hide-inactive" checked={hideInactive} onCheckedChange={setHideInactive} />
            <Label htmlFor="hide-inactive" className="text-sm cursor-pointer">Hide lapsed clients</Label>
            {hiddenCount > 0 && (
              <Badge variant="outline" className="text-xs">{hiddenCount} hidden</Badge>
            )}
          </div>
        </div>

        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total assignments</CardDescription>
              <CardTitle className="text-2xl">{total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Completed</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" /> {completed}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Clock className="h-5 w-5" /> {pending}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Assignments</CardTitle>
            <CardDescription>Sorted by most recently assigned.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Loading...</p>
            ) : filteredRows.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {rows.length === 0
                  ? "No assignments yet. Visit /educational-videos and use “Assign to client” on a card."
                  : "All assignments are for lapsed clients. Toggle off “Hide lapsed clients” to view them."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((r) => {
                    const clientName = r.client_display_name || r.client_first_name || r.client_id.slice(0, 8);
                    const overdue = isOverdue(r);
                    const isVideo = !!r.video_id;
                    const contentTitle = isVideo ? r.video_title : r.playlist_title;
                    const status = r.client_subscription_status;
                    const lapsedRow = isLapsed(status);
                    return (
                      <TableRow key={r.assignment_id} className={lapsedRow ? "opacity-60" : undefined}>
                        <TableCell className="font-medium">{clientName}</TableCell>
                        <TableCell>
                          {status === "active" ? (
                            <Badge className="bg-emerald-600 text-white">Active</Badge>
                          ) : status === "past_due" ? (
                            <Badge className="bg-amber-500 text-white">Past due</Badge>
                          ) : status ? (
                            <Badge variant="outline" className="text-muted-foreground">{titleCase(status)}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">No sub</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {isVideo ? (
                            <span className="inline-flex items-center gap-2">
                              <VideoIcon className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{contentTitle ?? "(deleted)"}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              <ListOrdered className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{contentTitle ?? "(deleted)"}</span>
                              <Badge variant="outline" className="text-xs">Path</Badge>
                            </span>
                          )}
                          {r.note && (
                            <div className="text-xs text-muted-foreground mt-1">{r.note}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(r.assigned_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className={`text-sm ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                          {r.due_by ? (
                            <span className="flex items-center gap-1">
                              {overdue && <AlertTriangle className="h-3 w-3" />}
                              {new Date(r.due_by).toLocaleDateString()}
                            </span>
                          ) : "--"}
                        </TableCell>
                        <TableCell>
                          {r.is_completed ? (
                            <Badge className="bg-emerald-600 text-white">Completed</Badge>
                          ) : overdue ? (
                            <Badge variant="destructive">Overdue</Badge>
                          ) : (
                            <Badge variant="outline">Pending</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(r)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {hiddenCount > 0 && (
          <p className="text-xs text-muted-foreground mt-4">
            {hiddenCount} assignment{hiddenCount === 1 ? "" : "s"} hidden for lapsed clients. They reappear if the client reactivates.
          </p>
        )}

        <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove this assignment?</DialogTitle>
              <DialogDescription>
                The client will no longer see this in their &ldquo;From your coach&rdquo; section. Their watch progress is preserved.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete}>Remove</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
