import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { ArrowLeft, Save, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
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
import { Enums } from "@/integrations/supabase/types";

interface ProgramMetadataHeaderProps {
  programId: string;
  coachUserId: string;
  onBack: () => void;
}

export function ProgramMetadataHeader({
  programId,
  coachUserId,
  onBack,
}: ProgramMetadataHeaderProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { toast } = useToast();

  const loadMetadata = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("program_templates")
        .select("title, description, level, tags")
        .eq("id", programId)
        .single();

      if (error) throw error;
      setTitle(data.title || "");
      setDescription(data.description || "");
      setLevel(data.level);
      setTags(data.tags || []);
      setLoaded(true);
    } catch (error: unknown) {
      toast({
        title: "Error loading program",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  }, [programId, toast]);

  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

  const save = async () => {
    if (!title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("program_templates")
        .update({ title, description, level, tags })
        .eq("id", programId);
      if (error) throw error;
      toast({ title: "Program saved" });
    } catch (error: unknown) {
      toast({
        title: "Error saving",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleTitleBlur = () => {
    if (loaded && title.trim()) save();
  };

  return (
    <div className="space-y-2">
      {/* Top row: Back + title + save */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          placeholder="Program title..."
          className="text-lg font-bold border-none bg-transparent p-0 h-auto focus-visible:ring-0 flex-1"
        />
        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="shrink-0 text-xs text-muted-foreground">
              {detailsOpen ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
              Details
            </Button>
          </CollapsibleTrigger>
        </Collapsible>
        <Button size="sm" onClick={save} disabled={saving} className="shrink-0">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          Save
        </Button>
      </div>

      {/* Collapsible details */}
      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <CollapsibleContent>
          <div className="p-4 rounded-lg border border-border/50 bg-muted/20 space-y-4">
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the program goals and structure..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Level</Label>
              <Select
                value={level || "none"}
                onValueChange={(value) =>
                  setLevel(value === "none" ? null : (value as Enums<"program_level">))
                }
              >
                <SelectTrigger className="w-48">
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
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Add a tag..."
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  className="flex-1"
                />
                <Button type="button" variant="secondary" size="sm" onClick={addTag}>
                  Add
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {tags.map((tag) => (
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
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
