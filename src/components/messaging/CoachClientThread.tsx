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
import { Loader2, Send, MessageSquare } from "lucide-react";
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
  /**
   * Client side sets this true so the thread header reads "Your care team"
   * instead of "{client}". No policy difference -- purely cosmetic.
   */
  viewerIsClient?: boolean;
  className?: string;
}

/**
 * Shared thread view for the coach<->client messaging surface.
 *
 * Backing data:
 *   - `coach_client_messages` (one flat thread per client). RLS lets the
 *     client themselves and every active care-team member read / write.
 *   - Sender display resolved against `profiles_public` (coach-safe; no
 *     PII exposed here).
 *
 * Behaviour:
 *   - Loads the thread in chronological order on mount.
 *   - Fires `mark_coach_client_thread_read` RPC on mount (silent).
 *   - Composer submits via button or Cmd/Ctrl + Enter. After a successful
 *     insert it fires `send-coach-client-message-email` edge function
 *     fire-and-forget. Email throttle (30 min per recipient per thread)
 *     lives on the edge function; the UI does not try to debounce.
 *   - Soft-deleted rows render as "[message deleted]" placeholders so
 *     the conversation stays coherent.
 *
 * Re-used by both the coach-side MessagesTab and the client-side
 * /messages route so the two surfaces stay in sync.
 */
export function CoachClientThread({
  clientUserId,
  viewerUserId,
  viewerIsClient: _viewerIsClient,
  className,
}: CoachClientThreadProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [senders, setSenders] = useState<Record<string, SenderProfile>>({});
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const hasFetched = useRef<string | null>(null);

  // Load thread + resolve sender display data.
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

    // Resolve distinct senders in one batch. profiles is a view, but
    // profiles_public is a base table -- safe to query directly.
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

    // Fire-and-forget: mark thread read for the viewer.
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

  // Keep the viewport pinned to the newest message after messages land or
  // a new one is appended.
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

    // Fire-and-forget email notification. The edge function verifies the
    // caller's JWT matches sender_id and throttles per (recipient, thread).
    supabase.functions
      .invoke("send-coach-client-message-email", {
        body: { message_id: data.id },
      })
      .catch((err) => {
        console.warn("[CoachClientThread] email notify:", err?.message ?? err);
      });
  }, [draft, sending, clientUserId, viewerUserId]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

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
                  />
                ))}
              </div>
            ))
          )}
        </div>

        <div className="border-t p-3 md:p-4 flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            placeholder="Write a message... (Cmd/Ctrl + Enter to send)"
            rows={2}
            maxLength={MAX_MESSAGE_LENGTH}
            className="flex-1 min-h-[60px] max-h-[200px] resize-none text-base md:text-sm"
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

function MessageRow({
  message,
  sender,
  isOwn,
}: {
  message: Message;
  sender: SenderProfile | undefined;
  isOwn: boolean;
}) {
  const name = isOwn
    ? "You"
    : sender?.display_name || sender?.first_name || "Someone";
  const initials =
    (sender?.first_name || sender?.display_name || "?")
      .slice(0, 2)
      .toUpperCase();
  const when = format(new Date(message.created_at), "h:mm a");
  const isDeleted = message.deleted_at !== null;

  return (
    <div
      className={cn(
        "flex gap-3",
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
        <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {name} <span className="opacity-60">· {when}</span>
          {message.edited_at && <span className="opacity-60"> · edited</span>}
        </p>
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
