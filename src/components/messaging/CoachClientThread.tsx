import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Send,
  MessageSquare,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const MAX_MESSAGE_LENGTH = 4000;

interface Message {
  id: string;
  client_id: string;
  sender_id: string;
  message: string;
  read_by: string[];
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

interface SenderProfile {
  id: string;
  first_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface CoachClientThreadProps {
  clientUserId: string;
  viewerUserId: string;
  viewerIsClient?: boolean;
  className?: string;
}

/**
 * Shared thread view for the coach<->client messaging surface.
 *
 * Desktop: inline composer at the bottom of the card.
 * Mobile (`useIsMobile()`): composer collapses to a button that opens a
 * vaul Drawer with a bigger textarea and safe-area-aware send button,
 * matching the convention used by MobileDayDetail / ExercisePickerDialog.
 *
 * Own messages show a kebab menu with Edit / Delete actions:
 *   - Edit -> inline textarea replaces the bubble; Save issues an
 *     UPDATE (RLS: sender-only) and stamps edited_at.
 *   - Delete -> confirm via window.confirm, then UPDATE sets deleted_at.
 *     The row stays rendered as a muted "[message deleted]" placeholder
 *     so the conversation doesn't develop holes.
 */
export function CoachClientThread({
  clientUserId,
  viewerUserId,
  viewerIsClient: _viewerIsClient,
  className,
}: CoachClientThreadProps) {
  const isMobile = useIsMobile();
  const [messages, setMessages] = useState<Message[]>([]);
  const [senders, setSenders] = useState<Record<string, SenderProfile>>({});
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async (threadKey: string) => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("coach_client_messages")
      .select("*")
      .eq("client_id", threadKey)
      .order("created_at", { ascending: true });

    if (fetchError) {
      console.error("[CoachClientThread] load:", fetchError.message);
      setError(fetchError.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as Message[];
    setMessages(rows);

    const distinctIds = Array.from(new Set(rows.map((r) => r.sender_id)));
    if (distinctIds.length > 0) {
      const { data: profiles, error: profilesErr } = await supabase
        .from("profiles_public")
        .select("id, first_name, display_name, avatar_url")
        .in("id", distinctIds);
      if (profilesErr) {
        console.warn("[CoachClientThread] profiles:", profilesErr.message);
      }
      const map: Record<string, SenderProfile> = {};
      for (const p of profiles ?? []) map[p.id] = p;
      setSenders(map);
    }

    supabase
      .rpc("mark_coach_client_thread_read", { p_client_id: threadKey })
      .then(({ error: readErr }) => {
        if (readErr) {
          console.warn("[CoachClientThread] mark read:", readErr.message);
        }
      });

    setLoading(false);
  }, []);

  useEffect(() => {
    if (hasFetched.current === clientUserId) return;
    hasFetched.current = clientUserId;
    load(clientUserId).catch((err) => {
      console.error("[CoachClientThread] unexpected:", err);
      setLoading(false);
    });
  }, [clientUserId, load]);

  // Realtime: apply INSERT / UPDATE events for this thread as they land.
  // Sender avatars are resolved lazily -- when an unknown sender_id shows
  // up we fire a one-off profiles_public lookup so the row renders with
  // a name instead of "Someone".
  useEffect(() => {
    if (!clientUserId) return;

    const channel = supabase
      .channel(`ccm-thread:${clientUserId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "INSERT",
          schema: "public",
          table: "coach_client_messages",
          filter: `client_id=eq.${clientUserId}`,
        },
        (payload: { new: Message }) => {
          const incoming = payload.new;
          setMessages((prev) =>
            prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming],
          );
          setSenders((prev) => {
            if (prev[incoming.sender_id]) return prev;
            supabase
              .from("profiles_public")
              .select("id, first_name, display_name, avatar_url")
              .eq("id", incoming.sender_id)
              .maybeSingle()
              .then(({ data }) => {
                if (!data) return;
                setSenders((s) => ({ ...s, [data.id]: data }));
              });
            return prev;
          });
        },
      )
      .on(
        "postgres_changes" as never,
        {
          event: "UPDATE",
          schema: "public",
          table: "coach_client_messages",
          filter: `client_id=eq.${clientUserId}`,
        },
        (payload: { new: Message }) => {
          const updated = payload.new;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientUserId]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      setError(`Message too long (${trimmed.length}/${MAX_MESSAGE_LENGTH})`);
      return;
    }

    setSending(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from("coach_client_messages")
      .insert({
        client_id: clientUserId,
        sender_id: viewerUserId,
        message: trimmed,
      })
      .select("*")
      .single();

    if (insertError || !data) {
      console.error("[CoachClientThread] insert:", insertError?.message);
      setError(insertError?.message ?? "Send failed");
      setSending(false);
      return;
    }

    setMessages((prev) => [...prev, data as Message]);
    setDraft("");
    setSending(false);
    setMobileOpen(false);

    supabase.functions
      .invoke("send-coach-client-message-email", {
        body: { message_id: data.id },
      })
      .catch((err) => {
        console.warn("[CoachClientThread] email notify:", err?.message ?? err);
      });
  }, [draft, sending, clientUserId, viewerUserId]);

  const handleSaveEdit = useCallback(
    async (id: string, nextBody: string) => {
      const trimmed = nextBody.trim();
      if (!trimmed) return;
      if (trimmed.length > MAX_MESSAGE_LENGTH) {
        setError(`Message too long (${trimmed.length}/${MAX_MESSAGE_LENGTH})`);
        return;
      }

      const prev = messages.find((m) => m.id === id);
      if (!prev || prev.message === trimmed) {
        setEditingId(null);
        return;
      }

      const nowIso = new Date().toISOString();
      setMessages((all) =>
        all.map((m) => (m.id === id ? { ...m, message: trimmed, edited_at: nowIso } : m)),
      );
      setEditingId(null);

      const { error: updateError } = await supabase
        .from("coach_client_messages")
        .update({ message: trimmed, edited_at: nowIso })
        .eq("id", id);

      if (updateError) {
        console.error("[CoachClientThread] edit:", updateError.message);
        setError(updateError.message);
        // Roll back optimistic edit.
        setMessages((all) =>
          all.map((m) => (m.id === id ? { ...m, message: prev.message, edited_at: prev.edited_at } : m)),
        );
      }
    },
    [messages],
  );

  const handleDelete = useCallback(async (id: string) => {
    const confirmed = window.confirm("Delete this message? It will show as '[message deleted]' to everyone in the thread.");
    if (!confirmed) return;

    const nowIso = new Date().toISOString();
    setMessages((all) =>
      all.map((m) => (m.id === id ? { ...m, deleted_at: nowIso } : m)),
    );

    const { error: updateError } = await supabase
      .from("coach_client_messages")
      .update({ deleted_at: nowIso })
      .eq("id", id);

    if (updateError) {
      console.error("[CoachClientThread] delete:", updateError.message);
      setError(updateError.message);
      setMessages((all) =>
        all.map((m) => (m.id === id ? { ...m, deleted_at: null } : m)),
      );
    }
  }, []);

  const grouped = useMemo(() => groupByDay(messages), [messages]);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-0 flex flex-col">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 min-h-[320px] max-h-[60vh]"
        >
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2
                className="h-5 w-5 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          ) : messages.length === 0 ? (
            <EmptyThread />
          ) : (
            grouped.map((group) => (
              <div key={group.key} className="space-y-3">
                <DayDivider label={group.label} />
                {group.items.map((m) => (
                  <MessageRow
                    key={m.id}
                    message={m}
                    sender={senders[m.sender_id]}
                    isOwn={m.sender_id === viewerUserId}
                    isEditing={editingId === m.id}
                    onEditStart={() => setEditingId(m.id)}
                    onEditCancel={() => setEditingId(null)}
                    onEditSave={(next) => handleSaveEdit(m.id, next)}
                    onDelete={() => handleDelete(m.id)}
                  />
                ))}
              </div>
            ))
          )}
        </div>

        {isMobile ? (
          <Drawer open={mobileOpen} onOpenChange={setMobileOpen}>
            <DrawerTrigger asChild>
              <button
                type="button"
                className="border-t w-full text-left px-4 py-3 text-sm text-muted-foreground bg-card hover:bg-muted/50 transition-colors touch-manipulation active:scale-[0.995] flex items-center justify-between min-h-[56px]"
              >
                Write a message...
                <Send className="h-4 w-4" aria-hidden="true" />
              </button>
            </DrawerTrigger>
            <DrawerContent className="max-h-[92vh] flex flex-col">
              <DrawerHeader className="text-left">
                <DrawerTitle>Write a message</DrawerTitle>
              </DrawerHeader>
              <div className="flex-1 overflow-y-auto px-4">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type your message..."
                  rows={8}
                  maxLength={MAX_MESSAGE_LENGTH}
                  className="w-full resize-none h-10 min-h-[160px] text-base"
                  aria-label="Message composer"
                  autoFocus
                />
              </div>
              <DrawerFooter className="pb-[env(safe-area-inset-bottom)] flex-row gap-2">
                <DrawerClose asChild>
                  <Button variant="outline" className="flex-1">
                    Cancel
                  </Button>
                </DrawerClose>
                <Button
                  onClick={handleSend}
                  disabled={!draft.trim() || sending}
                  className="flex-1"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-1" aria-hidden="true" />
                      Send
                    </>
                  )}
                </Button>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        ) : (
          <div className="border-t p-3 md:p-4 flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={sending}
              placeholder="Write a message... (Cmd/Ctrl + Enter to send)"
              rows={2}
              maxLength={MAX_MESSAGE_LENGTH}
              className="flex-1 min-h-[60px] max-h-[200px] resize-none text-sm"
              aria-label="Message composer"
            />
            <Button
              onClick={handleSend}
              disabled={!draft.trim() || sending}
              size="sm"
              className="shrink-0"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <>
                  <Send className="h-4 w-4 mr-1" aria-hidden="true" />
                  Send
                </>
              )}
            </Button>
          </div>
        )}

        {error && (
          <div className="border-t bg-destructive/10 px-4 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface DayGroup {
  key: string;
  label: string;
  items: Message[];
}

function groupByDay(messages: Message[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const m of messages) {
    const dt = new Date(m.created_at);
    const last = groups[groups.length - 1];
    if (last && isSameDay(new Date(last.items[last.items.length - 1].created_at), dt)) {
      last.items.push(m);
    } else {
      groups.push({
        key: dt.toISOString().slice(0, 10),
        label: dayLabel(dt),
        items: [m],
      });
    }
  }
  return groups;
}

function dayLabel(d: Date): string {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, MMM d");
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
      {label}
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  );
}

interface MessageRowProps {
  message: Message;
  sender: SenderProfile | undefined;
  isOwn: boolean;
  isEditing: boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
  onEditSave: (next: string) => void;
  onDelete: () => void;
}

function MessageRow({
  message,
  sender,
  isOwn,
  isEditing,
  onEditStart,
  onEditCancel,
  onEditSave,
  onDelete,
}: MessageRowProps) {
  const name = isOwn
    ? "You"
    : sender?.display_name || sender?.first_name || "Someone";
  const initials =
    (sender?.first_name || sender?.display_name || "?")
      .slice(0, 2)
      .toUpperCase();
  const when = format(new Date(message.created_at), "h:mm a");
  const isDeleted = message.deleted_at !== null;
  const canActOnOwn = isOwn && !isDeleted;

  return (
    <div
      className={cn(
        "group flex gap-3",
        isOwn ? "flex-row-reverse text-right" : "flex-row",
      )}
    >
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={sender?.avatar_url ?? undefined} alt={name} />
        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className={cn("min-w-0 max-w-[75%] space-y-1", isOwn && "items-end")}>
        <p className="font-mono text-[11px] text-muted-foreground tabular-nums flex items-center gap-1.5 justify-start">
          <span className={cn(isOwn && "order-2")}>
            {name} <span className="opacity-60">· {when}</span>
            {message.edited_at && !isDeleted && (
              <>
                {" "}
                <span className="opacity-60">·</span>{" "}
                <EditHistoryTrigger messageId={message.id} />
              </>
            )}
          </span>
          {canActOnOwn && !isEditing && (
            <span className={cn("opacity-0 group-hover:opacity-100 transition-opacity", isOwn && "order-1")}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Message actions"
                    className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-muted text-muted-foreground touch-manipulation"
                  >
                    <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={isOwn ? "start" : "end"} className="min-w-[140px]">
                  <DropdownMenuItem onClick={onEditStart}>
                    <Pencil className="h-3.5 w-3.5 mr-2" aria-hidden="true" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                    <Trash2 className="h-3.5 w-3.5 mr-2" aria-hidden="true" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          )}
        </p>
        {isEditing ? (
          <EditBubble
            initial={message.message}
            onSave={onEditSave}
            onCancel={onEditCancel}
          />
        ) : (
          <div
            className={cn(
              "inline-block rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words text-left",
              isDeleted
                ? "bg-muted text-muted-foreground italic"
                : isOwn
                  ? "bg-primary/10 text-foreground"
                  : "bg-muted text-foreground",
            )}
          >
            {isDeleted ? "[message deleted]" : message.message}
          </div>
        )}
      </div>
    </div>
  );
}

function EditBubble({
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

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
    <div className="inline-flex flex-col gap-1 w-full text-left">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
        rows={3}
        maxLength={MAX_MESSAGE_LENGTH}
        className="text-sm resize-none"
        aria-label="Edit message"
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

function EmptyThread() {
  return (
    <div className="py-10 text-center space-y-2">
      <div className="flex justify-center">
        <div className="p-3 rounded-full bg-muted">
          <MessageSquare
            className="h-5 w-5 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
      </div>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto">
        No messages yet. Say hi to start the conversation.
      </p>
    </div>
  );
}

interface EditRow {
  id: string;
  previous_message: string;
  edited_at: string;
}

/**
 * Clickable "edited" chip that opens a popover listing prior versions
 * of the message (newest-first). Lazy-loads from coach_client_message_edits
 * so the cost is only paid when someone cares to look.
 */
function EditHistoryTrigger({ messageId }: { messageId: string }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<EditRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || history !== null || loading) return;
    setLoading(true);
    setError(null);
    supabase
      .from("coach_client_message_edits")
      .select("id, previous_message, edited_at")
      .eq("message_id", messageId)
      .order("edited_at", { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          console.warn("[EditHistoryTrigger]", fetchError.message);
          setError("Couldn't load history");
        } else {
          setHistory((data ?? []) as EditRow[]);
        }
        setLoading(false);
      });
  }, [open, history, loading, messageId]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="underline opacity-60 hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          aria-label="Show edit history"
        >
          edited
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3 space-y-2 text-left">
        <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          Previous versions
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Loading...
          </div>
        ) : error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : history && history.length > 0 ? (
          <ul className="space-y-2 max-h-60 overflow-y-auto">
            {history.map((row) => (
              <li key={row.id} className="space-y-0.5">
                <p className="font-mono text-[10px] text-muted-foreground tabular-nums">
                  {format(new Date(row.edited_at), "MMM d, h:mm a")}
                </p>
                <p className="text-xs whitespace-pre-wrap break-words text-muted-foreground">
                  {row.previous_message}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            No previous versions recorded.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
