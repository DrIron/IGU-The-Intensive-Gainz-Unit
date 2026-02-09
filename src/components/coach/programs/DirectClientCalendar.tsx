// src/components/coach/programs/DirectClientCalendar.tsx
// Build workouts directly on a client's calendar without program templates

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  MoreVertical,
  Trash2,
  Edit,
  Loader2,
  Dumbbell,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from "date-fns";
import { SessionTypeSelector } from "./SessionTypeSelector";
import { DirectSessionExerciseEditor } from "./DirectSessionExerciseEditor";
import {
  SessionType,
  SessionTiming,
  SESSION_TYPES,
  DirectCalendarSession,
} from "@/types/workout-builder";

interface DirectClientCalendarProps {
  clientUserId: string;
  coachUserId: string;
  subscriptionId: string;
  clientName: string;
}

export function DirectClientCalendar({
  clientUserId,
  coachUserId,
  subscriptionId,
  clientName,
}: DirectClientCalendarProps) {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<DirectCalendarSession[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [editingSession, setEditingSession] = useState<DirectCalendarSession | null>(null);

  // New session form state
  const [newTitle, setNewTitle] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newSessionType, setNewSessionType] = useState<SessionType>("strength");
  const [newSessionTiming, setNewSessionTiming] = useState<SessionTiming>("anytime");
  const hasFetched = useRef(false);
  const { toast } = useToast();

  // Load sessions for current month
  const loadSessions = useCallback(async () => {
    try {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);

      const { data, error } = await supabase
        .from("direct_calendar_sessions")
        .select("*")
        .eq("client_user_id", clientUserId)
        .eq("coach_user_id", coachUserId)
        .gte("session_date", format(monthStart, "yyyy-MM-dd"))
        .lte("session_date", format(monthEnd, "yyyy-MM-dd"))
        .order("session_date");

      if (error) throw error;
      setSessions(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading sessions",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [clientUserId, coachUserId, currentMonth, toast]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadSessions();
  }, [loadSessions]);

  // Reload when month changes
  useEffect(() => {
    hasFetched.current = false;
    loadSessions().then(() => { hasFetched.current = true; });
  }, [currentMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get sessions for a specific date
  const getSessionsForDate = (date: Date) => {
    return sessions.filter((s) => isSameDay(new Date(s.session_date), date));
  };

  // Create new session
  const createSession = async () => {
    if (!newTitle.trim()) return;

    try {
      const { data, error } = await supabase
        .from("direct_calendar_sessions")
        .insert({
          client_user_id: clientUserId,
          coach_user_id: coachUserId,
          subscription_id: subscriptionId,
          session_date: format(selectedDate, "yyyy-MM-dd"),
          session_type: newSessionType,
          session_timing: newSessionTiming,
          title: newTitle.trim(),
          notes: newNotes.trim() || null,
          status: "scheduled",
        })
        .select()
        .single();

      if (error) throw error;

      setSessions([...sessions, data]);
      setShowAddDialog(false);
      resetForm();

      toast({
        title: "Session created",
        description: `${newTitle} scheduled for ${format(selectedDate, "MMM d, yyyy")}`,
      });

      // Open edit sheet to add exercises
      setEditingSession(data);
      setShowEditSheet(true);
    } catch (error: any) {
      toast({
        title: "Error creating session",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  // Update session
  const updateSession = async (sessionId: string, updates: Partial<DirectCalendarSession>) => {
    try {
      const { error } = await supabase
        .from("direct_calendar_sessions")
        .update(updates)
        .eq("id", sessionId);

      if (error) throw error;

      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, ...updates } : s))
      );

      toast({ title: "Session updated" });
    } catch (error: any) {
      toast({
        title: "Error updating session",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  // Delete session
  const deleteSession = async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from("direct_calendar_sessions")
        .delete()
        .eq("id", sessionId);

      if (error) throw error;

      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setShowEditSheet(false);
      setEditingSession(null);

      toast({ title: "Session deleted" });
    } catch (error: any) {
      toast({
        title: "Error deleting session",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setNewTitle("");
    setNewNotes("");
    setNewSessionType("strength");
    setNewSessionTiming("anytime");
  };

  // Generate calendar days
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get day of week offset for first day
  const startDayOffset = monthStart.getDay() === 0 ? 6 : monthStart.getDay() - 1;

  const selectedDateSessions = getSessionsForDate(selectedDate);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Direct Calendar for {clientName}
          </h2>
          <p className="text-sm text-muted-foreground">
            Create ad-hoc workouts directly on the client's calendar
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-[1fr_300px] gap-4">
        {/* Calendar */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CardTitle>{format(currentMonth, "MMMM yyyy")}</CardTitle>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells for offset */}
              {Array.from({ length: startDayOffset }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}

              {/* Day cells */}
              {calendarDays.map((day) => {
                const daySessions = getSessionsForDate(day);
                const isSelected = isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(day)}
                    className={`aspect-square p-1 rounded-lg border transition-all relative
                      ${isSelected ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted"}
                      ${isToday ? "ring-2 ring-primary/30" : ""}
                    `}
                  >
                    <span className={`text-sm ${isToday ? "font-bold" : ""}`}>
                      {format(day, "d")}
                    </span>
                    {daySessions.length > 0 && (
                      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                        {daySessions.slice(0, 3).map((session) => {
                          const typeInfo = SESSION_TYPES.find((t) => t.value === session.session_type);
                          return (
                            <div
                              key={session.id}
                              className={`w-1.5 h-1.5 rounded-full ${typeInfo?.color || "bg-gray-500"}`}
                            />
                          );
                        })}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Selected Date Panel */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{format(selectedDate, "EEEE, MMM d")}</CardTitle>
              <Button size="sm" onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
            <CardDescription>
              {selectedDateSessions.length === 0
                ? "No sessions scheduled"
                : `${selectedDateSessions.length} session${selectedDateSessions.length > 1 ? "s" : ""}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {selectedDateSessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Dumbbell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No workouts scheduled</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setShowAddDialog(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Workout
                </Button>
              </div>
            ) : (
              selectedDateSessions.map((session) => {
                const typeInfo = SESSION_TYPES.find((t) => t.value === session.session_type);
                return (
                  <div
                    key={session.id}
                    className="p-3 rounded-lg border hover:shadow-sm transition-shadow cursor-pointer"
                    onClick={() => {
                      setEditingSession(session);
                      setShowEditSheet(true);
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${typeInfo?.color || "bg-gray-500"}`} />
                        <div>
                          <p className="font-medium text-sm">{session.title}</p>
                          <p className="text-xs text-muted-foreground">{typeInfo?.label}</p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingSession(session);
                              setShowEditSheet(true);
                            }}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSession(session.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {session.notes && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{session.notes}</p>
                    )}
                    <Badge
                      variant={session.status === "completed" ? "default" : "secondary"}
                      className="mt-2 text-xs"
                    >
                      {session.status}
                    </Badge>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Session Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Workout Session</DialogTitle>
            <DialogDescription>
              Create a new workout for {clientName} on {format(selectedDate, "MMMM d, yyyy")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Session Title</Label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g., Upper Body Push"
              />
            </div>

            <SessionTypeSelector
              sessionType={newSessionType}
              sessionTiming={newSessionTiming}
              onSessionTypeChange={setNewSessionType}
              onSessionTimingChange={setNewSessionTiming}
            />

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Any special instructions or notes..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={createSession} disabled={!newTitle.trim()}>
              Create & Add Exercises
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Session Sheet */}
      <Sheet open={showEditSheet} onOpenChange={setShowEditSheet}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingSession?.title}</SheetTitle>
            <SheetDescription>
              {editingSession && format(new Date(editingSession.session_date), "EEEE, MMMM d, yyyy")}
            </SheetDescription>
          </SheetHeader>

          {editingSession && (
            <div className="mt-6 space-y-6">
              {/* Session Details */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    value={editingSession.title}
                    onChange={(e) =>
                      setEditingSession({ ...editingSession, title: e.target.value })
                    }
                    onBlur={() => updateSession(editingSession.id, { title: editingSession.title })}
                  />
                </div>

                <SessionTypeSelector
                  sessionType={editingSession.session_type}
                  sessionTiming={editingSession.session_timing}
                  onSessionTypeChange={(type) => {
                    setEditingSession({ ...editingSession, session_type: type });
                    updateSession(editingSession.id, { session_type: type });
                  }}
                  onSessionTimingChange={(timing) => {
                    setEditingSession({ ...editingSession, session_timing: timing });
                    updateSession(editingSession.id, { session_timing: timing });
                  }}
                  compact
                />

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={editingSession.notes || ""}
                    onChange={(e) =>
                      setEditingSession({ ...editingSession, notes: e.target.value })
                    }
                    onBlur={() => updateSession(editingSession.id, { notes: editingSession.notes })}
                    rows={2}
                  />
                </div>
              </div>

              {/* Exercises */}
              <div className="space-y-2">
                <Label>Exercises</Label>
                <DirectSessionExerciseEditor
                  sessionId={editingSession.id}
                  coachUserId={coachUserId}
                />
              </div>

              {/* Actions */}
              <div className="flex justify-between pt-4 border-t">
                <Button
                  variant="destructive"
                  onClick={() => deleteSession(editingSession.id)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Session
                </Button>
                <Button onClick={() => setShowEditSheet(false)}>Done</Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default DirectClientCalendar;
