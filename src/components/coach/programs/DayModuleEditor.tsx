import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Plus, Trash2, CheckCircle, AlertCircle, User } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { EnhancedModuleExerciseEditor } from "./EnhancedModuleExerciseEditor";
import { Tables, Enums } from "@/integrations/supabase/types";
import { getMuscleDisplay } from "@/types/muscle-builder";

type DayModule = Tables<"day_modules">;

interface DayModuleEditorProps {
  dayId: string;
  modules: DayModule[];
  coachUserId: string;
  onModulesChange: (modules: DayModule[]) => void;
  focusModuleId?: string | null;
}

const MODULE_TYPES = [
  { value: "strength", label: "Strength Training" },
  { value: "cardio", label: "Cardio" },
  { value: "mobility", label: "Mobility" },
  { value: "physio", label: "Physiotherapy" },
  { value: "running", label: "Running" },
  { value: "warmup", label: "Warm-up" },
  { value: "cooldown", label: "Cool-down" },
];

interface CareTeamCoach {
  id: string;
  name: string;
  specialty: string;
}

export function DayModuleEditor({
  dayId,
  modules,
  coachUserId,
  onModulesChange,
  focusModuleId,
}: DayModuleEditorProps) {
  const [showAddModuleDialog, setShowAddModuleDialog] = useState(false);
  const [newModuleType, setNewModuleType] = useState("strength");
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [selectedOwnerId, setSelectedOwnerId] = useState(coachUserId);
  const [careTeamCoaches, setCareTeamCoaches] = useState<CareTeamCoach[]>([]);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const { toast } = useToast();

  const hasFocused = useRef(false);

  useEffect(() => {
    loadCareTeamCoaches();
  }, []);

  // Auto-expand module when focusModuleId is set
  useEffect(() => {
    if (focusModuleId && !hasFocused.current && modules.some(m => m.id === focusModuleId)) {
      hasFocused.current = true;
      setExpandedModule(focusModuleId);
    }
  }, [focusModuleId, modules]);

  const loadCareTeamCoaches = async () => {
    try {
      // For now, just list active coaches that could be assigned
      const { data, error } = await supabase
        .from("coaches")
        .select("user_id, first_name, last_name, specialties")
        .eq("status", "active")
        .limit(20);

      if (error) throw error;

      const coaches: CareTeamCoach[] = (data || []).map((coach) => ({
        id: coach.user_id,
        name: `${coach.first_name} ${coach.last_name || ""}`.trim(),
        specialty: (coach.specialties || [])[0] || "general",
      }));

      setCareTeamCoaches(coaches);
    } catch (error) {
      console.error("Error loading care team coaches:", error);
    }
  };

  const addModule = async () => {
    if (!newModuleTitle) {
      toast({
        title: "Validation Error",
        description: "Module title is required",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from("day_modules")
        .insert({
          program_template_day_id: dayId,
          module_owner_coach_id: selectedOwnerId,
          module_type: newModuleType,
          title: newModuleTitle,
          sort_order: modules.length + 1,
          status: "draft",
        })
        .select()
        .single();

      if (error) throw error;

      onModulesChange([...modules, data]);
      setShowAddModuleDialog(false);
      setNewModuleTitle("");
      setNewModuleType("strength");
      setSelectedOwnerId(coachUserId);
      setExpandedModule(data.id);

      toast({
        title: "Module added",
        description: "New module has been added to this day.",
      });
    } catch (error: any) {
      toast({
        title: "Error adding module",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  const updateModule = async (moduleId: string, updates: Partial<DayModule>) => {
    try {
      const { error } = await supabase
        .from("day_modules")
        .update(updates)
        .eq("id", moduleId);

      if (error) throw error;

      onModulesChange(
        modules.map((mod) => (mod.id === moduleId ? { ...mod, ...updates } : mod))
      );
    } catch (error: any) {
      toast({
        title: "Error updating module",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  const deleteModule = async (moduleId: string) => {
    try {
      const { error } = await supabase
        .from("day_modules")
        .delete()
        .eq("id", moduleId);

      if (error) throw error;

      onModulesChange(modules.filter((mod) => mod.id !== moduleId));

      toast({
        title: "Module deleted",
        description: "The module has been removed.",
      });
    } catch (error: any) {
      toast({
        title: "Error deleting module",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  const publishModule = async (moduleId: string) => {
    await updateModule(moduleId, { status: "published" });
    toast({
      title: "Module published",
      description: "The module is now available for assignment to clients.",
    });
  };

  const unpublishModule = async (moduleId: string) => {
    await updateModule(moduleId, { status: "draft" });
    toast({
      title: "Module unpublished",
      description: "The module is now in draft mode.",
    });
  };

  const getOwnerName = (ownerId: string) => {
    if (ownerId === coachUserId) return "You (Primary)";
    const coach = careTeamCoaches.find((c) => c.id === ownerId);
    return coach ? coach.name : "Unassigned";
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h4 className="font-medium">Modules</h4>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddModuleDialog(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Module
        </Button>
      </div>

      {modules.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground text-sm">
          No modules yet. Add a module to start building this day.
        </div>
      ) : (
        <div className="space-y-2">
          {modules.map((module) => (
            <Card
              key={module.id}
              className={`border-l-4 ${
                module.status === "published"
                  ? "border-l-green-500"
                  : "border-l-amber-500"
              }`}
            >
              <CardHeader className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Input
                        value={module.title}
                        onChange={(e) =>
                          updateModule(module.id, { title: e.target.value })
                        }
                        className="font-medium border-none bg-transparent p-0 h-auto focus-visible:ring-0 text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-xs capitalize">
                        {module.module_type}
                      </Badge>
                      {module.source_muscle_id && (() => {
                        const muscle = getMuscleDisplay(module.source_muscle_id);
                        return muscle ? (
                          <Badge
                            className="text-xs text-white"
                            style={{ backgroundColor: muscle.colorHex }}
                          >
                            {muscle.label}
                          </Badge>
                        ) : null;
                      })()}
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {getOwnerName(module.module_owner_coach_id)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {module.status === "published" ? (
                      <Badge variant="default">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Published
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Draft
                      </Badge>
                    )}
                    {module.status === "draft" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => publishModule(module.id)}
                      >
                        Publish
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => unpublishModule(module.id)}
                      >
                        Unpublish
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => deleteModule(module.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 pb-4 px-4">
                <Button
                  variant="link"
                  size="sm"
                  className="px-0 h-auto"
                  onClick={() =>
                    setExpandedModule(
                      expandedModule === module.id ? null : module.id
                    )
                  }
                >
                  {expandedModule === module.id
                    ? "Hide Exercises"
                    : "Show Exercises"}
                </Button>
                {expandedModule === module.id && (
                  <div className="mt-3">
                    <EnhancedModuleExerciseEditor
                      moduleId={module.id}
                      coachUserId={coachUserId}
                      sourceMuscleId={module.source_muscle_id}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Module Dialog */}
      <Dialog open={showAddModuleDialog} onOpenChange={setShowAddModuleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Module</DialogTitle>
            <DialogDescription>
              Create a new workout module for this day. You can assign it to
              yourself or a care team specialist.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Module Title *</Label>
              <Input
                value={newModuleTitle}
                onChange={(e) => setNewModuleTitle(e.target.value)}
                placeholder="e.g., Upper Body Strength"
              />
            </div>
            <div className="space-y-2">
              <Label>Module Type</Label>
              <Select value={newModuleType} onValueChange={setNewModuleType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODULE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Module Owner</Label>
              <Select value={selectedOwnerId} onValueChange={setSelectedOwnerId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={coachUserId}>You (Primary Coach)</SelectItem>
                  {careTeamCoaches
                    .filter((c) => c.id !== coachUserId)
                    .map((coach) => (
                      <SelectItem key={coach.id} value={coach.id}>
                        {coach.name} ({coach.specialty})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Only the module owner can edit exercises and respond to client messages.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModuleDialog(false)}>
              Cancel
            </Button>
            <Button onClick={addModule}>Add Module</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
