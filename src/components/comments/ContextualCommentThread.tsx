// src/components/comments/ContextualCommentThread.tsx
// B6 — a short threaded note attached to a specific object (a logged session, a
// weekly check-in, or a nutrition adjustment), living where that object renders.
// Distinct from the flat coach<->client thread (CoachClientThread) and the
// staff-only care_team_messages channel.
//
// Collapsed: a "💬 N" chip (or "Add note" when empty + can comment) → expands an
// inline mini-thread (list + composer). Mobile uses a vaul Drawer per the app's
// useIsMobile() rule. Fetch is lazy (on first expand) behind a hasFetched guard,
// with a cheap count query on mount so the chip can show N without loading bodies.
// Plain overflow-y-auto scroll (NOT Radix ScrollArea inside a max-h chain).

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/errorLogging";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  MessageSquare,
  Loader2,
  Send,
  MoreVertical,
  Pencil,
  Trash2,
  Plus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

const MAX_COMMENT_LENGTH = 2000;

export type ContextualObjectType = "session" | "checkin" | "adjustment";

interface Comment {
  id: string;
  client_id: string;
  author_id: string;
  object_type: string;
  object_id: string;
  comment: string;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

interface AuthorProfile {
  id: string;
  first_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface ContextualCommentThreadProps {
  /** The client whose object this thread hangs off (RLS thread anchor). */
  clientUserId: string;
  objectType: ContextualObjectType;
  objectId: string;
  /** Whether the current viewer may post — gate on the surface's own permission. */
  canComment: boolean;
  className?: string;
}

export function ContextualCommentThread({
  clientUserId,
  objectType,
  objectId,
  canComment,
  className,
}: ContextualCommentThreadProps) {
  const isMobile = useIsMobile();
  const { user } = useAuthSession();
  const viewerId = user?.id ?? null;

  const [count, setCount] = useState<number | null>(null);
  const [open, setOpen] = useState(false); // desktop inline expand / mobile drawer
  const [comments, setComments] = useState<Comment[]>([]);
  const [authors, setAuthors] = useState<Record<string, AuthorProfile>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const hasFetched = useRef<string | null>(null);

  const activeComments = comments.filter((c) => c.deleted_at === null);
  // Before the full thread loads, trust the mount-time count; after, the loaded
  // rows are authoritative (they reflect optimistic insert / soft-delete).
  const displayCount =
    hasFetched.current === objectId ? activeComments.length : count ?? 0;

  // Cheap count on mount so the collapsed chip shows N without loading bodies.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("contextual_comments")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientUserId)
      .eq("object_type", objectType)
      .eq("object_id", objectId)
      .is("deleted_at", null)
      .then(({ count: c, error: countErr }) => {
        if (cancelled) return;
        if (countErr) {
          // Non-fatal — the chip just falls back to 0; expanding still works.
          console.warn("[ContextualCommentThread] count:", countErr.message);
          return;
        }
        setCount(c ?? 0);
      });
    return () => {
      cancelled = true;
    };
  }, [clientUserId, objectType, objectId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchErr } = await supabase
      .from("contextual_comments")
      .select("*")
      .eq("client_id", clientUserId)
      .eq("object_type", objectType)
      .eq("object_id", objectId)
      .order("created_at", { ascending: true });

    if (fetchErr) {
      captureException(fetchErr, { source: "contextual_comments_load" });
      setError(fetchErr.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as Comment[];
    setComments(rows);

    const distinct = Array.from(new Set(rows.map((r) => r.author_id)));
    if (distinct.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles_public")
        .select("id, first_name, display_name, avatar_url")
        .in("id", distinct);
      const map: Record<string, AuthorProfile> = {};
      for (const p of profiles ?? []) map[p.id] = p;
      setAuthors(map);
    }

    setLoading(false);
  }, [clientUserId, objectType, objectId]);

  // Lazy fetch on first expand; the ref is keyed on objectId so a reused
  // component instance (e.g. paging between sessions) refetches for a new object.
  useEffect(() => {
    if (!open) return;
    if (hasFetched.current === objectId) return;
    hasFetched.current = objectId;
    load().catch((err) => {
      captureException(err, { source: "contextual_comments_load_unexpected" });
      setLoading(false);
    });
  }, [open, objectId, load]);

  const handleSend = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || sending || !viewerId) return;
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      setError(`Note too long (${trimmed.length}/${MAX_COMMENT_LENGTH})`);
      return;
    }

    setSending(true);
    setError(null);

    const { data, error: insertErr } = await supabase
      .from("contextual_comments")
      .insert({
        client_id: clientUserId,
        author_id: viewerId,
        object_type: objectType,
        object_id: objectId,
        comment: trimmed,
      })
      .select("*")
      .single();

    if (insertErr || !data) {
      captureException(insertErr, { source: "contextual_comments_insert" });
      setError(insertErr?.message ?? "Couldn't post note");
      setSending(false);
      return;
    }

    setComments((prev) => [...prev, data as Comment]);
    // Ensure the viewer's own profile is available for the just-added row.
    setAuthors((prev) =>
      prev[viewerId]
        ? prev
        : {
            ...prev,
            [viewerId]: {
              id: viewerId,
              first_name: null,
              display_name: null,
              avatar_url: null,
            },
          },
    );
    setDraft("");
    setSending(false);
  }, [draft, sending, viewerId, clientUserId, objectType, objectId]);

  const handleSaveEdit = useCallback(
    async (id: string, next: string) => {
      const trimmed = next.trim();
      if (!trimmed) return;
      if (trimmed.length > MAX_COMMENT_LENGTH) {
        setError(`Note too long (${trimmed.length}/${MAX_COMMENT_LENGTH})`);
        return;
      }
      const prev = comments.find((c) => c.id === id);
      if (!prev || prev.comment === trimmed) {
        setEditingId(null);
        return;
      }

      const nowIso = new Date().toISOString();
      setComments((all) =>
        all.map((c) => (c.id === id ? { ...c, comment: trimmed, edited_at: nowIso } : c)),
      );
      setEditingId(null);

      const { error: updErr } = await supabase
        .from("contextual_comments")
        .update({ comment: trimmed, edited_at: nowIso })
        .eq("id", id);

      if (updErr) {
        captureException(updErr, { source: "contextual_comments_edit" });
        setError(updErr.message);
        setComments((all) =>
          all.map((c) =>
            c.id === id ? { ...c, comment: prev.comment, edited_at: prev.edited_at } : c,
          ),
        );
      }
    },
    [comments],
  );

  const handleDelete = useCallback(async (id: string) => {
    const confirmed = window.confirm(
      "Delete this note? It will show as '[comment deleted]' to everyone who can see it.",
    );
    if (!confirmed) return;

    const nowIso = new Date().toISOString();
    setComments((all) => all.map((c) => (c.id === id ? { ...c, deleted_at: nowIso } : c)));

    const { error: updErr } = await supabase
      .from("contextual_comments")
      .update({ deleted_at: nowIso })
      .eq("id", id);

    if (updErr) {
      captureException(updErr, { source: "contextual_comments_delete" });
      setError(updErr.message);
      setComments((all) => all.map((c) => (c.id === id ? { ...c, deleted_at: null } : c)));
    }
  }, []);

  // Nothing to show and nothing the viewer can do → render nothing at all.
  if (displayCount === 0 && !canComment) return null;

  const list = (
    <div className="space-y-3">
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No notes yet.</p>
      ) : (
        comments.map((c) => (
          <CommentRow
            key={c.id}
            comment={c}
            author={authors[c.author_id]}
            isOwn={c.author_id === viewerId}
            isEditing={editingId === c.id}
            onEditStart={() => setEditingId(c.id)}
            onEditCancel={() => setEditingId(null)}
            onEditSave={(next) => handleSaveEdit(c.id, next)}
            onDelete={() => handleDelete(c.id)}
          />
        ))
      )}
    </div>
  );

  const composer = canComment ? (
    <div className="flex items-end gap-2">
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            handleSend();
          }
        }}
        disabled={sending || !viewerId}
        placeholder="Add a note... (Cmd/Ctrl + Enter)"
        rows={2}
        maxLength={MAX_COMMENT_LENGTH}
        className="flex-1 min-h-[52px] max-h-[160px] resize-none text-sm"
        aria-label="Add a note"
      />
      <Button
        onClick={handleSend}
        disabled={!draft.trim() || sending || !viewerId}
        size="sm"
        className="shrink-0"
      >
        {sending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="h-4 w-4" aria-hidden="true" />
        )}
      </Button>
    </div>
  ) : null;

  const chip = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/50 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors touch-manipulation min-h-[32px]",
        open && "bg-muted/60 text-foreground",
      )}
      aria-expanded={open}
      aria-label={displayCount > 0 ? `${displayCount} notes` : "Add note"}
    >
      {displayCount > 0 ? (
        <>
          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="tabular-nums">{displayCount}</span>
        </>
      ) : (
        <>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add note
        </>
      )}
    </button>
  );

  // Mobile: chip opens a vaul Drawer holding the thread.
  if (isMobile) {
    return (
      <div className={className}>
        {chip}
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="max-h-[92vh] flex flex-col">
            <DrawerHeader className="text-left">
              <DrawerTitle>Notes</DrawerTitle>
            </DrawerHeader>
            <div className="flex-1 overflow-y-auto px-4 pb-2">{list}</div>
            {composer && (
              <DrawerFooter className="pb-[env(safe-area-inset-bottom)]">
                {composer}
                <DrawerClose asChild>
                  <Button variant="outline" className="w-full">
                    Done
                  </Button>
                </DrawerClose>
              </DrawerFooter>
            )}
          </DrawerContent>
        </Drawer>
      </div>
    );
  }

  // Desktop: chip toggles an inline panel.
  return (
    <div className={className}>
      {chip}
      {open && (
        <div className="mt-2 rounded-lg border border-border/60 bg-card/40 p-3 space-y-3">
          <div className="max-h-[40vh] overflow-y-auto">{list}</div>
          {composer}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface CommentRowProps {
  comment: Comment;
  author: AuthorProfile | undefined;
  isOwn: boolean;
  isEditing: boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
  onEditSave: (next: string) => void;
  onDelete: () => void;
}

function CommentRow({
  comment,
  author,
  isOwn,
  isEditing,
  onEditStart,
  onEditCancel,
  onEditSave,
  onDelete,
}: CommentRowProps) {
  const name = isOwn ? "You" : author?.display_name || author?.first_name || "Someone";
  const initials = (author?.first_name || author?.display_name || "?").slice(0, 2).toUpperCase();
  const when = format(new Date(comment.created_at), "MMM d, h:mm a");
  const isDeleted = comment.deleted_at !== null;
  const canActOnOwn = isOwn && !isDeleted;

  return (
    <div className="group flex gap-2.5">
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarImage src={author?.avatar_url ?? undefined} alt={name} />
        <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-mono text-[11px] text-muted-foreground tabular-nums flex items-center gap-1.5">
          <span>
            {name} <span className="opacity-60">· {when}</span>
            {comment.edited_at && !isDeleted && <span className="opacity-60"> · edited</span>}
          </span>
          {canActOnOwn && !isEditing && (
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Note actions"
                    className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-muted text-muted-foreground touch-manipulation"
                  >
                    <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[130px]">
                  <DropdownMenuItem onClick={onEditStart}>
                    <Pencil className="h-3.5 w-3.5 mr-2" aria-hidden="true" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" aria-hidden="true" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          )}
        </p>
        {isEditing ? (
          <EditBox initial={comment.comment} onSave={onEditSave} onCancel={onEditCancel} />
        ) : (
          <p
            className={cn(
              "text-sm whitespace-pre-wrap break-words",
              isDeleted ? "text-muted-foreground italic" : "text-foreground",
            )}
          >
            {isDeleted ? "[comment deleted]" : comment.comment}
          </p>
        )}
      </div>
    </div>
  );
}

function EditBox({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (next: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const isDirty = value.trim().length > 0 && value !== initial;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (isDirty) onSave(value);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        autoFocus
        rows={2}
        maxLength={MAX_COMMENT_LENGTH}
        className="text-sm resize-none"
        aria-label="Edit note"
      />
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => onSave(value)} disabled={!isDirty}>
          Save
        </Button>
      </div>
    </div>
  );
}
