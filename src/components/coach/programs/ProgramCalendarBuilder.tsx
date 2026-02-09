// src/components/coach/programs/ProgramCalendarBuilder.tsx
// Week x Day grid view for building program templates

import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  Copy,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Eye,
  EyeOff,
  Trash2,
  Edit,
  Loader2,
  Clipboard,
  ClipboardPaste,
} from "lucide-react";
import { SessionTypeSelector } from "./SessionTypeSelector";
import {
  SessionType,
  SessionTiming,
  SESSION_TYPES,
  CalendarWeek,
  CalendarDay,
  CalendarSession,
} from "@/types/workout-builder";

interface ProgramCalendarBuilderProps {
  programId: string;
  coachUserId: string;
  onEditDay?: (dayId: string) => void;
}

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Memoized session card to prevent re-renders when other sessions/days change
interface SessionCardProps {
  session: CalendarSession;
  onEditDay?: (dayId: string) => void;
  onCopySession: (sessionId: string, title: string) => void;
  onToggleStatus: (moduleId: string, currentStatus: string) => void;
  onDeleteSession: (moduleId: string) => void;
}

const SessionCard = memo(function SessionCard({
  session,
  onEditDay,
  onCopySession,
  onToggleStatus,
  onDeleteSession,
}: SessionCardProps) {
  const sessionTypeInfo = SESSION_TYPES.find((t) => t.value === session.sessionType);
  return (
    <div
      className={`p-2 rounded-md text-xs cursor-pointer hover:opacity-80 transition-opacity ${
        session.status === "published"
          ? "bg-primary/10 border border-primary/20"
          : "bg-muted border border-dashed"
      }`}
      onClick={() => onEditDay?.(session.id)}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 min-w-0">
          <div className={`w-2 h-2 rounded-full shrink-0 ${sessionTypeInfo?.color || "bg-gray-500"}`} />
          <span className="font-medium truncate">{session.title}</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEditDay?.(session.id)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Session
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => {
              e.stopPropagation();
              onCopySession(session.id, session.title);
            }}>
              <Clipboard className="h-4 w-4 mr-2" />
              Copy Session
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleStatus(session.id, session.status)}>
              {session.status === "published" ? (
                <>
                  <EyeOff className="h-4 w-4 mr-2" />
                  Unpublish
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Publish
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => onDeleteSession(session.id)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Badge
        variant={session.status === "published" ? "default" : "secondary"}
        className="text-[10px] h-4 px-1 mt-1"
      >
        {session.status}
      </Badge>
    </div>
  );
});

// Memoized day cell to prevent all 7 cells from re-rendering on state changes
interface DayCellProps {
  day: CalendarDay;
  copiedSessionId: string | null;
  onPasteSession: (dayIndex: number) => void;
  onAddSession: (dayIndex: number) => void;
  onEditDay?: (dayId: string) => void;
  onCopySession: (sessionId: string, title: string) => void;
  onToggleStatus: (moduleId: string, currentStatus: string) => void;
  onDeleteSession: (moduleId: string) => void;
}

const DayCell = memo(function DayCell({
  day,
  copiedSessionId,
  onPasteSession,
  onAddSession,
  onEditDay,
  onCopySession,
  onToggleStatus,
  onDeleteSession,
}: DayCellProps) {
  return (
    <Card
      className={`min-h-[140px] ${day.isRestDay ? "bg-muted/30" : ""} hover:shadow-md transition-shadow`}
    >
      <CardHeader className="p-2 pb-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Day {day.dayIndex}</span>
          <div className="flex items-center gap-0.5">
            {copiedSessionId && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-primary"
                      onClick={() => onPasteSession(day.dayIndex)}
                    >
                      <ClipboardPaste className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Paste session here</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onAddSession(day.dayIndex)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Add session</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2 pt-0 space-y-1">
        {day.sessions.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">Rest Day</div>
        ) : (
          day.sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onEditDay={onEditDay}
              onCopySession={onCopySession}
              onToggleStatus={onToggleStatus}
              onDeleteSession={onDeleteSession}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
});

export function ProgramCalendarBuilder({
  programId,
  coachUserId,
  onEditDay,
}: ProgramCalendarBuilderProps) {
  const [loading, setLoading] = useState(true);
  const [weeks, setWeeks] = useState<CalendarWeek[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [showAddDayDialog, setShowAddDayDialog] = useState(false);
  const [showCopyWeekDialog, setShowCopyWeekDialog] = useState(false);
  const [addDayIndex, setAddDayIndex] = useState<number | null>(null);
  const [newSessionTitle, setNewSessionTitle] = useState("");
  const [newSessionType, setNewSessionType] = useState<SessionType>("strength");
  const [newSessionTiming, setNewSessionTiming] = useState<SessionTiming>("anytime");
  const [copyFromWeek, setCopyFromWeek] = useState<number | null>(null);
  const [copyToWeek, setCopyToWeek] = useState<number | null>(null);
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
  const hasFetched = useRef(false);
  const { toast } = useToast();

  // Load program structure
  const loadProgramStructure = useCallback(async () => {
    try {
      const { data: days, error } = await supabase
        .from("program_template_days")
        .select(`*, day_modules(*)`)
        .eq("program_template_id", programId)
        .order("day_index");

      if (error) throw error;

      // Group days into weeks (7 days per week)
      const weekMap = new Map<number, CalendarDay[]>();
      const maxDayIndex = Math.max(...(days || []).map((d) => d.day_index), 0);
      const totalWeeks = Math.max(1, Math.ceil(maxDayIndex / 7));

      for (let w = 1; w <= totalWeeks; w++) {
        weekMap.set(w, []);
        for (let d = 1; d <= 7; d++) {
          const dayIndex = (w - 1) * 7 + d;
          const dayData = days?.find((day) => day.day_index === dayIndex);

          const sessions: CalendarSession[] = (dayData?.day_modules || []).map((mod: any) => ({
            id: mod.id,
            title: mod.title,
            sessionType: mod.session_type || "strength",
            sessionTiming: mod.session_timing || "anytime",
            status: mod.status,
            moduleCount: 1,
            exerciseCount: 0,
          }));

          weekMap.get(w)!.push({
            date: new Date(),
            dayIndex,
            sessions,
            isRestDay: sessions.length === 0,
          });
        }
      }

      const calendarWeeks: CalendarWeek[] = Array.from(weekMap.entries()).map(
        ([weekNum, calendarDays]) => ({
          weekNumber: weekNum,
          startDate: new Date(),
          days: calendarDays,
        })
      );

      setWeeks(calendarWeeks);
    } catch (error: any) {
      toast({
        title: "Error loading program",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [programId, toast]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadProgramStructure();
  }, [loadProgramStructure]);

  const addWeek = async () => {
    const newWeekNum = weeks.length + 1;
    const newWeek: CalendarWeek = {
      weekNumber: newWeekNum,
      startDate: new Date(),
      days: Array.from({ length: 7 }, (_, i) => ({
        date: new Date(),
        dayIndex: (newWeekNum - 1) * 7 + i + 1,
        sessions: [],
        isRestDay: true,
      })),
    };
    setWeeks([...weeks, newWeek]);
    setSelectedWeek(newWeekNum);
    toast({ title: "Week added", description: `Week ${newWeekNum} has been added.` });
  };

  const addSessionToDay = async () => {
    if (addDayIndex === null || !newSessionTitle.trim()) return;

    try {
      let dayId: string;
      const existingDay = await supabase
        .from("program_template_days")
        .select("id")
        .eq("program_template_id", programId)
        .eq("day_index", addDayIndex)
        .single();

      if (existingDay.data) {
        dayId = existingDay.data.id;
      } else {
        const { data: newDay, error: dayError } = await supabase
          .from("program_template_days")
          .insert({
            program_template_id: programId,
            day_index: addDayIndex,
            day_title: `Day ${addDayIndex}`,
          })
          .select()
          .single();

        if (dayError) throw dayError;
        dayId = newDay.id;
      }

      const { data: existingModules } = await supabase
        .from("day_modules")
        .select("sort_order")
        .eq("program_template_day_id", dayId);

      const maxOrder = Math.max(0, ...(existingModules || []).map((m) => m.sort_order));

      const { error: moduleError } = await supabase.from("day_modules").insert({
        program_template_day_id: dayId,
        module_owner_coach_id: coachUserId,
        module_type: newSessionType,
        session_type: newSessionType,
        session_timing: newSessionTiming,
        title: newSessionTitle.trim(),
        sort_order: maxOrder + 1,
        status: "draft",
      });

      if (moduleError) throw moduleError;

      // Reset hasFetched so loadProgramStructure runs again
      hasFetched.current = false;
      await loadProgramStructure();
      hasFetched.current = true;

      setShowAddDayDialog(false);
      setNewSessionTitle("");
      setNewSessionType("strength");
      setNewSessionTiming("anytime");
      setAddDayIndex(null);

      toast({ title: "Session added", description: `${newSessionTitle} added to Day ${addDayIndex}.` });
    } catch (error: any) {
      toast({ title: "Error adding session", description: error.message, variant: "destructive" });
    }
  };

  const copyWeek = async () => {
    if (copyFromWeek === null || copyToWeek === null) return;

    try {
      const sourceWeek = weeks.find((w) => w.weekNumber === copyFromWeek);
      if (!sourceWeek) return;

      for (const day of sourceWeek.days) {
        const targetDayIndex = (copyToWeek - 1) * 7 + ((day.dayIndex - 1) % 7) + 1;
        if (day.sessions.length === 0) continue;

        let targetDayId: string;
        const existingDay = await supabase
          .from("program_template_days")
          .select("id")
          .eq("program_template_id", programId)
          .eq("day_index", targetDayIndex)
          .single();

        if (existingDay.data) {
          targetDayId = existingDay.data.id;
        } else {
          const { data: newDay, error } = await supabase
            .from("program_template_days")
            .insert({
              program_template_id: programId,
              day_index: targetDayIndex,
              day_title: `Day ${targetDayIndex}`,
            })
            .select()
            .single();

          if (error) throw error;
          targetDayId = newDay.id;
        }

        for (const session of day.sessions) {
          const { data: sourceModule } = await supabase
            .from("day_modules")
            .select(`*, module_exercises(*, exercise_prescriptions(*))`)
            .eq("id", session.id)
            .single();

          if (!sourceModule) continue;

          const { data: newModule, error: moduleError } = await supabase
            .from("day_modules")
            .insert({
              program_template_day_id: targetDayId,
              module_owner_coach_id: sourceModule.module_owner_coach_id,
              module_type: sourceModule.module_type,
              session_type: sourceModule.session_type,
              session_timing: sourceModule.session_timing,
              title: sourceModule.title,
              sort_order: sourceModule.sort_order,
              status: "draft",
            })
            .select()
            .single();

          if (moduleError) throw moduleError;

          if (sourceModule.module_exercises) {
            for (const ex of sourceModule.module_exercises) {
              const { data: newEx, error: exError } = await supabase
                .from("module_exercises")
                .insert({
                  day_module_id: newModule.id,
                  exercise_id: ex.exercise_id,
                  section: ex.section,
                  sort_order: ex.sort_order,
                  instructions: ex.instructions,
                })
                .select()
                .single();

              if (exError) throw exError;

              if (ex.exercise_prescriptions?.[0]) {
                const presc = ex.exercise_prescriptions[0];
                await supabase.from("exercise_prescriptions").insert({
                  module_exercise_id: newEx.id,
                  set_count: presc.set_count,
                  rep_range_min: presc.rep_range_min,
                  rep_range_max: presc.rep_range_max,
                  tempo: presc.tempo,
                  rest_seconds: presc.rest_seconds,
                  intensity_type: presc.intensity_type,
                  intensity_value: presc.intensity_value,
                  column_config: presc.column_config,
                  sets_json: presc.sets_json,
                  custom_fields_json: presc.custom_fields_json,
                });
              }
            }
          }
        }
      }

      hasFetched.current = false;
      await loadProgramStructure();
      hasFetched.current = true;

      setShowCopyWeekDialog(false);
      setCopyFromWeek(null);
      setCopyToWeek(null);

      toast({ title: "Week copied", description: `Week ${copyFromWeek} copied to Week ${copyToWeek}.` });
    } catch (error: any) {
      toast({ title: "Error copying week", description: error.message, variant: "destructive" });
    }
  };

  const toggleModuleStatus = async (moduleId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === "published" ? "draft" : "published";
      await supabase.from("day_modules").update({ status: newStatus }).eq("id", moduleId);
      hasFetched.current = false;
      await loadProgramStructure();
      hasFetched.current = true;
      toast({ title: newStatus === "published" ? "Module published" : "Module unpublished" });
    } catch (error: any) {
      toast({ title: "Error updating status", description: error.message, variant: "destructive" });
    }
  };

  const deleteSession = async (moduleId: string) => {
    try {
      await supabase.from("day_modules").delete().eq("id", moduleId);
      hasFetched.current = false;
      await loadProgramStructure();
      hasFetched.current = true;
      toast({ title: "Session deleted" });
    } catch (error: any) {
      toast({ title: "Error deleting session", description: error.message, variant: "destructive" });
    }
  };

  const pasteSession = async (targetDayIndex: number) => {
    if (!copiedSessionId) return;

    try {
      // 1. Get or create target day record
      let targetDayId: string;
      const existingDay = await supabase
        .from("program_template_days")
        .select("id")
        .eq("program_template_id", programId)
        .eq("day_index", targetDayIndex)
        .single();

      if (existingDay.data) {
        targetDayId = existingDay.data.id;
      } else {
        const { data: newDay, error } = await supabase
          .from("program_template_days")
          .insert({
            program_template_id: programId,
            day_index: targetDayIndex,
            day_title: `Day ${targetDayIndex}`,
          })
          .select()
          .single();
        if (error) throw error;
        targetDayId = newDay.id;
      }

      // 2. Fetch source module with nested exercises + prescriptions
      const { data: sourceModule } = await supabase
        .from("day_modules")
        .select(`*, module_exercises(*, exercise_prescriptions(*))`)
        .eq("id", copiedSessionId)
        .single();

      if (!sourceModule) throw new Error("Source session not found");

      // 3. Get max sort_order for target day
      const { data: existingModules } = await supabase
        .from("day_modules")
        .select("sort_order")
        .eq("program_template_day_id", targetDayId);
      const maxOrder = Math.max(0, ...(existingModules || []).map((m) => m.sort_order));

      // 4. Insert new module (copy of source)
      const { data: newModule, error: moduleError } = await supabase
        .from("day_modules")
        .insert({
          program_template_day_id: targetDayId,
          module_owner_coach_id: sourceModule.module_owner_coach_id,
          module_type: sourceModule.module_type,
          session_type: sourceModule.session_type,
          session_timing: sourceModule.session_timing,
          title: sourceModule.title,
          sort_order: maxOrder + 1,
          status: "draft",
        })
        .select()
        .single();
      if (moduleError) throw moduleError;

      // 5. Copy exercises + prescriptions (including sets_json, custom_fields_json)
      if (sourceModule.module_exercises) {
        for (const ex of sourceModule.module_exercises) {
          const { data: newEx, error: exError } = await supabase
            .from("module_exercises")
            .insert({
              day_module_id: newModule.id,
              exercise_id: ex.exercise_id,
              section: ex.section,
              sort_order: ex.sort_order,
              instructions: ex.instructions,
            })
            .select()
            .single();
          if (exError) throw exError;

          if (ex.exercise_prescriptions?.[0]) {
            const presc = ex.exercise_prescriptions[0];
            await supabase.from("exercise_prescriptions").insert({
              module_exercise_id: newEx.id,
              set_count: presc.set_count,
              rep_range_min: presc.rep_range_min,
              rep_range_max: presc.rep_range_max,
              tempo: presc.tempo,
              rest_seconds: presc.rest_seconds,
              intensity_type: presc.intensity_type,
              intensity_value: presc.intensity_value,
              column_config: presc.column_config,
              sets_json: presc.sets_json,
              custom_fields_json: presc.custom_fields_json,
            });
          }
        }
      }

      // 6. Refresh and provide feedback
      hasFetched.current = false;
      await loadProgramStructure();
      hasFetched.current = true;

      toast({
        title: "Session pasted",
        description: `"${sourceModule.title}" added to Day ${targetDayIndex}.`,
      });
    } catch (error: any) {
      toast({
        title: "Error pasting session",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleCopySession = useCallback((sessionId: string, title: string) => {
    setCopiedSessionId(sessionId);
    toast({ title: "Session copied", description: `"${title}" ready to paste.` });
  }, [toast]);

  const handleAddSession = useCallback((dayIndex: number) => {
    setAddDayIndex(dayIndex);
    setShowAddDayDialog(true);
  }, []);

  const currentWeek = useMemo(
    () => weeks.find((w) => w.weekNumber === selectedWeek),
    [weeks, selectedWeek]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSelectedWeek(Math.max(1, selectedWeek - 1))}
            disabled={selectedWeek <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-md">
            <Calendar className="h-4 w-4" />
            <span className="font-medium">Week {selectedWeek}</span>
            <span className="text-muted-foreground text-sm">of {weeks.length}</span>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSelectedWeek(Math.min(weeks.length, selectedWeek + 1))}
            disabled={selectedWeek >= weeks.length}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowCopyWeekDialog(true)}>
            <Copy className="h-4 w-4 mr-2" />
            Copy Week
          </Button>
          <Button onClick={addWeek}>
            <Plus className="h-4 w-4 mr-2" />
            Add Week
          </Button>
        </div>
      </div>

      {/* Clipboard Banner */}
      {copiedSessionId && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-md text-sm">
          <ClipboardPaste className="h-4 w-4 text-primary" />
          <span>Session copied — click paste on any day</span>
          <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-xs"
            onClick={() => setCopiedSessionId(null)}>
            Cancel
          </Button>
        </div>
      )}

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2">
        {DAYS_OF_WEEK.map((day) => (
          <div key={day} className="text-center font-medium text-sm text-muted-foreground py-2">
            {day}
          </div>
        ))}

        {currentWeek?.days.map((day) => (
          <DayCell
            key={day.dayIndex}
            day={day}
            copiedSessionId={copiedSessionId}
            onPasteSession={pasteSession}
            onAddSession={handleAddSession}
            onEditDay={onEditDay}
            onCopySession={handleCopySession}
            onToggleStatus={toggleModuleStatus}
            onDeleteSession={deleteSession}
          />
        ))}
      </div>

      {/* Add Session Dialog */}
      <Dialog open={showAddDayDialog} onOpenChange={setShowAddDayDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Session to Day {addDayIndex}</DialogTitle>
            <DialogDescription>Create a new workout session for this day.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Session Title</Label>
              <Input
                value={newSessionTitle}
                onChange={(e) => setNewSessionTitle(e.target.value)}
                placeholder="e.g., Upper Body Strength"
              />
            </div>
            <SessionTypeSelector
              sessionType={newSessionType}
              sessionTiming={newSessionTiming}
              onSessionTypeChange={setNewSessionType}
              onSessionTimingChange={setNewSessionTiming}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDayDialog(false)}>
              Cancel
            </Button>
            <Button onClick={addSessionToDay} disabled={!newSessionTitle.trim()}>
              Add Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy Week Dialog */}
      <Dialog open={showCopyWeekDialog} onOpenChange={setShowCopyWeekDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy Week</DialogTitle>
            <DialogDescription>Copy all sessions from one week to another.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>From Week</Label>
                <select
                  className="w-full p-2 border rounded-md"
                  value={copyFromWeek || ""}
                  onChange={(e) => setCopyFromWeek(parseInt(e.target.value))}
                >
                  <option value="">Select week</option>
                  {weeks.map((w) => (
                    <option key={w.weekNumber} value={w.weekNumber}>
                      Week {w.weekNumber}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>To Week</Label>
                <select
                  className="w-full p-2 border rounded-md"
                  value={copyToWeek || ""}
                  onChange={(e) => setCopyToWeek(parseInt(e.target.value))}
                >
                  <option value="">Select week</option>
                  {weeks.map((w) => (
                    <option key={w.weekNumber} value={w.weekNumber}>
                      Week {w.weekNumber}
                    </option>
                  ))}
                  <option value={weeks.length + 1}>New Week {weeks.length + 1}</option>
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCopyWeekDialog(false)}>
              Cancel
            </Button>
            <Button onClick={copyWeek} disabled={copyFromWeek === null || copyToWeek === null}>
              <Copy className="h-4 w-4 mr-2" />
              Copy Week
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ProgramCalendarBuilder;
