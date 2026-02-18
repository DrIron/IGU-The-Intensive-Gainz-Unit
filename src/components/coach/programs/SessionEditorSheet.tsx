import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Trash2, Loader2, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { EnhancedModuleExerciseEditor } from "./EnhancedModuleExerciseEditor";
import { SessionTypeSelector } from "./SessionTypeSelector";
import { getMuscleDisplay } from "@/types/muscle-builder";
import { SESSION_TYPES, type SessionType, type SessionTiming } from "@/types/workout-builder";

interface SessionEditorSheetProps {
  moduleId: string | null;
  coachUserId: string;
  programId: string;
  onClose: () => void;
  onSessionUpdated: () => void;
}

interface ModuleData {
  id: string;
  title: string;
  session_type: string | null;
  session_timing: string | null;
  status: string;
  source_muscle_id: string | null;
}

export function SessionEditorSheet({
  moduleId,
  coachUserId,
  programId,
  onClose,
  onSessionUpdated,
}: SessionEditorSheetProps) {
  const [module, setModule] = useState<ModuleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [deleting, setDeleting] = useState(false);
  const hasFetched = useRef(false);
  const { toast } = useToast();

  const loadModule = useCallback(async () => {
    if (!moduleId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("day_modules")
        .select("id, title, session_type, session_timing, status, source_muscle_id")
        .eq("id", moduleId)
        .single();

      if (error) throw error;
      setModule(data);
      setTitle(data.title);
    } catch (error: unknown) {
      toast({
        title: "Error loading session",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [moduleId, toast]);

  useEffect(() => {
    if (moduleId) {
      hasFetched.current = false;
      loadModule();
    } else {
      setModule(null);
    }
  }, [moduleId, loadModule]);

  const updateField = async (updates: Partial<ModuleData>) => {
    if (!moduleId) return;
    try {
      const { error } = await supabase
        .from("day_modules")
        .update(updates)
        .eq("id", moduleId);
      if (error) throw error;
      setModule((prev) => (prev ? { ...prev, ...updates } : prev));
    } catch (error: unknown) {
      toast({
        title: "Error updating session",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  const handleTitleBlur = () => {
    if (title.trim() && title !== module?.title) {
      updateField({ title: title.trim() });
    }
  };

  const toggleStatus = () => {
    const newStatus = module?.status === "published" ? "draft" : "published";
    updateField({ status: newStatus });
    onSessionUpdated();
  };

  const handleDelete = async () => {
    if (!moduleId) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("day_modules").delete().eq("id", moduleId);
      if (error) throw error;
      toast({ title: "Session deleted" });
      onClose();
      onSessionUpdated();
    } catch (error: unknown) {
      toast({
        title: "Error deleting session",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleSessionTypeChange = (type: SessionType) => {
    updateField({ session_type: type });
  };

  const handleSessionTimingChange = (timing: SessionTiming) => {
    updateField({ session_timing: timing });
  };

  const muscleDisplay = module?.source_muscle_id
    ? getMuscleDisplay(module.source_muscle_id)
    : null;

  const sessionTypeInfo = SESSION_TYPES.find((t) => t.value === module?.session_type);

  return (
    <Sheet open={!!moduleId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : module ? (
          <div className="flex flex-col h-full">
            {/* Header */}
            <SheetHeader className="p-4 border-b space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={handleTitleBlur}
                  className="text-lg font-bold border-none bg-transparent p-0 h-auto focus-visible:ring-0 flex-1"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleStatus}
                  className={module.status === "published" ? "text-green-500" : "text-muted-foreground"}
                >
                  {module.status === "published" ? (
                    <><Eye className="h-4 w-4 mr-1" /> Published</>
                  ) : (
                    <><EyeOff className="h-4 w-4 mr-1" /> Draft</>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </div>

              {/* Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                {sessionTypeInfo && (
                  <Badge variant="outline" className="text-xs">
                    <div className={`w-2 h-2 rounded-full mr-1.5 ${sessionTypeInfo.color}`} />
                    {sessionTypeInfo.label}
                  </Badge>
                )}
                {module.session_timing && module.session_timing !== "anytime" && (
                  <Badge variant="outline" className="text-xs capitalize">
                    {module.session_timing}
                  </Badge>
                )}
                {muscleDisplay && (
                  <Badge variant="outline" className="text-xs">
                    <div className={`w-2 h-2 rounded-full mr-1.5 ${muscleDisplay.colorClass}`} />
                    {muscleDisplay.label}
                  </Badge>
                )}
              </div>

              {/* Session type/timing selector (hidden for muscle-converted sessions) */}
              {!module.source_muscle_id && (
                <SessionTypeSelector
                  sessionType={(module.session_type as SessionType) || "strength"}
                  sessionTiming={(module.session_timing as SessionTiming) || "anytime"}
                  onSessionTypeChange={handleSessionTypeChange}
                  onSessionTimingChange={handleSessionTimingChange}
                />
              )}
            </SheetHeader>

            {/* Exercise editor */}
            <div className="flex-1 p-4 overflow-y-auto">
              <EnhancedModuleExerciseEditor
                moduleId={module.id}
                coachUserId={coachUserId}
                sourceMuscleId={module.source_muscle_id}
              />
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
