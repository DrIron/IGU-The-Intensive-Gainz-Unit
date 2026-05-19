import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuthSession } from "@/hooks/useAuthSession";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Video, ListOrdered } from "lucide-react";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

export type LinkTarget =
  | { kind: "program-template"; id: string; title: string }
  | { kind: "nutrition-phase"; id: string; title: string };

interface LinkContentDialogProps {
  open: boolean;
  onClose: () => void;
  target: LinkTarget | null;
  onLinkAdded?: () => void;
}

interface VideoOption {
  id: string;
  title: string;
  category: string | null;
  video_type: string | null;
}

interface PlaylistOption {
  id: string;
  title: string;
}

const TABLE_BY_KIND = {
  "program-template": "program_template_content_links",
  "nutrition-phase": "nutrition_phase_content_links",
} as const;

const FK_BY_KIND = {
  "program-template": "program_template_id",
  "nutrition-phase": "nutrition_phase_id",
} as const;

export function LinkContentDialog({ open, onClose, target, onLinkAdded }: LinkContentDialogProps) {
  const { toast } = useToast();
  const { user } = useAuthSession();

  const [videos, setVideos] = useState<VideoOption[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistOption[]>([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);

  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"videos" | "playlists">("videos");
  const [isRequired, setIsRequired] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const lastTargetId = useRef<string | null>(null);

  const loadOptions = useCallback(async () => {
    setOptionsLoading(true);
    const [videosRes, playlistsRes] = await Promise.all([
      supabase
        .from("educational_videos")
        .select("id, title, category, video_type, is_active")
        .eq("is_active", true)
        .order("title"),
      supabase
        .from("video_playlists")
        .select("id, title, is_active")
        .eq("is_active", true)
        .order("title"),
    ]);
    if (videosRes.error) {
      toast({
        title: "Failed to load videos",
        description: sanitizeErrorForUser(videosRes.error),
        variant: "destructive",
      });
    } else {
      setVideos((videosRes.data ?? []) as VideoOption[]);
    }
    if (playlistsRes.error) {
      toast({
        title: "Failed to load learning paths",
        description: sanitizeErrorForUser(playlistsRes.error),
        variant: "destructive",
      });
    } else {
      setPlaylists((playlistsRes.data ?? []) as PlaylistOption[]);
    }
    setOptionsLoaded(true);
    setOptionsLoading(false);
  }, [toast]);

  useEffect(() => {
    if (!open) {
      setSelectedVideoIds(new Set());
      setSelectedPlaylistIds(new Set());
      setSearch("");
      setIsRequired(false);
      setNote("");
      setTab("videos");
      return;
    }
    if (!target) return;
    if (lastTargetId.current !== target.id) {
      lastTargetId.current = target.id;
      setOptionsLoaded(false);
    }
    if (!optionsLoaded && !optionsLoading) {
      loadOptions();
    }
  }, [open, target, optionsLoaded, optionsLoading, loadOptions]);

  const toggleVideo = (id: string) => {
    setSelectedVideoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePlaylist = (id: string) => {
    setSelectedPlaylistIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredVideos = videos.filter((v) =>
    !search.trim() ? true : v.title.toLowerCase().includes(search.trim().toLowerCase())
  );
  const filteredPlaylists = playlists.filter((p) =>
    !search.trim() ? true : p.title.toLowerCase().includes(search.trim().toLowerCase())
  );

  const totalSelected = selectedVideoIds.size + selectedPlaylistIds.size;

  const submit = async () => {
    if (!target || !user?.id) return;
    if (totalSelected === 0) {
      toast({ title: "Pick at least one video or learning path", variant: "destructive" });
      return;
    }
    setSubmitting(true);

    const table = TABLE_BY_KIND[target.kind];
    const fkCol = FK_BY_KIND[target.kind];
    const trimmedNote = note.trim() || null;

    const videoRows = Array.from(selectedVideoIds).map((vid, i) => ({
      [fkCol]: target.id,
      video_id: vid,
      playlist_id: null,
      sort_order: i,
      is_required: isRequired,
      note: trimmedNote,
      added_by: user.id,
    }));
    const playlistRows = Array.from(selectedPlaylistIds).map((pid, i) => ({
      [fkCol]: target.id,
      video_id: null,
      playlist_id: pid,
      sort_order: i + selectedVideoIds.size,
      is_required: isRequired,
      note: trimmedNote,
      added_by: user.id,
    }));

    let insertedCount = 0;
    let attempted = 0;

    if (videoRows.length > 0) {
      attempted += videoRows.length;
      const { data, error } = await supabase
        .from(table)
        .upsert(videoRows, { onConflict: `${fkCol},video_id`, ignoreDuplicates: true })
        .select("id");
      if (error) {
        setSubmitting(false);
        toast({
          title: "Failed to link videos",
          description: sanitizeErrorForUser(error),
          variant: "destructive",
        });
        return;
      }
      insertedCount += (data ?? []).length;
    }

    if (playlistRows.length > 0) {
      attempted += playlistRows.length;
      const { data, error } = await supabase
        .from(table)
        .upsert(playlistRows, { onConflict: `${fkCol},playlist_id`, ignoreDuplicates: true })
        .select("id");
      if (error) {
        setSubmitting(false);
        toast({
          title: "Failed to link learning paths",
          description: sanitizeErrorForUser(error),
          variant: "destructive",
        });
        return;
      }
      insertedCount += (data ?? []).length;
    }

    setSubmitting(false);
    const skipped = attempted - insertedCount;
    const skippedSuffix = skipped > 0 ? ` -- ${skipped} already linked` : "";
    toast({
      title: "Linked",
      description: `Linked ${insertedCount} item${insertedCount === 1 ? "" : "s"} to "${target.title}"${skippedSuffix}.`,
    });
    onLinkAdded?.();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Link content to &ldquo;{target?.title ?? ""}&rdquo;</DialogTitle>
          <DialogDescription>
            Pick videos and learning paths to recommend. Clients with this{" "}
            {target?.kind === "program-template" ? "program" : "nutrition phase"} will see them
            inline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "videos" | "playlists")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="videos" className="gap-2">
                <Video className="h-4 w-4" />
                Videos ({selectedVideoIds.size})
              </TabsTrigger>
              <TabsTrigger value="playlists" className="gap-2">
                <ListOrdered className="h-4 w-4" />
                Learning paths ({selectedPlaylistIds.size})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="videos" className="mt-3">
              <div className="max-h-64 overflow-y-auto space-y-1 border rounded-md p-2">
                {optionsLoading ? (
                  <p className="text-sm text-muted-foreground p-2">Loading videos...</p>
                ) : filteredVideos.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-2">
                    {videos.length === 0 ? "No active videos." : "No videos match your search."}
                  </p>
                ) : (
                  filteredVideos.map((v) => (
                    <label
                      key={v.id}
                      className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedVideoIds.has(v.id)}
                        onCheckedChange={() => toggleVideo(v.id)}
                      />
                      <span className="text-sm flex-1">{v.title}</span>
                      {v.category && (
                        <Badge variant="outline" className="text-xs">
                          {v.category}
                        </Badge>
                      )}
                    </label>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="playlists" className="mt-3">
              <div className="max-h-64 overflow-y-auto space-y-1 border rounded-md p-2">
                {optionsLoading ? (
                  <p className="text-sm text-muted-foreground p-2">Loading learning paths...</p>
                ) : filteredPlaylists.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-2">
                    {playlists.length === 0
                      ? "No active learning paths."
                      : "No learning paths match your search."}
                  </p>
                ) : (
                  filteredPlaylists.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedPlaylistIds.has(p.id)}
                        onCheckedChange={() => togglePlaylist(p.id)}
                      />
                      <span className="text-sm flex-1">{p.title}</span>
                    </label>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="is-required" className="text-sm">
                Mark as required
              </Label>
              <p className="text-xs text-muted-foreground">
                Required items appear in a dedicated section and trigger an alert.
              </p>
            </div>
            <Switch id="is-required" checked={isRequired} onCheckedChange={setIsRequired} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="note">Note (optional)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 200))}
              rows={2}
              placeholder="Why this matters for them..."
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground text-right">{note.length}/200</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || totalSelected === 0}>
            {submitting
              ? "Linking..."
              : `Link ${totalSelected} item${totalSelected === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
