import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Video, Clock, CheckCircle2, GripVertical } from "lucide-react";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

interface ContentItem {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  duration_minutes: number;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  // Computed
  completion_count?: number;
}

interface ContentFormData {
  title: string;
  description: string;
  video_url: string;
  duration_minutes: number;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
}

const EMPTY_FORM: ContentFormData = {
  title: "",
  description: "",
  video_url: "",
  duration_minutes: 10,
  is_required: true,
  sort_order: 0,
  is_active: true,
};

export function CoachEducationalContentManager() {
  const { toast } = useToast();
  const [content, setContent] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ContentFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const hasFetched = useRef(false);

  const loadContent = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch content
      const { data, error } = await supabase
        .from("coach_educational_content")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) throw error;

      // Fetch completion counts
      const { data: completions } = await supabase
        .from("coach_content_completions")
        .select("content_id");

      const countMap = new Map<string, number>();
      if (completions) {
        for (const c of completions) {
          countMap.set(c.content_id, (countMap.get(c.content_id) || 0) + 1);
        }
      }

      const enriched: ContentItem[] = (data || []).map((item) => ({
        ...item,
        completion_count: countMap.get(item.id) || 0,
      }));

      setContent(enriched);
    } catch (error: unknown) {
      console.error("Error loading content:", error);
      toast({
        title: "Error",
        description: "Failed to load training content",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadContent();
  }, [loadContent]);

  const openAddDialog = () => {
    setEditingId(null);
    setFormData({
      ...EMPTY_FORM,
      sort_order: content.length,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (item: ContentItem) => {
    setEditingId(item.id);
    setFormData({
      title: item.title,
      description: item.description || "",
      video_url: item.video_url,
      duration_minutes: item.duration_minutes,
      is_required: item.is_required,
      sort_order: item.sort_order,
      is_active: item.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim() || !formData.video_url.trim()) {
      toast({ title: "Validation", description: "Title and video URL are required.", variant: "destructive" });
      return;
    }

    try {
      setSaving(true);
      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        video_url: formData.video_url.trim(),
        duration_minutes: formData.duration_minutes,
        is_required: formData.is_required,
        sort_order: formData.sort_order,
        is_active: formData.is_active,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error } = await supabase
          .from("coach_educational_content")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        toast({ title: "Updated", description: "Training content updated." });
      } else {
        const { error } = await supabase
          .from("coach_educational_content")
          .insert(payload);
        if (error) throw error;
        toast({ title: "Created", description: "Training content added." });
      }

      setDialogOpen(false);
      hasFetched.current = false;
      loadContent();
    } catch (error: unknown) {
      console.error("Error saving content:", error);
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("coach_educational_content")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast({ title: "Deleted", description: "Training content removed." });
      hasFetched.current = false;
      loadContent();
    } catch (error: unknown) {
      console.error("Error deleting content:", error);
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    }
  };

  const requiredCount = content.filter((c) => c.is_required && c.is_active).length;
  const totalMinutes = content
    .filter((c) => c.is_required && c.is_active)
    .reduce((sum, c) => sum + c.duration_minutes, 0);

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">Loading training content...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Coach Training Content</CardTitle>
              <CardDescription>
                Manage required and optional training videos for new coaches.{" "}
                {requiredCount} required videos ({totalMinutes} min total).
              </CardDescription>
            </div>
            <Button onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Content
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {content.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No training content yet. Add videos above.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-24">Duration</TableHead>
                  <TableHead className="w-24">Required</TableHead>
                  <TableHead className="w-24">Active</TableHead>
                  <TableHead className="w-28">Completions</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {content.map((item) => (
                  <TableRow key={item.id} className={!item.is_active ? "opacity-50" : ""}>
                    <TableCell className="text-muted-foreground">{item.sort_order + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Video className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{item.title}</p>
                          {item.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        {item.duration_minutes}m
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.is_required ? (
                        <Badge variant="default" className="text-xs">Required</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Optional</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.is_active ? (
                        <Badge className="text-xs bg-green-600">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        {item.completion_count}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(item)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Training Content" : "Add Training Content"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update the training video details." : "Add a new training video for coaches."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., IGU Coaching Standards"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this training module..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Video URL *</Label>
              <Input
                type="url"
                value={formData.video_url}
                onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.duration_minutes}
                  onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is-required">Required for activation</Label>
              <Switch
                id="is-required"
                checked={formData.is_required}
                onCheckedChange={(checked) => setFormData({ ...formData, is_required: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is-active">Active (visible to coaches)</Label>
              <Switch
                id="is-active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update" : "Add Content"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
