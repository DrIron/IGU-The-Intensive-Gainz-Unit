import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Save, Trash2, GripVertical, ChevronDown, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DayModuleEditor } from "./DayModuleEditor";
import { Tables, Enums } from "@/integrations/supabase/types";

type ProgramTemplate = Tables<"program_templates">;
type ProgramTemplateDay = Tables<"program_template_days">;
type DayModule = Tables<"day_modules">;

interface ProgramEditorProps {
  coachUserId: string;
  programId?: string;
  onBack: () => void;
}

export function ProgramEditor({ coachUserId, programId, onBack }: ProgramEditorProps) {
  const [loading, setLoading] = useState(!!programId);
  const [saving, setSaving] = useState(false);
  const [program, setProgram] = useState<Partial<ProgramTemplate>>({
    title: "",
    description: "",
    level: null,
    tags: [],
    visibility: "private",
  });
  const [days, setDays] = useState<(ProgramTemplateDay & { day_modules: DayModule[] })[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState("");
  const { toast } = useToast();

  const loadProgram = useCallback(async () => {
    try {
      const { data: templateData, error: templateError } = await supabase
        .from("program_templates")
        .select("*")
        .eq("id", programId)
        .single();

      if (templateError) throw templateError;
      setProgram(templateData);

      const { data: daysData, error: daysError } = await supabase
        .from("program_template_days")
        .select(`
          *,
          day_modules(*)
        `)
        .eq("program_template_id", programId)
        .order("day_index");

      if (daysError) throw daysError;
      setDays(daysData || []);

      // Expand first day by default
      if (daysData && daysData.length > 0) {
        setExpandedDays(new Set([daysData[0].id]));
      }
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
    if (programId) {
      loadProgram();
    }
  }, [programId, loadProgram]);

  const saveProgram = async () => {
    if (!program.title) {
      toast({
        title: "Validation Error",
        description: "Program title is required",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      let templateId = programId;

      if (!templateId) {
        // Create new program
        const { data, error } = await supabase
          .from("program_templates")
          .insert({
            owner_coach_id: coachUserId,
            title: program.title,
            description: program.description,
            level: program.level,
            tags: program.tags,
            visibility: program.visibility || "private",
          })
          .select()
          .single();

        if (error) throw error;
        templateId = data.id;
      } else {
        // Update existing program
        const { error } = await supabase
          .from("program_templates")
          .update({
            title: program.title,
            description: program.description,
            level: program.level,
            tags: program.tags,
            visibility: program.visibility,
          })
          .eq("id", templateId);

        if (error) throw error;
      }

      toast({
        title: "Program saved",
        description: "Your program has been saved successfully.",
      });

      if (!programId) {
        onBack();
      }
    } catch (error: any) {
      toast({
        title: "Error saving program",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const addDay = async () => {
    if (!programId) {
      // Save program first if not saved yet
      if (!program.title) {
        toast({
          title: "Save program first",
          description: "Please save the program before adding days.",
          variant: "destructive",
        });
        return;
      }
      await saveProgram();
      return;
    }

    try {
      const newDayIndex = days.length + 1;
      const { data, error } = await supabase
        .from("program_template_days")
        .insert({
          program_template_id: programId,
          day_index: newDayIndex,
          day_title: `Day ${newDayIndex}`,
        })
        .select()
        .single();

      if (error) throw error;

      // Create default module for primary coach
      const { data: moduleData, error: moduleError } = await supabase
        .from("day_modules")
        .insert({
          program_template_day_id: data.id,
          module_owner_coach_id: coachUserId,
          module_type: "strength",
          title: "Primary Workout",
          sort_order: 1,
          status: "draft",
        })
        .select()
        .single();

      if (moduleError) throw moduleError;

      setDays([...days, { ...data, day_modules: [moduleData] }]);
      setExpandedDays((prev) => new Set([...prev, data.id]));

      toast({
        title: "Day added",
        description: `Day ${newDayIndex} has been added.`,
      });
    } catch (error: any) {
      toast({
        title: "Error adding day",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const updateDay = async (dayId: string, updates: Partial<ProgramTemplateDay>) => {
    try {
      const { error } = await supabase
        .from("program_template_days")
        .update(updates)
        .eq("id", dayId);

      if (error) throw error;

      setDays((prev) =>
        prev.map((day) => (day.id === dayId ? { ...day, ...updates } : day))
      );
    } catch (error: any) {
      toast({
        title: "Error updating day",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const deleteDay = async (dayId: string) => {
    try {
      const { error } = await supabase
        .from("program_template_days")
        .delete()
        .eq("id", dayId);

      if (error) throw error;

      setDays((prev) => prev.filter((day) => day.id !== dayId));

      toast({
        title: "Day deleted",
        description: "The day has been removed from the program.",
      });
    } catch (error: any) {
      toast({
        title: "Error deleting day",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const addTag = () => {
    if (tagInput && !(program.tags || []).includes(tagInput)) {
      setProgram((prev) => ({
        ...prev,
        tags: [...(prev.tags || []), tagInput],
      }));
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setProgram((prev) => ({
      ...prev,
      tags: (prev.tags || []).filter((t) => t !== tag),
    }));
  };

  const toggleDay = (dayId: string) => {
    setExpandedDays((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(dayId)) {
        newSet.delete(dayId);
      } else {
        newSet.add(dayId);
      }
      return newSet;
    });
  };

  const onModulesChange = (dayId: string, modules: DayModule[]) => {
    setDays((prev) =>
      prev.map((day) =>
        day.id === dayId ? { ...day, day_modules: modules } : day
      )
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-pulse text-muted-foreground">Loading program...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">
            {programId ? "Edit Program" : "Create Program"}
          </h2>
        </div>
        <Button onClick={saveProgram} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      {/* Program Details */}
      <Card>
        <CardHeader>
          <CardTitle>Program Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Program Title *</Label>
            <Input
              id="title"
              value={program.title || ""}
              onChange={(e) =>
                setProgram((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="e.g., 12-Week Strength Builder"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={program.description || ""}
              onChange={(e) =>
                setProgram((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Describe the program goals and structure..."
              rows={3}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Level</Label>
              <Select
                value={program.level || "none"}
                onValueChange={(value) =>
                  setProgram((prev) => ({
                    ...prev,
                    level: value === "none" ? null : value as Enums<"program_level">,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No level</SelectItem>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select
                value={program.visibility || "private"}
                onValueChange={(value) =>
                  setProgram((prev) => ({
                    ...prev,
                    visibility: value as Enums<"program_visibility">,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="shared">Shared with team</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Add a tag..."
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
              />
              <Button type="button" variant="secondary" onClick={addTag}>
                Add
              </Button>
            </div>
            {(program.tags || []).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {(program.tags || []).map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => removeTag(tag)}
                  >
                    {tag} ×
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Days */}
      {programId && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Program Days</h3>
            <Button onClick={addDay} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add Day
            </Button>
          </div>

          {days.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground mb-4">No days added yet</p>
                <Button onClick={addDay}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Day
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {days.map((day, index) => (
                <Collapsible
                  key={day.id}
                  open={expandedDays.has(day.id)}
                  onOpenChange={() => toggleDay(day.id)}
                >
                  <Card>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                          {expandedDays.has(day.id) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <div className="flex-1">
                            <Input
                              value={day.day_title}
                              onChange={(e) => {
                                e.stopPropagation();
                                updateDay(day.id, { day_title: e.target.value });
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium border-none bg-transparent p-0 h-auto focus-visible:ring-0"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {day.day_modules?.length || 0} modules
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteDay(day.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Day Notes</Label>
                            <Textarea
                              value={day.notes || ""}
                              onChange={(e) =>
                                updateDay(day.id, { notes: e.target.value })
                              }
                              placeholder="Add notes for this day..."
                              rows={2}
                            />
                          </div>
                          <DayModuleEditor
                            dayId={day.id}
                            modules={day.day_modules || []}
                            coachUserId={coachUserId}
                            onModulesChange={(modules) => onModulesChange(day.id, modules)}
                          />
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
            </div>
          )}
        </div>
      )}

      {!programId && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              Save the program first to start adding days and exercises.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
