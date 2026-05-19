import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Plus, GripVertical, Trash2, Video, ListOrdered, BookOpen } from "lucide-react";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { LinkContentDialog, type LinkTarget } from "./LinkContentDialog";

interface LinkedContentListProps {
  target: LinkTarget | null;
  readOnly?: boolean;
  emptyMessage?: string;
}

interface LinkRow {
  id: string;
  video_id: string | null;
  playlist_id: string | null;
  is_required: boolean;
  sort_order: number;
  note: string | null;
}

interface ResolvedRow extends LinkRow {
  resolvedTitle: string;
  resolvedKind: "video" | "playlist";
  resolvedCategory: string | null;
}

async function fetchLinks(target: LinkTarget): Promise<LinkRow[]> {
  if (target.kind === "program-template") {
    const { data, error } = await supabase
      .from("program_template_content_links")
      .select("id, video_id, playlist_id, is_required, sort_order, note")
      .eq("program_template_id", target.id)
      .order("sort_order");
    if (error) throw error;
    return (data ?? []) as LinkRow[];
  }
  const { data, error } = await supabase
    .from("nutrition_phase_content_links")
    .select("id, video_id, playlist_id, is_required, sort_order, note")
    .eq("nutrition_phase_id", target.id)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as LinkRow[];
}

async function deleteLink(target: LinkTarget, id: string): Promise<void> {
  if (target.kind === "program-template") {
    const { error } = await supabase
      .from("program_template_content_links")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("nutrition_phase_content_links")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

async function updateSortOrder(target: LinkTarget, id: string, sortOrder: number): Promise<void> {
  if (target.kind === "program-template") {
    const { error } = await supabase
      .from("program_template_content_links")
      .update({ sort_order: sortOrder })
      .eq("id", id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("nutrition_phase_content_links")
    .update({ sort_order: sortOrder })
    .eq("id", id);
  if (error) throw error;
}

export function LinkedContentList({
  target,
  readOnly = false,
  emptyMessage,
}: LinkedContentListProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<ResolvedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ResolvedRow | null>(null);
  const hasFetched = useRef(false);
  const lastTargetId = useRef<string | null>(null);

  const loadRows = useCallback(async () => {
    if (!target) return;
    setLoading(true);
    try {
      const links = await fetchLinks(target);
      const videoIds = links.map((r) => r.video_id).filter((x): x is string => !!x);
      const playlistIds = links.map((r) => r.playlist_id).filter((x): x is string => !!x);

      const [videosRes, playlistsRes] = await Promise.all([
        videoIds.length > 0
          ? supabase
              .from("educational_videos")
              .select("id, title, category")
              .in("id", videoIds)
          : Promise.resolve({ data: [] as { id: string; title: string; category: string | null }[], error: null }),
        playlistIds.length > 0
          ? supabase.from("video_playlists").select("id, title").in("id", playlistIds)
          : Promise.resolve({ data: [] as { id: string; title: string }[], error: null }),
      ]);

      if (videosRes.error) throw videosRes.error;
      if (playlistsRes.error) throw playlistsRes.error;

      const videoMap = new Map((videosRes.data ?? []).map((v) => [v.id, v]));
      const playlistMap = new Map((playlistsRes.data ?? []).map((p) => [p.id, p]));

      const resolved: ResolvedRow[] = links.map((r) => {
        if (r.video_id) {
          const v = videoMap.get(r.video_id);
          return {
            ...r,
            resolvedKind: "video" as const,
            resolvedTitle: v?.title ?? "(deleted video)",
            resolvedCategory: v?.category ?? null,
          };
        }
        const p = r.playlist_id ? playlistMap.get(r.playlist_id) : undefined;
        return {
          ...r,
          resolvedKind: "playlist" as const,
          resolvedTitle: p?.title ?? "(deleted learning path)",
          resolvedCategory: null,
        };
      });
      setRows(resolved);
    } catch (error: unknown) {
      toast({
        title: "Failed to load recommended content",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [target, toast]);

  useEffect(() => {
    if (!target) {
      setRows([]);
      setLoading(false);
      hasFetched.current = false;
      lastTargetId.current = null;
      return;
    }
    if (lastTargetId.current !== target.id) {
      lastTargetId.current = target.id;
      hasFetched.current = false;
    }
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadRows();
  }, [target, loadRows]);

  const handleDragEnd = async (result: DropResult) => {
    if (!target || readOnly) return;
    if (!result.destination || result.destination.index === result.source.index) return;
    const reordered = Array.from(rows);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    const updates = reordered.map((r, idx) => ({ id: r.id, sort_order: idx }));
    setRows(reordered.map((r, idx) => ({ ...r, sort_order: idx })));
    try {
      await Promise.all(updates.map((u) => updateSortOrder(target, u.id, u.sort_order)));
    } catch (error: unknown) {
      toast({
        title: "Failed to reorder",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
      hasFetched.current = false;
      loadRows();
    }
  };

  const confirmDelete = async () => {
    if (!target || !pendingDelete) return;
    const row = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteLink(target, row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      toast({ title: "Removed", description: `Removed "${row.resolvedTitle}".` });
    } catch (error: unknown) {
      toast({
        title: "Failed to remove",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  if (!target) return null;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Recommended content</h3>
            <Badge variant="secondary">{rows.length}</Badge>
          </div>
          {!readOnly && (
            <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Add video or playlist
            </Button>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {emptyMessage ?? "No content linked yet."}
          </p>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="linked-content">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                  {rows.map((row, index) => (
                    <Draggable
                      key={row.id}
                      draggableId={row.id}
                      index={index}
                      isDragDisabled={readOnly}
                    >
                      {(dragProvided, snapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          className={`flex items-start gap-2 p-3 rounded-md border bg-card ${
                            snapshot.isDragging ? "shadow-lg" : ""
                          }`}
                        >
                          {!readOnly && (
                            <div
                              {...dragProvided.dragHandleProps}
                              className="mt-1 text-muted-foreground cursor-grab active:cursor-grabbing"
                              aria-label="Reorder"
                            >
                              <GripVertical className="h-4 w-4" />
                            </div>
                          )}
                          {row.resolvedKind === "video" ? (
                            <Video className="h-4 w-4 mt-1 text-primary" />
                          ) : (
                            <ListOrdered className="h-4 w-4 mt-1 text-primary" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{row.resolvedTitle}</span>
                              {row.is_required && (
                                <Badge variant="default" className="text-xs">
                                  Required
                                </Badge>
                              )}
                              {row.resolvedCategory && (
                                <Badge variant="outline" className="text-xs">
                                  {row.resolvedCategory}
                                </Badge>
                              )}
                            </div>
                            {row.note && (
                              <p className="text-xs text-muted-foreground mt-1">{row.note}</p>
                            )}
                          </div>
                          {!readOnly && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive shrink-0"
                              onClick={() => setPendingDelete(row)}
                              aria-label="Remove"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </CardContent>

      <LinkContentDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        target={target}
        onLinkAdded={() => {
          hasFetched.current = false;
          loadRows();
        }}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from recommended content?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{pendingDelete?.resolvedTitle}&rdquo; will no longer appear here. You can
              re-add it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
