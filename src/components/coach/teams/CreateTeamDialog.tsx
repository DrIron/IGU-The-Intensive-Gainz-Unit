import { useState, useEffect, useCallback, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CreateTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coachUserId: string;
  existingTeamCount: number;
  onCreated: () => void;
  editTeam?: {
    id: string;
    name: string;
    description: string;
    tags: string[];
    max_members: number;
  };
}

const MAX_TEAMS = 3;

export const CreateTeamDialog = memo(function CreateTeamDialog({
  open,
  onOpenChange,
  coachUserId,
  existingTeamCount,
  onCreated,
  editTeam,
}: CreateTeamDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [maxMembers, setMaxMembers] = useState(30);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      if (editTeam) {
        setName(editTeam.name);
        setDescription(editTeam.description);
        setTags(editTeam.tags);
        setMaxMembers(editTeam.max_members);
      } else {
        setName("");
        setDescription("");
        setTags([]);
        setMaxMembers(30);
      }
      setTagInput("");
    }
  }, [open, editTeam]);

  const addTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput("");
  }, [tagInput, tags]);

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addTag();
      }
    },
    [addTag]
  );

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }

    if (!editTeam && existingTeamCount >= MAX_TEAMS) {
      toast({
        title: "Team limit reached",
        description: `You can have a maximum of ${MAX_TEAMS} teams.`,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      if (editTeam) {
        const { error } = await supabase
          .from("coach_teams")
          .update({
            name: name.trim(),
            description: description.trim() || null,
            tags,
            max_members: maxMembers,
          })
          .eq("id", editTeam.id);

        if (error) throw error;
        toast({ title: "Team updated" });
      } else {
        const { error } = await supabase.from("coach_teams").insert({
          coach_id: coachUserId,
          name: name.trim(),
          description: description.trim() || null,
          tags,
          max_members: maxMembers,
        });

        if (error) throw error;
        toast({ title: "Team created" });
      }

      onCreated();
    } catch (error: any) {
      toast({
        title: editTeam ? "Error updating team" : "Error creating team",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const isEdit = !!editTeam;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Team" : "Create Team"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update your team details."
              : "Create a new team for your clients."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Team Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Hypertrophy Squad"
            />
          </div>

          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this team..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="e.g., Hypertrophy"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addTag}
                disabled={!tagInput.trim()}
              >
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="ml-0.5 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Tags help clients find your team (e.g., Hypertrophy, Lower Body, Strength)
            </p>
          </div>

          <div className="space-y-2">
            <Label>Max Members</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={maxMembers}
              onChange={(e) => setMaxMembers(parseInt(e.target.value) || 30)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isEdit ? "Saving..." : "Creating..."}
              </>
            ) : isEdit ? (
              "Save Changes"
            ) : (
              "Create Team"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
