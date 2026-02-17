import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Plus, Trash2, Upload, CheckCircle2, Loader2 } from "lucide-react";

interface QuickExercise {
  id: string;
  name: string;
  youtube_url: string;
  primary_muscle: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  status: "pending" | "saving" | "saved" | "error";
  error?: string;
}

const MUSCLE_GROUPS = [
  "Pecs", "Lats", "Mid-back", "Upper Back", "Shoulders",
  "Quads", "Hamstrings", "Glutes", "Calves", "Adductors", "Abductors",
  "Hip Flexors", "Elbow Flexors", "Triceps", "Forearm", "Core", "Neck"
];

export function ExerciseQuickAdd() {
  const { toast } = useToast();
  const [exercises, setExercises] = useState<QuickExercise[]>([
    { id: crypto.randomUUID(), name: "", youtube_url: "", primary_muscle: "", difficulty: "Intermediate", status: "pending" }
  ]);
  const [bulkInput, setBulkInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const addRow = () => {
    setExercises(prev => [...prev, {
      id: crypto.randomUUID(),
      name: "",
      youtube_url: "",
      primary_muscle: "",
      difficulty: "Intermediate",
      status: "pending"
    }]);
  };

  const removeRow = (id: string) => {
    setExercises(prev => prev.filter(e => e.id !== id));
  };

  const updateExercise = (id: string, field: keyof QuickExercise, value: string) => {
    setExercises(prev => prev.map(e =>
      e.id === id ? { ...e, [field]: value, status: "pending" as const } : e
    ));
  };

  // Parse bulk input (one URL per line, optionally with name)
  const parseBulkInput = () => {
    const lines = bulkInput.trim().split("\n").filter(line => line.trim());
    const newExercises: QuickExercise[] = lines.map(line => {
      // Format: "Exercise Name | YouTube URL" or just "YouTube URL"
      const parts = line.split("|").map(p => p.trim());
      const hasName = parts.length > 1;
      const name = hasName ? parts[0] : "";
      const url = hasName ? parts[1] : parts[0];

      return {
        id: crypto.randomUUID(),
        name,
        youtube_url: url,
        primary_muscle: "",
        difficulty: "Intermediate" as const,
        status: "pending" as const
      };
    });

    setExercises(prev => [...prev.filter(e => e.name || e.youtube_url), ...newExercises]);
    setBulkInput("");
    toast({
      title: "Imported",
      description: `Added ${newExercises.length} exercises to the list`,
    });
  };

  const saveAll = async () => {
    const validExercises = exercises.filter(e => e.name && e.youtube_url && e.primary_muscle);

    if (validExercises.length === 0) {
      toast({
        title: "Nothing to save",
        description: "Add at least one exercise with name, URL, and muscle group",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);

    try {
      const authResult = await supabase.auth.getUser();
      const user = authResult.data?.user;
      if (!user) {
        toast({
          title: "Not authenticated",
          description: "You must be logged in to add exercises",
          variant: "destructive"
        });
        return;
      }

      for (const exercise of validExercises) {
        setExercises(prev => prev.map(e =>
          e.id === exercise.id ? { ...e, status: "saving" as const } : e
        ));

        try {
          const { error } = await supabase
            .from("exercises")
            .insert({
              name: exercise.name,
              youtube_url: exercise.youtube_url,
              muscle_groups: [exercise.primary_muscle],
              muscle_subdivisions: { [exercise.primary_muscle]: [] },
              difficulty: exercise.difficulty,
              setup_instructions: [],
              execution_instructions: [],
              pitfalls: [],
              created_by: user.id
            });

          if (error) throw error;

          setExercises(prev => prev.map(e =>
            e.id === exercise.id ? { ...e, status: "saved" as const } : e
          ));
        } catch (error: unknown) {
          const errorMessage = sanitizeErrorForUser(error);
          console.error("Error saving exercise:", error);
          setExercises(prev => prev.map(e =>
            e.id === exercise.id ? { ...e, status: "error" as const, error: errorMessage } : e
          ));
        }
      }

      const savedCount = exercises.filter(e => e.status === "saved").length;
      toast({
        title: "Saved",
        description: `${savedCount} exercises added to the library`,
      });
    } catch (err) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(err),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const clearSaved = () => {
    setExercises(prev => prev.filter(e => e.status !== "saved"));
  };

  const pendingCount = exercises.filter(e => e.status === "pending" && e.name && e.youtube_url && e.primary_muscle).length;
  const savedCount = exercises.filter(e => e.status === "saved").length;

  return (
    <div className="space-y-6">
      {/* Bulk Import Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Bulk Import
          </CardTitle>
          <CardDescription>
            Paste YouTube URLs (one per line). Optionally add names: "Exercise Name | URL"
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder={`Barbell Bench Press | https://youtube.com/watch?v=xxx
https://youtube.com/watch?v=yyy
Squat Variation | https://youtu.be/zzz`}
            value={bulkInput}
            onChange={(e) => setBulkInput(e.target.value)}
            rows={4}
          />
          <Button onClick={parseBulkInput} disabled={!bulkInput.trim()}>
            <Plus className="h-4 w-4 mr-2" />
            Add to List
          </Button>
        </CardContent>
      </Card>

      {/* Exercise List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Exercise List</CardTitle>
              <CardDescription>
                {pendingCount} ready to save • {savedCount} saved
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {savedCount > 0 && (
                <Button variant="outline" size="sm" onClick={clearSaved}>
                  Clear Saved
                </Button>
              )}
              <Button onClick={saveAll} disabled={isSaving || pendingCount === 0}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Save All ({pendingCount})
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {exercises.map((exercise) => (
              <div
                key={exercise.id}
                className={`flex flex-col gap-2 p-3 rounded-lg border md:grid md:grid-cols-12 md:gap-2 md:items-center ${
                  exercise.status === "saved" ? "bg-green-50 border-green-200 dark:bg-green-950/20" :
                  exercise.status === "error" ? "bg-red-50 border-red-200 dark:bg-red-950/20" :
                  "bg-muted/30"
                }`}
              >
                <div className="md:col-span-3">
                  <Label className="text-xs text-muted-foreground md:hidden">Exercise Name</Label>
                  <Input
                    placeholder="Exercise name"
                    value={exercise.name}
                    onChange={(e) => updateExercise(exercise.id, "name", e.target.value)}
                    disabled={exercise.status === "saved"}
                  />
                </div>
                <div className="md:col-span-3">
                  <Label className="text-xs text-muted-foreground md:hidden">YouTube URL</Label>
                  <Input
                    placeholder="YouTube URL"
                    value={exercise.youtube_url}
                    onChange={(e) => updateExercise(exercise.id, "youtube_url", e.target.value)}
                    disabled={exercise.status === "saved"}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 md:contents">
                  <div className="md:col-span-2">
                    <Label className="text-xs text-muted-foreground md:hidden">Muscle Group</Label>
                    <Select
                      value={exercise.primary_muscle}
                      onValueChange={(v) => updateExercise(exercise.id, "primary_muscle", v)}
                      disabled={exercise.status === "saved"}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Muscle" />
                      </SelectTrigger>
                      <SelectContent>
                        {MUSCLE_GROUPS.map(muscle => (
                          <SelectItem key={muscle} value={muscle}>{muscle}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs text-muted-foreground md:hidden">Difficulty</Label>
                    <Select
                      value={exercise.difficulty}
                      onValueChange={(v) => updateExercise(exercise.id, "difficulty", v as QuickExercise["difficulty"])}
                      disabled={exercise.status === "saved"}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Beginner">Beginner</SelectItem>
                        <SelectItem value="Intermediate">Intermediate</SelectItem>
                        <SelectItem value="Advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="md:col-span-2 flex items-center justify-end gap-2">
                  {exercise.status === "saved" && (
                    <Badge variant="default" className="bg-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Saved
                    </Badge>
                  )}
                  {exercise.status === "saving" && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {exercise.status === "error" && (
                    <Badge variant="destructive">Error</Badge>
                  )}
                  {exercise.status !== "saved" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRow(exercise.id)}
                      disabled={exercises.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <Button variant="outline" className="w-full mt-4" onClick={addRow}>
            <Plus className="h-4 w-4 mr-2" />
            Add Row
          </Button>
        </CardContent>
      </Card>

      {/* Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tips</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• You can add detailed instructions (setup, execution, pitfalls) later by editing each exercise</p>
          <p>• Supported YouTube formats: youtube.com/watch?v=xxx, youtu.be/xxx</p>
          <p>• Muscle subdivisions can be added when editing individual exercises</p>
        </CardContent>
      </Card>
    </div>
  );
}
