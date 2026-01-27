import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit2, CalendarIcon, Bell, StickyNote, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CoachNutritionNotesProps {
  phase: any;
}

export function CoachNutritionNotes({ phase }: CoachNutritionNotesProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // New note form
  const [noteText, setNoteText] = useState("");
  const [isReminder, setIsReminder] = useState(false);
  const [reminderDate, setReminderDate] = useState<Date>();
  
  // Edit note form
  const [editText, setEditText] = useState("");
  const [editIsReminder, setEditIsReminder] = useState(false);
  const [editReminderDate, setEditReminderDate] = useState<Date>();

  useEffect(() => {
    if (phase) {
      loadNotes();
    }
  }, [phase]);

  const loadNotes = async () => {
    try {
      const { data, error } = await supabase
        .from('coach_nutrition_notes')
        .select('*')
        .eq('phase_id', phase.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotes(data || []);
    } catch (error: any) {
      console.error('Error loading notes:', error);
      toast({ title: "Error", description: "Failed to load notes", variant: "destructive" });
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) {
      toast({ title: "Missing Data", description: "Please enter note text", variant: "destructive" });
      return;
    }

    if (isReminder && !reminderDate) {
      toast({ title: "Missing Data", description: "Please select a reminder date", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from('coach_nutrition_notes').insert({
        phase_id: phase.id,
        coach_id: user.id,
        note_text: noteText.trim(),
        is_reminder: isReminder,
        reminder_date: isReminder && reminderDate ? format(reminderDate, 'yyyy-MM-dd') : null
      });

      if (error) throw error;

      toast({ title: "Success", description: "Note added successfully" });
      setNoteText("");
      setIsReminder(false);
      setReminderDate(undefined);
      loadNotes();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (note: any) => {
    setEditingId(note.id);
    setEditText(note.note_text);
    setEditIsReminder(note.is_reminder);
    setEditReminderDate(note.reminder_date ? new Date(note.reminder_date) : undefined);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText("");
    setEditIsReminder(false);
    setEditReminderDate(undefined);
  };

  const handleUpdateNote = async (noteId: string) => {
    if (!editText.trim()) {
      toast({ title: "Missing Data", description: "Note text cannot be empty", variant: "destructive" });
      return;
    }

    if (editIsReminder && !editReminderDate) {
      toast({ title: "Missing Data", description: "Please select a reminder date", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase
        .from('coach_nutrition_notes')
        .update({
          note_text: editText.trim(),
          is_reminder: editIsReminder,
          reminder_date: editIsReminder && editReminderDate ? format(editReminderDate, 'yyyy-MM-dd') : null
        })
        .eq('id', noteId);

      if (error) throw error;

      toast({ title: "Success", description: "Note updated successfully" });
      handleCancelEdit();
      loadNotes();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm("Are you sure you want to delete this note?")) return;

    try {
      const { error } = await supabase
        .from('coach_nutrition_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;

      toast({ title: "Success", description: "Note deleted" });
      loadNotes();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const regularNotes = notes.filter(n => !n.is_reminder);
  const reminders = notes.filter(n => n.is_reminder);
  const upcomingReminders = reminders.filter(r => r.reminder_date && new Date(r.reminder_date) >= new Date());
  const pastReminders = reminders.filter(r => r.reminder_date && new Date(r.reminder_date) < new Date());

  const renderNoteCard = (note: any) => {
    const isEditing = editingId === note.id;
    const isPastReminder = note.is_reminder && note.reminder_date && new Date(note.reminder_date) < new Date();

    return (
      <Card key={note.id} className={cn(
        "transition-all",
        isPastReminder && "border-yellow-500/50 bg-yellow-500/5"
      )}>
        <CardContent className="pt-6 space-y-4">
          {isEditing ? (
            // Edit Mode
            <>
              <div className="space-y-2">
                <Label>Note Text</Label>
                <Textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={3}
                  placeholder="Enter your note..."
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editIsReminder}
                    onCheckedChange={setEditIsReminder}
                  />
                  <Label>Set as reminder</Label>
                </div>

                {editIsReminder && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {editReminderDate ? format(editReminderDate, 'PPP') : "Pick date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar
                        mode="single"
                        selected={editReminderDate}
                        onSelect={setEditReminderDate}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              <div className="flex gap-2">
                <Button onClick={() => handleUpdateNote(note.id)} disabled={loading} size="sm">
                  <Check className="h-4 w-4 mr-1" />
                  Save
                </Button>
                <Button onClick={handleCancelEdit} variant="outline" size="sm">
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            // View Mode
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    {note.is_reminder ? (
                      <Bell className="h-4 w-4 text-primary" />
                    ) : (
                      <StickyNote className="h-4 w-4 text-muted-foreground" />
                    )}
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(note.created_at), 'MMM dd, yyyy h:mm a')}
                    </p>
                    {note.is_reminder && note.reminder_date && (
                      <Badge variant={isPastReminder ? "destructive" : "secondary"} className="text-xs">
                        {isPastReminder ? "Overdue" : "Reminder"}: {format(new Date(note.reminder_date), 'MMM dd')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{note.note_text}</p>
                </div>

                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleStartEdit(note)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteNote(note.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Add New Note */}
      <Card>
        <CardHeader>
          <CardTitle>Add Note or Reminder</CardTitle>
          <CardDescription>Keep track of important information and set reminders for this client</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Note Text</Label>
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              placeholder="Enter your note or reminder..."
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                checked={isReminder}
                onCheckedChange={setIsReminder}
                id="reminder-switch"
              />
              <Label htmlFor="reminder-switch">Set as reminder</Label>
            </div>

            {isReminder && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn(!reminderDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {reminderDate ? format(reminderDate, 'PPP') : "Pick reminder date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={reminderDate}
                    onSelect={setReminderDate}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>

          <Button onClick={handleAddNote} disabled={loading} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add {isReminder ? 'Reminder' : 'Note'}
          </Button>
        </CardContent>
      </Card>

      {/* Notes List */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all">
            All Notes ({notes.length})
          </TabsTrigger>
          <TabsTrigger value="reminders">
            Reminders ({upcomingReminders.length})
          </TabsTrigger>
          <TabsTrigger value="notes">
            Notes ({regularNotes.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {notes.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">No notes or reminders yet</p>
              </CardContent>
            </Card>
          ) : (
            notes.map(renderNoteCard)
          )}
        </TabsContent>

        <TabsContent value="reminders" className="space-y-4">
          {upcomingReminders.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Upcoming Reminders</h3>
              {upcomingReminders.map(renderNoteCard)}
            </div>
          )}

          {pastReminders.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-yellow-600">Past Reminders</h3>
              {pastReminders.map(renderNoteCard)}
            </div>
          )}

          {reminders.length === 0 && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">No reminders set</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="notes" className="space-y-4">
          {regularNotes.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">No notes yet</p>
              </CardContent>
            </Card>
          ) : (
            regularNotes.map(renderNoteCard)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
