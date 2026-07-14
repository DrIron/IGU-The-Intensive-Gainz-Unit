import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/errorLogging";
import { useToast } from "@/hooks/use-toast";
import { useAuthSession } from "@/hooks/useAuthSession";
import {
  MessageSquare, Send, Filter, CheckCircle, Circle, Loader2, Bell, BellOff, RefreshCw,
} from "lucide-react";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import {
  type CareTeamMessage,
  type CareTeamMessageType,
  type CareTeamMessagePriority,
  MESSAGE_TYPE_CONFIG,
  MESSAGE_PRIORITY_CONFIG,
} from "@/types/nutrition-phase22";

interface CareTeamMessagesPanelProps {
  clientId: string;
  relatedPhaseId?: string;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatarUrl?: string;
}

interface EnrichedMessage extends CareTeamMessage {
  sender?: TeamMember;
}

export function CareTeamMessagesPanel({
  clientId,
  relatedPhaseId,
}: CareTeamMessagesPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<EnrichedMessage[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  // B5-N12: derive the viewer from useAuthSession (handles the setSession
  // recovery race) instead of a one-shot getUser() that could land null and
  // INSERT sender_id: null.
  const { user: sessionUser } = useAuthSession();
  const currentUserId = sessionUser?.id ?? null;

  // Composer state
  const [newMessage, setNewMessage] = useState("");
  const [messageType, setMessageType] = useState<CareTeamMessageType>('general');
  const [priority, setPriority] = useState<CareTeamMessagePriority>('normal');

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterUnread, setFilterUnread] = useState(false);
  const [filterResolved, setFilterResolved] = useState<string>('all');

  const hasFetched = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    if (!clientId) return;

    try {
      setLoading(true);

      // Viewer identity now comes from useAuthSession (B5-N12) -- no getUser() here.
      // Independent reads run in parallel (CLAUDE.md: Promise.all over serial calls).
      // B5-N3: the care_team_assignments + subscriptions reads previously used
      // BANNED nested PostgREST FK joins that embedded `coaches_client_safe` --
      // a view that is RLS-broken (returns 0 rows to non-admin callers per
      // migration 20260517104551) and does NOT cover non-coach staff (dietitians
      // etc.) at all. Split into flat queries; resolve sender names from
      // profiles_public, the same path the shipped coach<->client thread uses
      // (CoachClientThread.tsx). NOTE: get_coach_for_client is NOT usable here --
      // see the PR notes (its gate requires the caller to be the client).
      const [messagesRes, teamRes, subRes] = await Promise.all([
        supabase
          .from('care_team_messages')
          .select('*')
          .eq('client_id', clientId)
          .order('created_at', { ascending: true }),
        supabase
          .from('care_team_assignments')
          .select('staff_user_id, specialty')
          .eq('client_id', clientId)
          .in('lifecycle_status', ['active', 'scheduled_end']),
        supabase
          .from('subscriptions')
          .select('coach_id')
          .eq('user_id', clientId)
          .eq('status', 'active')
          .maybeSingle(),
      ]);

      if (messagesRes.error) throw messagesRes.error;
      if (teamRes.error) throw teamRes.error;
      if (subRes.error) throw subRes.error;

      const messagesData = messagesRes.data;
      const teamData = teamRes.data ?? [];
      const subscriptionData = subRes.data;

      // Resolve staff display names/avatars via profiles_public in one round-trip.
      // profiles_public has no last_name (PII is in profiles_private) and uses
      // avatar_url; name = display_name || first_name, matching CoachClientThread.
      const staffIds = Array.from(
        new Set<string>([
          ...(subscriptionData?.coach_id ? [subscriptionData.coach_id] : []),
          ...teamData.map((a) => a.staff_user_id),
        ])
      );

      const profileMap = new Map<
        string,
        { first_name: string | null; display_name: string | null; avatar_url: string | null }
      >();
      if (staffIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles_public')
          .select('id, first_name, display_name, avatar_url')
          .in('id', staffIds);
        if (profilesError) throw profilesError;
        for (const p of profiles ?? []) profileMap.set(p.id, p);
      }

      const resolveName = (id: string) => {
        const p = profileMap.get(id);
        return (p?.display_name || p?.first_name || '').trim();
      };
      const resolveAvatar = (id: string) => profileMap.get(id)?.avatar_url || undefined;

      // Build team members list (maps message sender_id -> display info).
      const members: TeamMember[] = [];

      if (subscriptionData?.coach_id) {
        members.push({
          id: subscriptionData.coach_id,
          name: resolveName(subscriptionData.coach_id),
          role: 'Primary Coach',
          avatarUrl: resolveAvatar(subscriptionData.coach_id),
        });
      }

      teamData.forEach((assignment) => {
        if (!members.find((m) => m.id === assignment.staff_user_id)) {
          members.push({
            id: assignment.staff_user_id,
            name: resolveName(assignment.staff_user_id),
            role: assignment.specialty.charAt(0).toUpperCase() + assignment.specialty.slice(1),
            avatarUrl: resolveAvatar(assignment.staff_user_id),
          });
        }
      });

      setTeamMembers(members);

      // Enrich messages with sender info
      const enrichedMessages = (messagesData as CareTeamMessage[])?.map(msg => ({
        ...msg,
        sender: members.find(m => m.id === msg.sender_id),
      })) || [];

      setMessages(enrichedMessages);

      // Mark thread as read in one round-trip (B5-N4 / B5-N7).
      // Fire-and-forget: a read-receipt failure shouldn't block the panel.
      supabase
        .rpc('mark_care_team_thread_read', { p_client_id: clientId })
        .then(({ error: readErr }) => {
          if (readErr) {
            console.warn('[CareTeamMessagesPanel] mark read:', readErr.message);
          }
        });
    } catch (error) {
      captureException(error, { source: 'care_team_messages_load' });
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadData();
  }, [loadData]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    try {
      setSending(true);

      const { error } = await supabase.from('care_team_messages').insert({
        client_id: clientId,
        sender_id: currentUserId,
        message: newMessage.trim(),
        message_type: messageType,
        priority,
        related_phase_id: relatedPhaseId || null,
      });

      if (error) throw error;

      setNewMessage("");
      setMessageType('general');
      setPriority('normal');

      hasFetched.current = false;
      loadData();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleToggleResolved = async (messageId: string, currentResolved: boolean) => {
    try {
      // B5-N11: rows-affected check -- an RLS denial (caller lost their
      // care-team relationship since loadData) returns 200 / 0 rows / no error.
      const { data, error } = await supabase
        .from('care_team_messages')
        .update({
          is_resolved: !currentResolved,
          resolved_by: !currentResolved ? currentUserId : null,
          resolved_at: !currentResolved ? new Date().toISOString() : null,
        })
        .eq('id', messageId)
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Toggle blocked');

      hasFetched.current = false;
      loadData();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  // Apply filters
  const filteredMessages = messages.filter(msg => {
    if (filterType !== 'all' && msg.message_type !== filterType) return false;
    if (filterUnread && currentUserId && msg.read_by?.includes(currentUserId)) return false;
    if (filterResolved === 'resolved' && !msg.is_resolved) return false;
    if (filterResolved === 'unresolved' && msg.is_resolved) return false;
    return true;
  });

  // Group messages by date
  const groupedMessages: { date: string; messages: EnrichedMessage[] }[] = [];
  let currentDate = '';

  filteredMessages.forEach(msg => {
    const msgDate = format(new Date(msg.created_at), 'yyyy-MM-dd');
    if (msgDate !== currentDate) {
      currentDate = msgDate;
      groupedMessages.push({ date: msgDate, messages: [msg] });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    }
  });

  const formatDateHeader = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'EEEE, MMMM d');
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const unreadCount = messages.filter(
    msg => currentUserId && msg.sender_id !== currentUserId && (!msg.read_by || !msg.read_by.includes(currentUserId))
  ).length;

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Care Team Messages
              {unreadCount > 0 && (
                <Badge variant="destructive" className="ml-2">{unreadCount} new</Badge>
              )}
            </CardTitle>
            <CardDescription>Internal communication (not visible to client)</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                hasFetched.current = false;
                loadData();
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="flex flex-wrap gap-3 pt-3 border-t mt-3">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(MESSAGE_TYPE_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>{config.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterResolved} onValueChange={setFilterResolved}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unresolved">Unresolved</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Switch
                id="unread-filter"
                checked={filterUnread}
                onCheckedChange={setFilterUnread}
              />
              <Label htmlFor="unread-filter" className="text-sm">Unread only</Label>
            </div>
          </div>
        )}
      </CardHeader>

      {/* Messages */}
      <CardContent className="flex-1 overflow-y-auto space-y-4 px-4">
        {groupedMessages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No messages yet</p>
            <p className="text-xs mt-1">Start a conversation with the care team</p>
          </div>
        ) : (
          groupedMessages.map((group) => (
            <div key={group.date}>
              <div className="flex items-center gap-2 my-4">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">{formatDateHeader(group.date)}</span>
                <Separator className="flex-1" />
              </div>

              {group.messages.map((msg) => {
                const isOwn = msg.sender_id === currentUserId;
                const typeConfig = MESSAGE_TYPE_CONFIG[msg.message_type as CareTeamMessageType];
                const priorityConfig = MESSAGE_PRIORITY_CONFIG[msg.priority as CareTeamMessagePriority];

                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex gap-3 mb-3",
                      isOwn && "flex-row-reverse"
                    )}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={msg.sender?.avatarUrl} />
                      <AvatarFallback>
                        {msg.sender?.name?.charAt(0) || '?'}
                      </AvatarFallback>
                    </Avatar>

                    <div className={cn("flex-1 max-w-[80%]", isOwn && "items-end")}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{msg.sender?.name || 'Unknown'}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(msg.created_at), 'h:mm a')}
                        </span>
                        <Badge className={cn("text-xs", typeConfig?.color)}>{typeConfig?.label}</Badge>
                        {msg.priority !== 'normal' && (
                          <Badge className={cn("text-xs", priorityConfig?.color)}>{priorityConfig?.label}</Badge>
                        )}
                      </div>

                      <div
                        className={cn(
                          "p-3 rounded-lg",
                          isOwn ? "bg-primary text-primary-foreground" : "bg-muted",
                          msg.is_resolved && "opacity-60"
                        )}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                      </div>

                      <div className="flex items-center gap-2 mt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => handleToggleResolved(msg.id, msg.is_resolved)}
                        >
                          {msg.is_resolved ? (
                            <>
                              <CheckCircle className="h-3 w-3 mr-1 text-green-600" />
                              Resolved
                            </>
                          ) : (
                            <>
                              <Circle className="h-3 w-3 mr-1" />
                              Mark resolved
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </CardContent>

      {/* Composer */}
      <div className="border-t p-4">
        <div className="flex gap-2 mb-2">
          <Select value={messageType} onValueChange={(v) => setMessageType(v as CareTeamMessageType)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(MESSAGE_TYPE_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>{config.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={priority} onValueChange={(v) => setPriority(v as CareTeamMessagePriority)}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(MESSAGE_PRIORITY_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>{config.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            className="min-h-[60px] resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSendMessage();
              }
            }}
          />
          <Button
            onClick={handleSendMessage}
            disabled={sending || !newMessage.trim()}
            className="self-end"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Press Cmd+Enter to send
        </p>
      </div>
    </Card>
  );
}
